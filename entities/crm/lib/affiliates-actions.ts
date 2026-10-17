"use server";

import { selectAffiliateCommissions } from "@/entities/billing";
import { revalidatePath } from "next/cache";
import { revalidateSurfaces } from "@/kernel/shell/surface";
import { supabase, companyOs } from "@/kernel/data/supabase";
import { selectAffiliates, insertAffiliates, updateAffiliates } from "@/entities/contacts";
import { selectPersonCompanies } from "@/entities/contacts";
import { holdsSurfaceAdmin } from "@/kernel/identity/access-of-person";
import { requirePermission } from "@/kernel/identity/access-request";
import { recordAudit } from "@/kernel/audit/audit";
import { getAffiliate360, generateAffiliateCode, WORK_CREDIT_RATE, CASH_RATE, type Affiliate360, type AffiliateIdentity } from "@/entities/crm/lib/affiliates";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { updateAffiliateCommissions } from "@/entities/billing";
import { insertPortalMembers, updatePeople } from "@/kernel/identity/writes";
import { SIGN_IN_LINK_WITHHELD } from "@/kernel/messaging/sign-in-links";

// Server actions for the affiliate program. Activation/deactivation is invoked
// from the Companies shelf (per contact) and from the Affiliates shelf; the
// redemption + invite actions live on the Affiliates shelf. All gated by
// requirePermission("crm.pipeline").

type Result = { ok: true; message: string } | { ok: false; error: string };

function revalidate(personId?: string) {
  revalidateSurfaces("/revenue/affiliates");
  revalidateSurfaces("/revenue/companies");
  if (personId) revalidatePath(`/admin/contacts/${personId}`);
}

function revalidateCompany(companyId: string, personId?: string) {
  revalidateSurfaces("/revenue/affiliates");
  revalidateSurfaces("/revenue/companies");
  revalidateSurfaces(`/revenue/companies/${companyId}`);
  if (personId) revalidatePath(`/admin/contacts/${personId}`);
}

// The company's portal / redemption contact: its is_primary person, else the
// first non-archived linked person.
async function primaryContactOfCompany(
  companyId: string,
): Promise<{ id: string; full_name: string | null; email: string | null } | null> {
  const { data, error: linksErr } = await selectPersonCompanies("is_primary, people(id, full_name, email, archived_at)")
    .eq("company_id", companyId);
  if (linksErr) console.error("[company-os/crm] person_companies", linksErr);
  type P = { id: string; full_name: string | null; email: string | null; archived_at: string | null };
  const candidates = ((data ?? []) as Array<{ is_primary: boolean | null; people: P | P[] | null }>)
    .map((r) => ({ isPrimary: !!r.is_primary, person: Array.isArray(r.people) ? r.people[0] ?? null : r.people }))
    .filter((c): c is { isPrimary: boolean; person: P } => !!c.person && !c.person.archived_at);
  const chosen = candidates.find((c) => c.isPrimary) ?? candidates[0];
  return chosen ? { id: chosen.person.id, full_name: chosen.person.full_name, email: chosen.person.email } : null;
}

export async function getAffiliateShelf(identity: AffiliateIdentity): Promise<Affiliate360 | null> {
  await requirePermission("crm.pipeline");
  return getAffiliate360(identity);
}

