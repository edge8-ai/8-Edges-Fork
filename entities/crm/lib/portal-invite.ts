// Server-only. Core client-portal provisioning, shared between the admin UI
// server actions (app/admin/(dashboard)/revenue/companies/portal-actions.ts),
// the admin assistant's approval-gated invite_portal_member tool
// (entities/assistant/lib/admin-chat/actions.ts), and the portal login page's self-serve
// sign-in-link / password-reset actions (entities/portal/routes/portal/(auth)/login/actions.ts).
// Admin callers are responsible for the auth gate (requireAdmin / the chat
// route's privileged-admin check); the self-serve functions gate themselves
// on active portal membership.

import { PALETTE } from "@/kernel/config/palette";
import { selectPersonCompanies } from "@/entities/contacts";
import { randomInt } from "crypto";
import { supabase, companyOs } from "@/kernel/data/supabase";
import { holdsSurfaceAdmin } from "@/kernel/identity/access-of-person";
import { PORTAL_STATUSES } from "@/kernel/identity/team-auth";
import { recordAudit } from "@/kernel/audit/audit";
import { sendTransactionalEmail } from "@/kernel/messaging/email";
import { portalLinkEmail } from "@/entities/crm/lib/portal-emails";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { mintVerifyLink } from "@/kernel/identity/session";
// The auth-user lookups moved to the kernel (ME-11); re-exported so the admin
// team actions and the admin sign-in link keep their import until ME-13.
import { findAuthUserByEmail, bannedUntil } from "@/kernel/identity/auth-users";
import { insertPortalMembers, updatePeople, updatePortalMembers } from "@/kernel/identity/writes";
import { escapeLikeLiteral } from "@/kernel/data/postgrest-filter";
export { findAuthUserByEmail, bannedUntil };

export type PortalResult = { ok: true; message: string } | { ok: false; error: string };

export type PortalTarget = {
  personId: string;
  email: string;
  authUserId: string | null;
};

// Shared refusals for any portal action targeting a person: missing/archived
// person, no email, admin email (admins use /admin), or an active team member
// (employees use /team — a person is never scoped as both).
export async function loadPortalTarget(
  personId: string,
): Promise<{ target: PortalTarget } | { error: string }> {
  if (!personId) return { error: "Missing person." };

  const { data: person, error: pErr } = await companyOs.from("people").select("id, email, auth_user_id, archived_at").eq("id", personId).maybeSingle();
  if (pErr || !person) return { error: pErr?.message ?? "Person not found." };
  if (person.archived_at) return { error: "This person is archived." };

  const email = ((person.email as string | null) ?? "").trim().toLowerCase();
  if (!email || email.startsWith("no-email+")) return { error: "This person has no email address on file. Add one first." };

  if (await holdsSurfaceAdmin(email)) {
    return { error: "This person is an admin. Admins use /admin, not the client portal." };
  }

  const { data: employment, error: empErr } = await companyOs.from("team_members").select("id").eq("person_id", personId).in("status", PORTAL_STATUSES).limit(1);
  if (empErr) return { error: empErr.message };
  if ((employment ?? []).length > 0) {
    return { error: "This person is an Edge8 team member. Staff use /team, not the client portal." };
  }

  return {
    target: {
      personId: person.id as string,
      email,
      authUserId: (person.auth_user_id as string | null) ?? null,
    },
  };
}

// Invite a client contact to the portal for a specific company: ensure the
// portal_members row, mint (or reuse) their Supabase auth user, and link it on
// people.auth_user_id. The person must already be linked to the company in the
// CRM (person_companies) — portal members are always known contacts.
// Re-inviting someone whose access was revoked reactivates the row and lifts
// the ban. Also completes the half-provisioned state (active membership row
// but no auth account, e.g. from a backfill that held invites): the row is
// left alone and the auth user is minted + emailed.
export type PortalProvisionVia = "admin_ui" | "admin_chatbot" | "portal_ui";

