"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PALETTE } from "@/kernel/config/palette";
import { supabase, companyOs } from "@/kernel/data/supabase";
import { holdsSurfaceAdmin } from "@/kernel/identity/access-of-person";
import { findAuthUserByEmail, bannedUntil } from "@/kernel/identity/auth-users";
import { PORTAL_STATUSES } from "@/kernel/identity/team-auth";
import { getAccess, requirePermission } from "@/kernel/identity/access-request";
import { EMPLOYMENT_TYPES } from "@/kernel/identity/employment-types";
import { grantRoleTo } from "@/entities/company-os";
import { recordAudit } from "@/kernel/audit/audit";
import { sendTransactionalEmail } from "@/kernel/messaging/email";
import { SIGN_IN_LINK_WITHHELD } from "@/kernel/messaging/sign-in-links";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { updatePeople, updateTeamMembers } from "@/kernel/identity/writes";

// Provisioning of /team portal access for a team member, moved here from
// routes/(dashboard)/talent/team/actions.ts so that InvitePortalButton — shared
// UI rendered from several admin pages — depends on its module rather than on a
// route. The rest of that route file (team-member edits, salary, reviews) stays
// where it is: only the portal actions the shared button calls moved.

type Result = { ok: true; message: string } | { ok: false; error: string };

// Ban horizon for revoked portal access. Banning (not deleting) keeps the
// people.auth_user_id link intact so access can be restored by re-inviting.
// Sessions die on the next request: every gate revalidates via getUser(), which
// the auth server refuses for a banned user.
const REVOKE_BAN = "87600h"; // ~10 years

// Load the team member + linked person a portal action targets, with the shared
// refusals: no person, no email, or an admin email (admins use /admin, never /team).
type PortalTarget = {
  teamMemberId: string;
  status: string | null;
  employmentType: string | null;
  personId: string;
  email: string;
  authUserId: string | null;
};

async function loadPortalTarget(
  teamMemberId: string,
): Promise<{ target: PortalTarget } | { error: string }> {
  if (!teamMemberId) return { error: "Missing team member." };

  const { data: tm, error: tmErr } = await companyOs
    .from("team_members")
    .select("id, person_id, status, employment_type")
    .eq("id", teamMemberId)
    .maybeSingle();
  if (tmErr || !tm) return { error: tmErr?.message ?? "Team member not found." };

  const { data: person, error: pErr } = await companyOs
    .from("people")
    .select("id, email, auth_user_id")
    .eq("id", tm.person_id)
    .maybeSingle();
  if (pErr || !person) return { error: pErr?.message ?? "Linked person not found." };

  const email = ((person.email as string | null) ?? "").trim().toLowerCase();
  if (!email) return { error: "This person has no email address on file." };

  if (await holdsSurfaceAdmin(email)) {
    return { error: "This person is an admin. Admins use /admin, not the portal." };
  }

  return {
    target: {
      teamMemberId: tm.id as string,
      status: (tm.status as string | null) ?? null,
      employmentType: (tm.employment_type as string | null) ?? null,
      personId: person.id as string,
      email,
      authUserId: (person.auth_user_id as string | null) ?? null,
    },
  };
}

// What the invite form sends besides the person (ADR 0013, AC.18). Type is the
// employment type, which sets the baseline role (contract makes a Contractor);
// Roles are granted-role ids, the modules the person starts with. Both are
// optional: the button that had neither sends neither.
const InviteOptions = z.object({
  employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
  roleIds: z.array(z.string().uuid()).max(20).optional(),
});

export type InviteOptions = z.input<typeof InviteOptions>;

/** A role the invite did not grant, and why; the invite itself still went out. */
export type RoleRefusal = { roleId: string; roleName: string | null; reason: string };

export type InviteResult = { ok: true; message: string; refused: RoleRefusal[] } | { ok: false; error: string };