// Pre-authorize an affiliate for the client portal without sending anything:
// an allowlist row is inert until an auth user is minted (sendAffiliateInvite).
// Company-scoped when a company is known (or the person is linked to one, prefer
// the is_primary link), else company-less (Referrals-only). No-ops if a
// membership already exists.
async function ensurePortalAllowlist(personId: string, invitedBy: string, companyId?: string | null): Promise<void> {
  const { data: existing, error: existingErr } = await companyOs
    .from("portal_members")
    .select("id")
    .eq("person_id", personId)
    .limit(1);
  if (existingErr) {
    console.error("[company-os/crm] portal_members", existingErr);
    return;
  }
  if ((existing ?? []).length > 0) return;

  let cid = companyId ?? null;
  if (!cid) {
    const { data: link, error: linkErr } = await selectPersonCompanies("company_id, is_primary")
      .eq("person_id", personId)
      .not("company_id", "is", null)
      .order("is_primary", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (linkErr) console.error("[company-os/crm] person_companies", linkErr);
    cid = (link?.company_id as string | null) ?? null;
  }

  await insertPortalMembers({
    person_id: personId,
    company_id: cid,
    role: cid ? "member" : "affiliate",
    invited_by: invitedBy,
  });
}

// Make a person an affiliate: reactivate an existing (deactivated) code, or
// mint a new one from their name. Also pre-authorizes portal access (held).
export async function activateAffiliate(personId: string, code?: string): Promise<Result> {
  const { user: admin } = await requirePermission("crm.pipeline");
  if (!personId) return { ok: false, error: "Missing person." };

  const { data: person, error: personErr } = await companyOs
    .from("people")
    .select("id, full_name, email, archived_at")
    .eq("id", personId)
    .maybeSingle();
  if (personErr) return { ok: false, error: personErr.message };
  if (!person) return { ok: false, error: "Person not found." };
  if (person.archived_at) return { ok: false, error: "This person is archived." };

  const { data: codes, error: codesErr } = await selectAffiliates("id, code, active")
    .eq("person_id", personId);
  if (codesErr) return { ok: false, error: codesErr.message };
  const rows = (codes ?? []) as Array<{ id: string; code: string; active: boolean | null }>;

  if (rows.some((r) => r.active)) return { ok: false, error: "Already an active affiliate." };

  let message: string;
  if (rows.length > 0) {
    // Reactivate the most recent code rather than minting a duplicate.
    const target = rows[rows.length - 1];
    const { error } = await updateAffiliates({ active: true, updated_at: new Date().toISOString() })
      .eq("id", target.id);
    if (error) return { ok: false, error: `Could not reactivate code: ${error.message}` };
    message = `Affiliate reactivated (code ${target.code}).`;
  } else {
    const newCode = (code?.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") || "") || (await generateAffiliateCode(person.full_name as string | null, person.email as string));
    const { error } = await insertAffiliates({ code: newCode, person_id: personId, program_type: "commission", rate: WORK_CREDIT_RATE, active: true });
    if (error) return { ok: false, error: `Could not create code: ${error.message}` };
    message = `Affiliate activated (code ${newCode}).`;
  }

  // Every affiliate gets portal access (invite held until explicitly sent).
  const email = ((person.email as string | null) ?? "").trim().toLowerCase();
  if (email && !(await holdsSurfaceAdmin(email))) {
    await ensurePortalAllowlist(personId, admin.email);
  }

  await recordAudit({
    table: "affiliates",
    recordId: null,
    operation: "update",
    actor: admin.email,
    context: { action: "affiliate_activate", person_id: personId },
  });
  revalidate(personId);
  return { ok: true, message };
}

export async function deactivateAffiliate(personId: string): Promise<Result> {
  const { user: admin } = await requirePermission("crm.pipeline");
  if (!personId) return { ok: false, error: "Missing person." };

  const { data, error } = await updateAffiliates({ active: false, updated_at: new Date().toISOString() })
    .eq("person_id", personId)
    .eq("active", true)
    .select("id");
  if (error) return { ok: false, error: `Could not deactivate: ${error.message}` };
  if ((data ?? []).length === 0) return { ok: false, error: "No active code to deactivate." };

  await recordAudit({
    table: "affiliates",
    recordId: null,
    operation: "update",
    actor: admin.email,
    context: { action: "affiliate_deactivate", person_id: personId },
  });
  revalidate(personId);
  return { ok: true, message: "Affiliate deactivated. Codes and history are kept." };
}

// Record (or change) how a commission is redeemed. Admin-side mirror of the
// affiliate's own portal choice, for affiliates who haven't logged in. Locked
// once the commission has been paid out.
export async function setCommissionRedemption(commissionId: string, choice: "work_credit" | "cash"): Promise<Result> {
  const { user: admin } = await requirePermission("crm.pipeline");
  if (choice !== "work_credit" && choice !== "cash") return { ok: false, error: "Invalid choice." };

  const { data: comm, error: commErr } = await selectAffiliateCommissions("id, gross_cents, payout_id")
    .eq("id", commissionId)
    .maybeSingle();
  if (commErr) return { ok: false, error: commErr.message };
  if (!comm) return { ok: false, error: "Commission not found." };
  if (comm.payout_id) return { ok: false, error: "Already paid out — redemption is locked." };

  const rate = choice === "work_credit" ? WORK_CREDIT_RATE : CASH_RATE;
  const commissionCents = Math.round((comm.gross_cents as number) * rate);
  const { error } = await updateAffiliateCommissions({ redemption_choice: choice, rate, commission_cents: commissionCents, chosen_at: new Date().toISOString() })
    .eq("id", commissionId);
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    table: "affiliate_commissions",
    recordId: commissionId,
    operation: "update",
    actor: admin.email,
    context: { action: "commission_redemption", choice },
  });
  revalidate();
  return { ok: true, message: choice === "work_credit" ? "Recorded as 20% work credit." : "Recorded as 10% cash." };
}