export async function invitePortalMemberCore(
  personId: string,
  companyId: string,
  actor: string,
  via: PortalProvisionVia,
  // Portal role for the (re)created membership (PR 3): admin | contributor |
  // viewer. Omitted → the column default (admin), matching pre-roles behavior.
  role?: string,
): Promise<PortalResult> {
  if (!companyId) return { ok: false, error: "Missing company." };
  const loaded = await loadPortalTarget(personId);
  if ("error" in loaded) return { ok: false, error: loaded.error };
  const t = loaded.target;

  const { data: link, error: linkErr } = await selectPersonCompanies("id")
    .eq("person_id", personId)
    .eq("company_id", companyId)
    .limit(1);
  if (linkErr) return { ok: false, error: linkErr.message };
  if ((link ?? []).length === 0) {
    return { ok: false, error: "Link this person to the company first (People tab)." };
  }

  // Ensure the membership row (the allowlist). Reactivate a revoked one.
  const { data: existingRow, error: existingErr } = await companyOs
    .from("portal_members")
    .select("id, status")
    .eq("person_id", personId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (existingErr) return { ok: false, error: existingErr.message };
  if (existingRow && existingRow.status !== "active") {
    const { error } = await updatePortalMembers({
        status: "active",
        revoked_at: null,
        invited_by: actor,
        updated_at: new Date().toISOString(),
        ...(role ? { role } : {}),
      })
      .eq("id", existingRow.id);
    if (error) return { ok: false, error: `Could not reactivate membership: ${error.message}` };
  } else if (!existingRow) {
    const { error } = await insertPortalMembers({ person_id: personId, company_id: companyId, invited_by: actor, ...(role ? { role } : {}) });
    if (error) return { ok: false, error: `Could not create membership: ${error.message}` };
  }

  // Auth user: restore, reuse, or mint + email the invite.
  let message = "Portal access enabled.";
  if (t.authUserId) {
    const { data, error: lookupErr } = await supabase.auth.admin.getUserById(t.authUserId);
    if (lookupErr) return { ok: false, error: lookupErr.message };
    if (data?.user && bannedUntil(data.user)) {
      const { error } = await supabase.auth.admin.updateUserById(t.authUserId, {
        ban_duration: "none",
      });
      if (error) return { ok: false, error: `Could not restore access: ${error.message}` };
      message = "Portal access restored.";
    } else {
      message = "Portal access enabled (account already existed).";
    }
  } else {
    const existing = await findAuthUserByEmail(t.email);
    let authUserId: string;
    if (existing) {
      authUserId = existing.id;
      message = "Linked existing account and enabled portal access.";
    } else {
      // Mint the account and get the invite token WITHOUT letting Supabase
      // email a raw one-time verify link: corporate email scanners prefetch
      // links and consume the token before the person ever clicks (this
      // burned a client's very first invite). Instead we email our own message
      // pointing at /portal/verify, which only redeems the token_hash when
      // the recipient clicks the sign-in button on that page.
      const { data, error } = await supabase.auth.admin.generateLink({
        type: "invite",
        email: t.email,
        options: { redirectTo: `${await getSiteOrigin()}/portal/callback` },
      });
      const tokenHash = data?.properties?.hashed_token;
      if (error || !data?.user || !tokenHash) {
        return { ok: false, error: error?.message ?? "Invite could not be created." };
      }
      const verifyUrl = `${await getSiteOrigin()}/portal/verify?token_hash=${encodeURIComponent(tokenHash)}&type=invite`;
      const linkEmail = await portalLinkEmail("invite", verifyUrl);
      const sent = await sendTransactionalEmail({
        to: t.email,
        subject: "Your 8 Edges Client Portal access",
        html: linkEmail.html,
        logBody: linkEmail.logBody,
        logMeta: { source: "portal_invite" },
      });
      if (!sent) return { ok: false, error: "Invite created but the email failed to send." };
      authUserId = data.user.id;
      message = "Invite sent.";
    }
    const { error: upErr } = await updatePeople({ auth_user_id: authUserId })
      .eq("id", t.personId);
    if (upErr) {
      return { ok: false, error: `Auth user ready but linking failed: ${upErr.message}` };
    }
  }

  await recordAudit({
    table: "portal_members",
    recordId: null,
    operation: "update",
    actor,
    context: { action: "portal_invite", person_id: t.personId, company_id: companyId, via },
  });

  return { ok: true, message };
}

// Email an already-provisioned member a fresh sign-in link (the original invite
// expires; this is the admin-triggered recovery path). Idempotent.
export async function resendPortalLinkCore(
  personId: string,
  companyId: string,
  actor: string,
  via: PortalProvisionVia,
): Promise<PortalResult> {
  const loaded = await loadPortalTarget(personId);
  if ("error" in loaded) return { ok: false, error: loaded.error };
  const t = loaded.target;

  if (!t.authUserId) return { ok: false, error: "Not invited yet — use Invite instead." };

  // token_hash + /portal/verify instead of the raw action_link: the raw link
  // is a one-time GET that email security scanners consume before the person
  // clicks. The verify page only redeems the token on a button press.
  // Not through mintVerifyLink: this path's operator-facing failure wording is
  // part of the admin UI, and the shared helper would change what admins read.
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email: t.email,
    options: { redirectTo: `${await getSiteOrigin()}/portal/callback` },
  });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) {
    return { ok: false, error: error?.message ?? "Could not generate a sign-in link." };
  }
  const verifyUrl = `${await getSiteOrigin()}/portal/verify?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink`;

  const linkEmail = await portalLinkEmail("sign_in", verifyUrl);
  const sent = await sendTransactionalEmail({
    to: t.email,
    subject: "Your 8 Edges Client Portal sign-in link",
    html: linkEmail.html,
    logBody: linkEmail.logBody,
    logMeta: { source: "portal_resend" },
  });
  if (!sent) return { ok: false, error: "The sign-in email failed to send." };

  await recordAudit({
    table: "portal_members",
    recordId: null,
    operation: "update",
    actor,
    context: { action: "portal_resend", person_id: t.personId, company_id: companyId, via },
  });

  return { ok: true, message: "Sign-in link sent." };
}