// Invite a team member to the /team portal: mint (or reuse) their Supabase auth
// user and link it on people.auth_user_id. Gated by requirePermission("crm.portal-invite"). Sends a real
// magic-link invite email via Supabase, so this is deliberately explicit.
// Re-inviting someone whose access was revoked lifts the ban instead.
//
// A contractor is a team member (ADR 0013), so the invite is the one door in:
// Type is written to their team_members row before the email goes out, so their
// first sign-in already resolves the right baseline, and each role is granted
// through the same rule as Settings → Access (grantRoleTo). A role the inviter
// may not grant, or who is gone, is reported in `refused` and never stops the
// invite: the person is invited, and an admin can grant the rest in Settings →
// Access.
export async function inviteToPortal(teamMemberId: string, options: InviteOptions = {}): Promise<InviteResult> {
  const { user: admin } = await requirePermission("crm.portal-invite");
  const input = InviteOptions.safeParse(options);
  if (!input.success) return { ok: false, error: "Pick a type from the list, and roles from the ones offered." };
  const loaded = await loadPortalTarget(teamMemberId);
  if ("error" in loaded) return { ok: false, error: loaded.error };
  const t = loaded.target;

  // Only portal-eligible employment statuses get an invite; anyone else would
  // receive a link that requireTeamMember() dead-ends at the login screen.
  if (!t.status || !PORTAL_STATUSES.includes(t.status)) {
    return {
      ok: false,
      error: `Status '${t.status ?? "unknown"}' is not portal-eligible (needs one of: ${PORTAL_STATUSES.join(", ")}).`,
    };
  }

  const typeError = await setEmploymentType(t, input.data.employmentType, admin.email);
  if (typeError) return { ok: false, error: typeError };

  const sent = await provisionPortal(t, admin.email);
  if (!sent.ok) return sent;

  const { granted, refused } = await grantOnInvite(t.personId, input.data.roleIds ?? []);
  if (granted.length > 0) revalidatePath("/admin/settings/access");
  const notes = [
    granted.length > 0 ? `Granted ${granted.join(", ")}.` : null,
    refused.length > 0 ? `Not granted: ${refused.map((r) => `${r.roleName ?? "a role"} (${r.reason})`).join("; ")}` : null,
  ].filter((n): n is string => n !== null);
  return { ok: true, message: [sent.message, ...notes].join(" "), refused };
}

// Write the employment type chosen on the invite, when it differs from the one
// the row has. Returns the refusal, or null. Audited like any other change to
// who a person is.
async function setEmploymentType(t: PortalTarget, employmentType: string | undefined, actor: string): Promise<string | null> {
  if (!employmentType || employmentType === t.employmentType) return null;
  const { error } = await updateTeamMembers({ employment_type: employmentType }).eq("id", t.teamMemberId);
  if (error) return `Could not set the type: ${error.message}`;
  await recordAudit({
    table: "team_members",
    recordId: t.teamMemberId,
    operation: "update",
    actor,
    oldData: { employment_type: t.employmentType },
    newData: { employment_type: employmentType, via: "team_invite" },
  });
  return null;
}

// Grant each chosen role to the invited person, as whoever is signed in. The
// rule is grantRoleTo's, so an inviter who does not manage access, or who does
// not hold what a role carries, is refused role by role.
async function grantOnInvite(personId: string, roleIds: string[]): Promise<{ granted: string[]; refused: RoleRefusal[] }> {
  const granted: string[] = [];
  const refused: RoleRefusal[] = [];
  const unique = [...new Set(roleIds)];
  if (unique.length === 0) return { granted, refused };
  const access = await getAccess();
  for (const roleId of unique) {
    if (!access) {
      refused.push({ roleId, roleName: null, reason: "Sign in again to grant roles." });
      continue;
    }
    const outcome = await grantRoleTo({
      access,
      personId,
      roleId,
      reason: (role) => `Granted on invite: ${role.name}`,
    });
    if (outcome.ok) granted.push(outcome.roleName);
    else refused.push({ roleId, roleName: outcome.roleName, reason: outcome.error });
  }
  return { granted, refused };
}

// Mint or restore the portal account and link it. Idempotent: someone with
// access already is told so.
async function provisionPortal(t: PortalTarget, actor: string): Promise<Result> {
  // Already linked: restore access if it was revoked, otherwise nothing to do.
  if (t.authUserId) {
    const { data, error: lookupErr } = await supabase.auth.admin.getUserById(t.authUserId);
    if (lookupErr) return { ok: false, error: `Could not read the account: ${lookupErr.message}` };
    if (data?.user && bannedUntil(data.user)) {
      const { error } = await supabase.auth.admin.updateUserById(t.authUserId, {
        ban_duration: "none",
      });
      if (error) return { ok: false, error: `Could not restore access: ${error.message}` };
      await updatePeople({ is_team_member: true }).eq("id", t.personId);
      await recordAudit({
        table: "people",
        recordId: t.personId,
        operation: "update",
        actor,
        context: { action: "portal_restore", team_member_id: t.teamMemberId },
      });
      revalidatePath("/admin/talent/team");
      return { ok: true, message: "Portal access restored." };
    }
    return { ok: true, message: "Already has portal access." };
  }

  // Reuse an existing auth user with this exact email (e.g. created elsewhere);
  // otherwise mint one and email the invite. Either way the email matches by
  // construction, so we never link a mismatched identity.
  const existing = await findAuthUserByEmail(t.email);
  let authUserId: string;
  if (existing) {
    authUserId = existing.id;
  } else {
    // Server-side invite → implicit-flow link (session in the URL hash), which
    // /api/auth/callback can't read (it only handles PKCE ?code=). Land on the
    // client callback that reads the hash, establishes the session, and hands
    // off to /team. See app/team/(auth)/callback/page.tsx.
    const { data, error } = await supabase.auth.admin.inviteUserByEmail(t.email, {
      redirectTo: `${await getSiteOrigin()}/team/callback`,
    });
    if (error || !data?.user) return { ok: false, error: error?.message ?? "Invite failed to send." };
    authUserId = data.user.id;
  }

  const { error: upErr } = await updatePeople({ auth_user_id: authUserId, is_team_member: true })
    .eq("id", t.personId);
  if (upErr) {
    // Linking failed after (possibly) minting a user; surface it rather than
    // leaving an orphaned auth user silently.
    return { ok: false, error: `Auth user ready but linking failed: ${upErr.message}` };
  }

  await recordAudit({
    table: "people",
    recordId: t.personId,
    operation: "update",
    actor,
    context: {
      action: "portal_invite",
      team_member_id: t.teamMemberId,
      linked_existing_auth_user: Boolean(existing),
    },
  });

  revalidatePath("/admin/talent/team");
  return {
    ok: true,
    message: existing ? "Linked existing account and enabled portal access." : "Invite sent.",
  };
}

