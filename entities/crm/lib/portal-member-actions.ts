"use server";

import { revalidatePath } from "next/cache";
import { revalidateSurfaces } from "@/kernel/shell/surface";
import { requirePermission } from "@/kernel/identity/access-request";
import { recordAudit } from "@/kernel/audit/audit";
import {
  invitePortalMemberCore,
  resendPortalLinkCore,
  revokePortalMemberCore,
  setTempPasswordCore,
  type TempPasswordResult,
} from "@/entities/crm/lib/portal-invite";
import { updatePeople, updatePortalMembers } from "@/kernel/identity/writes";
import { companyOs } from "@/kernel/data/supabase";
import { personName } from "@/kernel/config/people-name";
import { z } from "zod";
import { escapeLikeLiteral } from "@/kernel/data/postgrest-filter";

// Client-portal provisioning: the /portal sibling of the /team actions in
// talent/team/actions.ts, keyed on (person, company) instead of team member.
// Access itself is the company_os.portal_members allowlist row; the auth user
// is minted/linked on people.auth_user_id exactly like /team. Gated by
// requirePermission("crm.pipeline") throughout. The invite/resend cores live in
// lib/admin/portal-invite.ts, shared with the admin assistant's
// approval-gated invite_portal_member tool.

type Result = { ok: true; message: string } | { ok: false; error: string };

function revalidate(companyId: string, personId: string) {
  revalidateSurfaces(`/revenue/companies/${companyId}`);
  revalidatePath(`/admin/contacts/${personId}`);
}

// Invite a client contact to the portal for a specific company. See
// invitePortalMemberCore for the full semantics.
export async function invitePortalMember(personId: string, companyId: string): Promise<Result> {
  const { user: admin } = await requirePermission("crm.pipeline");
  const r = await invitePortalMemberCore(personId, companyId, admin.email, "admin_ui");
  if (r.ok) revalidate(companyId, personId);
  return r;
}

// Email an already-provisioned member a fresh sign-in link (the original invite
// expires; this is the admin-triggered recovery path). Idempotent.
export async function resendPortalMemberInvite(personId: string, companyId: string): Promise<Result> {
  const { user: admin } = await requirePermission("crm.pipeline");
  return resendPortalLinkCore(personId, companyId, admin.email, "admin_ui");
}

// Set a temporary password for an already-provisioned member and email it, for
// clients whose mail security eats every sign-in link. The generated password
// is returned once so the admin can relay it directly if even this email is
// quarantined. See setTempPasswordCore for the full semantics.
export async function setPortalMemberTempPassword(
  personId: string,
  companyId: string,
): Promise<TempPasswordResult> {
  const { user: admin } = await requirePermission("crm.pipeline");
  const r = await setTempPasswordCore(personId, companyId, admin.email, "admin_ui");
  if (r.ok) revalidate(companyId, personId);
  return r;
}

// Revoke portal access for one company: mark the membership revoked, and when
// it was the person's LAST active membership, ban the auth user too (new
// sign-ins refused; existing sessions die on the next request because every
// gate revalidates via getUser()). The people.auth_user_id link is kept so
// Invite can restore access.
export async function revokePortalMember(personId: string, companyId: string): Promise<Result> {
  const { user: admin } = await requirePermission("crm.pipeline");
  const r = await revokePortalMemberCore(personId, companyId, admin.email, "admin_ui");
  if (r.ok) revalidate(companyId, personId);
  return r;
}

// Set a member's portal role (PR 2: admin | contributor | viewer). Enforced in
// entities/portal/lib/roles.ts on every gated portal action.
const ASSIGNABLE_ROLES = ["admin", "contributor", "viewer"] as const;

export async function setPortalMemberRole(
  personId: string,
  companyId: string,
  role: string,
): Promise<Result> {
  const { user: admin } = await requirePermission("crm.pipeline");
  if (!(ASSIGNABLE_ROLES as readonly string[]).includes(role)) {
    return { ok: false, error: "Unknown role." };
  }
  const { data, error } = await updatePortalMembers({ role, updated_at: new Date().toISOString() })
    .eq("person_id", personId)
    .eq("company_id", companyId)
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "Could not update the role." };
  await recordAudit({
    table: "portal_members",
    recordId: data.id,
    operation: "update",
    actor: admin.email,
    newData: { role },
  });
  revalidate(companyId, personId);
  return { ok: true, message: `Role set to ${role}.` };
}

// Give a contact who was imported without an email (people.email holds a
// "no-email+<id>@edge8.local" placeholder) a real address, then invite them.
// Refuses an address another contact already has, so the invite can never
// reach the wrong person.
export async function setContactEmailAndInvite(personId: string, companyId: string, rawEmail: string): Promise<Result> {
  const { user: admin } = await requirePermission("crm.pipeline");
  const parsed = z.string().trim().toLowerCase().email().safeParse(rawEmail);
  if (!parsed.success) return { ok: false, error: "Enter a valid email address." };
  const email = parsed.data;

  const { data: holders, error: holdersErr } = await companyOs
    .from("people")
    // Not the email: the holder is found BY it, so naming them with it would
    // read "x@y already has x@y".
    .select("id, display_name, preferred_name, full_name")
    .ilike("email", escapeLikeLiteral(email))
    .neq("id", personId);
  if (holdersErr) return { ok: false, error: holdersErr.message };
  if ((holders ?? []).length > 0) {
    return { ok: false, error: `${personName(holders![0], "Another contact")} already has ${email}.` };
  }

  const { error } = await updatePeople({ email, updated_at: new Date().toISOString() }).eq("id", personId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "people", recordId: personId, operation: "update", actor: admin.email, newData: { email } });

  const r = await invitePortalMemberCore(personId, companyId, admin.email, "admin_ui");
  revalidate(companyId, personId);
  return r;
}