// A readable, out-of-band temporary password: two capitalized words and four
// digits (e.g. "Falcon-Harbor-3927"). Not meant to be strong at rest — it is
// delivered by email (and shown once in the admin), must be changed on first
// sign-in, and Supabase rate-limits sign-in attempts. Readability matters more
// than entropy because the client often types it by hand or reads it over the
// phone when their mail security has quarantined every link we sent.
const TEMP_PW_WORDS = [
  "Harbor", "Falcon", "Summit", "Cedar", "Maple", "Anchor", "Compass", "Meadow",
  "Orchid", "Granite", "Lantern", "Osprey", "Willow", "Beacon", "Canyon", "Marigold",
  "Juniper", "Cobalt", "Pebble", "Thistle", "Quartz", "Sable", "Verbena", "Wander",
  "Cypress", "Dune", "Ember", "Fjord", "Glacier", "Heron", "Indigo", "Kestrel",
  "Lark", "Mesa", "Nimbus", "Onyx", "Prairie", "Rowan", "Slate", "Tundra",
];

function generateTempPassword(): string {
  const word = () => TEMP_PW_WORDS[randomInt(TEMP_PW_WORDS.length)];
  return `${word()}-${word()}-${randomInt(1000, 10000)}`;
}

export type TempPasswordResult =
  | { ok: true; message: string; password: string }
  | { ok: false; error: string };