// Email an already-provisioned member a fresh sign-in link (the original invite
// expires; this is the admin-triggered recovery path). Idempotent.
export async function resendPortalInvite(teamMemberId: string): Promise<Result> {
  const { user: admin } = await requirePermission("crm.portal-invite");
  const loaded = await loadPortalTarget(teamMemberId);
  if ("error" in loaded) return { ok: false, error: loaded.error };
  const t = loaded.target;

  if (!t.authUserId) return { ok: false, error: "Not invited yet — use Invite instead." };

  // token_hash + /team/verify instead of the raw action_link: the raw link is
  // a one-time GET that email security scanners consume before the person
  // clicks. The verify page only redeems the token on a button press.
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email: t.email,
    options: { redirectTo: `${await getSiteOrigin()}/team/callback` },
  });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) {
    return { ok: false, error: error?.message ?? "Could not generate a sign-in link." };
  }
  const verifyUrl = `${await getSiteOrigin()}/team/verify?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink`;

  // The log gets the same email with the button left out (B.15).
  const siteOrigin = await getSiteOrigin();
  const body = (button: string) => `
    <p>Here is your sign-in link for the Edge8 Team workspace:</p>
    ${button}
    <p style="font-size:13px;color:${PALETTE.greyMid};">The button takes you to a sign-in page. Press "Sign in" there and you're in. If the link expires, you can request a fresh one any time at <a href="${siteOrigin}/team/login">${siteOrigin}/team/login</a>.</p>
    `;
  await sendTransactionalEmail({
    to: t.email,
    subject: "Your Edge8 Team sign-in link",
    html: body(
      `<p style="margin:20px 0;"><a href="${verifyUrl}" style="display:inline-block;background:${PALETTE.dark};color:${PALETTE.white};text-decoration:none;font-weight:600;padding:12px 28px;border-radius:10px;">Sign in to the Edge8 Team workspace</a></p>`,
    ),
    logBody: body(SIGN_IN_LINK_WITHHELD),
  });

  await recordAudit({
    table: "people",
    recordId: t.personId,
    operation: "update",
    actor: admin.email,
    context: { action: "portal_resend", team_member_id: t.teamMemberId },
  });

  return { ok: true, message: "Sign-in link sent." };
}

// Revoke portal access: ban the auth user (new sign-ins refused, and existing
// sessions die on the next request because every gate revalidates via
// getUser()). The people.auth_user_id link is kept so Invite can restore access.
export async function revokePortalAccess(teamMemberId: string): Promise<Result> {
  const { user: admin } = await requirePermission("crm.portal-invite");
  const loaded = await loadPortalTarget(teamMemberId);
  if ("error" in loaded) return { ok: false, error: loaded.error };
  const t = loaded.target;

  if (!t.authUserId) return { ok: false, error: "No portal access to revoke." };

  const { error } = await supabase.auth.admin.updateUserById(t.authUserId, {
    ban_duration: REVOKE_BAN,
  });
  if (error) return { ok: false, error: `Revoke failed: ${error.message}` };

  await updatePeople({ is_team_member: false }).eq("id", t.personId);

  await recordAudit({
    table: "people",
    recordId: t.personId,
    operation: "update",
    actor: admin.email,
    context: { action: "portal_revoke", team_member_id: t.teamMemberId },
  });

  revalidatePath("/admin/talent/team");
  return { ok: true, message: "Portal access revoked." };
}