// Send the portal invite to an affiliate (mints/reuses their Supabase auth user
// and emails a sign-in link). Held until an admin explicitly triggers it — this
// is the one action here that sends an external email.
export async function sendAffiliateInvite(personId: string): Promise<Result> {
  const { user: admin } = await requirePermission("crm.pipeline");

  const { data: person, error: invitePersonErr } = await companyOs
    .from("people")
    .select("id, email, auth_user_id, archived_at")
    .eq("id", personId)
    .maybeSingle();
  if (invitePersonErr) return { ok: false, error: invitePersonErr.message };
  if (!person) return { ok: false, error: "Person not found." };
  if (person.archived_at) return { ok: false, error: "This person is archived." };
  const email = ((person.email as string | null) ?? "").trim().toLowerCase();
  if (!email || email.endsWith("@edge8.local")) return { ok: false, error: "This person has no real email on file." };
  if (await holdsSurfaceAdmin(email)) return { ok: false, error: "Admins use /admin, not the portal." };

  await ensurePortalAllowlist(personId, admin.email);

  let message = "Invite sent.";
  const existingAuth = person.auth_user_id as string | null;
  if (existingAuth) {
    const { data, error } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: `${await getSiteOrigin()}/portal/callback` },
    });
    if (error || !data?.properties?.action_link) return { ok: false, error: error?.message ?? "Could not generate link." };
    // Account already exists — email a fresh sign-in link.
    const { sendTransactionalEmail } = await import("@/kernel/messaging/email");
    const intro = "<p>Here is your sign-in link for the 8 Edges Client Portal:</p>";
    await sendTransactionalEmail({
      to: email,
      subject: "Your 8 Edges Client Portal sign-in link",
      html: `${intro}<p><a href="${data.properties.action_link}">Sign in</a></p>`,
      // The log gets the same email with the link left out (B.15).
      logBody: `${intro}${SIGN_IN_LINK_WITHHELD}`,
    });
    message = "Sign-in link sent (account already existed).";
  } else {
    const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${await getSiteOrigin()}/portal/callback`,
    });
    if (error || !data?.user) return { ok: false, error: error?.message ?? "Invite failed to send." };
    const { error: upErr } = await updatePeople({ auth_user_id: data.user.id }).eq("id", personId);
    if (upErr) return { ok: false, error: `Auth user ready but linking failed: ${upErr.message}` };
  }

  await recordAudit({
    table: "portal_members",
    recordId: null,
    operation: "update",
    actor: admin.email,
    context: { action: "affiliate_portal_invite", person_id: personId },
  });
  revalidate(personId);
  return { ok: true, message };
}

// --- Company affiliates -----------------------------------------------------
// A company affiliate holds the code and the work credit; its is_primary contact
// is the portal / redemption person. Mirrors the person actions above, keyed on
// company_id.

// Make a company an affiliate: reactivate an existing (deactivated) company code
// or mint a new one from the company name. Pre-authorizes the primary contact's
// portal access (held until invited).
export async function activateCompanyAffiliate(companyId: string, code?: string): Promise<Result> {
  const { user: admin } = await requirePermission("crm.pipeline");
  if (!companyId) return { ok: false, error: "Missing company." };

  const { data: company, error: companyErr } = await companyOs
    .from("companies")
    .select("id, name, archived_at")
    .eq("id", companyId)
    .maybeSingle();
  if (companyErr) return { ok: false, error: companyErr.message };
  if (!company) return { ok: false, error: "Company not found." };
  if (company.archived_at) return { ok: false, error: "This company is archived." };

  const { data: codes, error: companyCodesErr } = await selectAffiliates("id, code, active")
    .eq("company_id", companyId);
  if (companyCodesErr) return { ok: false, error: companyCodesErr.message };
  const rows = (codes ?? []) as Array<{ id: string; code: string; active: boolean | null }>;

  if (rows.some((r) => r.active)) return { ok: false, error: "This company is already an active affiliate." };

  let message: string;
  if (rows.length > 0) {
    const target = rows[rows.length - 1];
    const { error } = await updateAffiliates({ active: true, updated_at: new Date().toISOString() })
      .eq("id", target.id);
    if (error) return { ok: false, error: `Could not reactivate code: ${error.message}` };
    message = `Affiliate reactivated (code ${target.code}).`;
  } else {
    const newCode = (code?.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") || "") || (await generateAffiliateCode(company.name as string | null, ""));
    const { error } = await insertAffiliates({ code: newCode, company_id: companyId, program_type: "commission", rate: WORK_CREDIT_RATE, active: true });
    if (error) return { ok: false, error: `Could not create code: ${error.message}` };
    message = `Affiliate activated (code ${newCode}).`;
  }

  // Portal access for the company's primary contact (invite held until sent).
  const contact = await primaryContactOfCompany(companyId);
  const contactEmail = (contact?.email ?? "").trim().toLowerCase();
  if (contact && contactEmail && !contactEmail.endsWith("@edge8.local") && !(await holdsSurfaceAdmin(contactEmail))) {
    await ensurePortalAllowlist(contact.id, admin.email, companyId);
  }

  await recordAudit({
    table: "affiliates",
    recordId: null,
    operation: "update",
    actor: admin.email,
    context: { action: "affiliate_activate", company_id: companyId },
  });
  revalidateCompany(companyId, contact?.id);
  return { ok: true, message };
}

export async function deactivateCompanyAffiliate(companyId: string): Promise<Result> {
  const { user: admin } = await requirePermission("crm.pipeline");
  if (!companyId) return { ok: false, error: "Missing company." };

  const { data, error } = await updateAffiliates({ active: false, updated_at: new Date().toISOString() })
    .eq("company_id", companyId)
    .eq("active", true)
    .select("id");
  if (error) return { ok: false, error: `Could not deactivate: ${error.message}` };
  if ((data ?? []).length === 0) return { ok: false, error: "No active code to deactivate." };

  await recordAudit({
    table: "affiliates",
    recordId: null,
    operation: "update",
    actor: admin.email,
    context: { action: "affiliate_deactivate", company_id: companyId },
  });
  revalidateCompany(companyId);
  return { ok: true, message: "Affiliate deactivated. Codes and history are kept." };
}

// Send the portal invite to a company affiliate's primary contact.
export async function sendCompanyAffiliateInvite(companyId: string): Promise<Result> {
  await requirePermission("crm.pipeline");
  const contact = await primaryContactOfCompany(companyId);
  if (!contact) return { ok: false, error: "This company has no linked contact to invite." };
  return sendAffiliateInvite(contact.id);
}