// Set a temporary password for an already-provisioned portal member and email
// it to them, flagged so the /portal layout forces a password change on first
// sign-in (user_metadata.must_change_password, see ChangePasswordForm). This is
// the deliberate fallback for clients whose mail security consumes or hides
// every link we send: a password sign-in depends on no emailed link at all. The
// generated password is returned to the caller so the admin can read it out
// directly when even this email gets quarantined — it is never stored in the
// CRM (the interactions row logs a redacted body). The email is sent from the
// acting admin's address (a verified edge8.ai sender) so the client sees a
// human they know rather than a no-reply system address.
export async function setTempPasswordCore(
  personId: string,
  companyId: string,
  actor: string,
  via: PortalProvisionVia,
): Promise<TempPasswordResult> {
  const loaded = await loadPortalTarget(personId);
  if ("error" in loaded) return { ok: false, error: loaded.error };
  const t = loaded.target;

  if (!t.authUserId) return { ok: false, error: "Not invited yet — use Invite first." };

  const { data: row, error: rowErr } = await companyOs
    .from("portal_members")
    .select("id, status")
    .eq("person_id", personId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (rowErr) return { ok: false, error: rowErr.message };
  if (!row || row.status !== "active") {
    return { ok: false, error: "No active membership — use Invite first." };
  }

  // A banned (revoked) auth user cannot sign in with any password; Invite is
  // what lifts the ban, so send the admin there instead of silently no-op'ing.
  const { data: current, error: currentErr } = await supabase.auth.admin.getUserById(t.authUserId);
  if (currentErr) return { ok: false, error: currentErr.message };
  if (current?.user && bannedUntil(current.user)) {
    return { ok: false, error: "This account is revoked — use Invite to restore access first." };
  }

  const password = generateTempPassword();
  const { error: pwErr } = await supabase.auth.admin.updateUserById(t.authUserId, {
    password,
    user_metadata: { must_change_password: true },
  });
  if (pwErr) return { ok: false, error: `Could not set the password: ${pwErr.message}` };

  const loginUrl = `${await getSiteOrigin()}/portal/login`;
  const sent = await sendTransactionalEmail({
    to: t.email,
    from: `8 Edges Client Portal <${actor}>`,
    replyTo: actor,
    subject: "Your 8 Edges Client Portal access",
    html: `
      <p>Hi,</p>
      <p>Sorry for the sign-in trouble. The emailed links have not been reaching you reliably, so here is a temporary password instead. It works right away:</p>
      <ol style="line-height:1.8;">
        <li>Go to <a href="${loginUrl}">${loginUrl}</a></li>
        <li>Press <strong>Sign in with a password</strong></li>
        <li>Email: <strong>${t.email}</strong></li>
        <li>Temporary password: <span style="font-family:monospace;font-size:15px;font-weight:600;background:${PALETTE.canvas};padding:3px 10px;border-radius:6px;">${password}</span></li>
      </ol>
      <p>You'll be asked to choose your own password right after you sign in.</p>
      <p style="font-size:13px;color:${PALETTE.greyMid};">If anything gets in the way, just reply to this email.</p>
    `.trim(),
    logMeta: { source: "portal_temp_password" },
    logBody:
      `<p>Temporary portal password issued and emailed (password redacted). Sign-in at ${loginUrl} with a forced password change on first sign-in.</p>`,
  });

  await recordAudit({
    table: "portal_members",
    recordId: row.id as string,
    operation: "update",
    actor,
    context: { action: "portal_temp_password", person_id: t.personId, company_id: companyId, via },
  });

  // The password was set regardless of email delivery — the admin holds it in
  // the one-time reveal, which is exactly the out-of-band relay this feature
  // exists for. Report the email status without failing the action.
  return {
    ok: true,
    password,
    message: sent
      ? "Temporary password set and emailed. It is shown once below — copy it in case the email is delayed."
      : "Temporary password set, but the email failed to send. Copy it below and share it directly.",
  };
}

// ---------------------------------------------------------------------------
// Self-serve emails, triggered from the /portal/login page (no admin session).
//
// These exist because the browser-side signInWithOtp() path sends Supabase's
// raw one-time verify URL, and corporate mail security (Microsoft Safe Links
// et al) prefetches that link and consumes the token before the person can
// click it — they see "invalid or expired" on a link minutes old. This burned
// a client's first invite and locked another client's CTO out entirely. Like the
// admin invite/resend paths above, we mint the token server-side and email a
// link to /portal/verify, which only redeems the token_hash on a button
// press — something scanners don't do.
//
// Anti-abuse: emails are only ever sent to auth users with an ACTIVE portal
// membership (a small allowlist of known client contacts), the caller-facing
// result is always neutral (no account enumeration), and repeat requests for
// the same email are throttled. The throttle map is per serverless instance —
// best-effort, but the membership gate is the real limiter.
//
// The UI stays neutral, but every refusal is logged server-side: an OnTarget
// contact's request once no-op'd with zero trace anywhere (no auth log, no
// Resend record, no function log), which turned a support email into a
// forensic dig. Silence toward the visitor must not mean silence in the logs.

const SELF_SERVE_COOLDOWN_MS = 60_000;
const lastSelfServeSend = new Map<string, number>();

function inCooldown(key: string): boolean {
  return Date.now() - (lastSelfServeSend.get(key) ?? 0) < SELF_SERVE_COOLDOWN_MS;
}

// Recorded only after a successful send, so a member whose first attempt hit
// a transient failure is not locked out of an immediate retry.
function markSent(key: string): void {
  lastSelfServeSend.set(key, Date.now());
}

function refuse(email: string, reason: string): null {
  console.warn(`[portal-self-serve] refused for ${email}: ${reason}`);
  return null;
}

// The auth user for `email`, but only when they hold an active portal
// membership and are not banned; null otherwise (neutral to the visitor,
// logged for us). The CRM is the source of truth: the contact is looked up in
// people by email, NOT via auth.admin.listUsers — a transient listUsers
// failure used to read as "no such user" and refuse a legitimate member with
// no trace. The address is LIKE-escaped first (escapeLikeLiteral, kernel/data/postgrest-filter.ts).
async function activePortalAuthUser(email: string): Promise<{ id: string } | null> {
  const { data: people, error: pErr } = await companyOs
    .from("people")
    .select("id, auth_user_id")
    .ilike("email", escapeLikeLiteral(email))
    .is("archived_at", null);
  if (pErr) return refuse(email, `people lookup failed: ${pErr.message}`);
  const rows = people ?? [];
  if (rows.length === 0) return refuse(email, "no person with this email");

  const { data: memberships, error: mErr } = await companyOs
    .from("portal_members")
    .select("id")
    .in("person_id", rows.map((p) => p.id as string))
    .eq("status", "active")
    .limit(1);
  if (mErr) return refuse(email, `membership lookup failed: ${mErr.message}`);
  if ((memberships ?? []).length === 0) return refuse(email, "no active portal membership");

  const authUserId = rows.map((p) => p.auth_user_id as string | null).find(Boolean) ?? null;
  if (!authUserId) return refuse(email, "member has no auth user (not invited yet)");

  const { data: fullUser, error: uErr } = await supabase.auth.admin.getUserById(authUserId);
  if (uErr || !fullUser?.user) {
    return refuse(email, `auth user ${authUserId} not found: ${uErr?.message ?? "no user"}`);
  }
  if (bannedUntil(fullUser.user)) return refuse(email, "auth user is banned");

  return { id: authUserId };
}

// Self-serve "Send sign-in link". Always resolves — the login page shows the
// same neutral notice whether or not an email went out.
export async function sendSelfServeSignInLink(rawEmail: string): Promise<void> {
  const email = rawEmail.trim().toLowerCase();
  if (!email) return;
  if (inCooldown(email)) {
    refuse(email, "in cooldown");
    return;
  }
  const member = await activePortalAuthUser(email);
  if (!member) return;

  const link = await mintVerifyLink({
    type: "magiclink",
    email,
    redirectTo: "/portal/callback",
    verifyPath: "/portal/verify",
  });
  if ("error" in link) {
    refuse(email, `generateLink(magiclink) failed: ${link.error}`);
    return;
  }

  const linkEmail = await portalLinkEmail("sign_in", link.verifyUrl);
  const sent = await sendTransactionalEmail({
    to: email,
    subject: "Your 8 Edges Client Portal sign-in link",
    html: linkEmail.html,
    logBody: linkEmail.logBody,
    logMeta: { source: "portal_self_serve_link" },
  });
  if (sent) markSent(email);
  else refuse(email, "sign-in email send failed (see [email] log above)");
}

// Self-serve "Forgot password". Sends a recovery link through the same
// scanner-proof /portal/verify interstitial; verifying lands the person on
// /portal/change-password to choose a new one. Always resolves (neutral).
export async function sendSelfServePasswordReset(rawEmail: string): Promise<void> {
  const email = rawEmail.trim().toLowerCase();
  if (!email) return;
  if (inCooldown(`reset:${email}`)) {
    refuse(email, "reset in cooldown");
    return;
  }
  const member = await activePortalAuthUser(email);
  if (!member) return;

  const link = await mintVerifyLink({
    type: "recovery",
    email,
    redirectTo: "/portal/change-password",
    verifyPath: "/portal/verify",
  });
  if ("error" in link) {
    refuse(email, `generateLink(recovery) failed: ${link.error}`);
    return;
  }

  const linkEmail = await portalLinkEmail("reset", link.verifyUrl);
  const sent = await sendTransactionalEmail({
    to: email,
    subject: "Reset your 8 Edges Client Portal password",
    html: linkEmail.html,
    logBody: linkEmail.logBody,
    logMeta: { source: "portal_self_serve_reset" },
  });
  if (sent) markSent(`reset:${email}`);
  else refuse(email, "reset email send failed (see [email] log above)");
}

// Ban horizon for revoked portal access. Banning (not deleting) keeps the
// people.auth_user_id link intact so access can be restored by re-inviting.
const REVOKE_BAN = "87600h"; // ~10 years

// Revoke one (person, company) membership; when it was the person's LAST
// active membership, ban the auth user too. Shared by the admin UI action and
// the portal Users page (portal-admin callers gate + scope before calling).
export async function revokePortalMemberCore(
  personId: string,
  companyId: string,
  actor: string,
  via: PortalProvisionVia,
): Promise<PortalResult> {
  const loaded = await loadPortalTarget(personId);
  if ("error" in loaded) return { ok: false, error: loaded.error };
  const t = loaded.target;

  const { data: row, error: memberErr } = await companyOs
    .from("portal_members")
    .select("id, status")
    .eq("person_id", personId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (memberErr) return { ok: false, error: memberErr.message };
  if (!row || row.status !== "active") return { ok: false, error: "No active membership to revoke." };

  const { error: revErr } = await updatePortalMembers({ status: "revoked", revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", row.id);
  if (revErr) return { ok: false, error: `Revoke failed: ${revErr.message}` };

  const { data: remaining, error: remainingErr } = await companyOs
    .from("portal_members")
    .select("id")
    .eq("person_id", personId)
    .eq("status", "active")
    .limit(1);
  if (remainingErr) return { ok: false, error: `Membership revoked but the remaining-access check failed: ${remainingErr.message}` };
  let message = "Membership revoked.";
  if ((remaining ?? []).length === 0 && t.authUserId) {
    const { error } = await supabase.auth.admin.updateUserById(t.authUserId, {
      ban_duration: REVOKE_BAN,
    });
    if (error) return { ok: false, error: `Membership revoked but sign-in ban failed: ${error.message}` };
    message = "Portal access revoked and sign-in disabled.";
  }

  await recordAudit({
    table: "portal_members",
    recordId: row.id as string,
    operation: "update",
    actor,
    context: { action: "portal_revoke", person_id: t.personId, company_id: companyId, via },
  });

  return { ok: true, message };
}
