// The Invitations tab's reads and its two writes (AE.4): the pending list,
// Resend and Cancel. The list is pendingInvitations over the auth users, People
// and the live grants; Resend reissues the same invite; Cancel takes back what
// the invite gave, through the same revoke as Settings → Access, deletes the
// login nobody used, and keeps the person and team member rows.
import { companyOs, supabase } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { recordAudit } from "@/kernel/audit/audit";
import { NAME_COLUMNS, personName } from "@/kernel/config/people-name";
import type { RequestAccess } from "@/kernel/identity/access-request";
import { mintVerifyLink } from "@/kernel/identity/session";
import { sendTransactionalEmail } from "@/kernel/messaging/email";
import { updatePeople } from "@/kernel/identity/writes";
import { revokeGrantAs } from "./access-grant";
import { listAuthUsers, type Result } from "./access-invite";
import { inviteEmail } from "./access-invite-email";
import { INVITE_MARKER, inviteMetadataOf, linkLifetimeHours, pendingInvitations, type Invitation, type InvitedUser } from "./access-invitations";

export async function loadInvitations(now = new Date()): Promise<Invitation[]> {
  const users = (await listAuthUsers()).filter((u) => u.invited_at && !u.last_sign_in_at && inviteMetadataOf(u));
  const emails = users.map((u) => (u.email ?? "").trim().toLowerCase()).filter(Boolean);
  if (emails.length === 0) return [];
  const people = mustRows(await companyOs.from("people").select(`id, ${NAME_COLUMNS}`).in("email", emails), "[access-invite] people");
  const personIds = people.map((p) => p.id);
  const grants =
    personIds.length === 0
      ? []
      : mustRows(
          await companyOs
            .from("access_role_assignments")
            .select("id, person_id, granted_by, role:access_roles(name)")
            .in("person_id", personIds)
            .is("revoked_at", null),
          "[access-invite] access_role_assignments",
        );
  const granterIds = [...new Set(grants.map((g) => g.granted_by).filter((g): g is string => !!g))];
  const granters =
    granterIds.length === 0 ? [] : mustRows(await companyOs.from("people").select(`id, ${NAME_COLUMNS}`).in("id", granterIds), "[access-invite] granters");
  const granterName = new Map(granters.map((p) => [p.id, personName(p)]));
  return pendingInvitations({
    users,
    people: people.map((p) => ({ id: p.id, email: p.email ?? "", name: personName(p) })),
    grants: grants.map((g) => {
      const role = g.role as { name: string } | { name: string }[] | null;
      return {
        id: g.id,
        personId: g.person_id,
        roleName: (Array.isArray(role) ? role[0]?.name : role?.name) ?? "A role",
        grantedByName: g.granted_by ? (granterName.get(g.granted_by) ?? null) : null,
      };
    }),
    now,
    lifetimeHours: linkLifetimeHours(),
  });
}

/** The pending invite behind an auth user, or why there is none. */
async function pending(authUserId: string): Promise<{ user: InvitedUser } | { error: string }> {
  const { data, error } = await supabase.auth.admin.getUserById(authUserId);
  if (error || !data?.user) return { error: "That invitation no longer exists." };
  const user = data.user as InvitedUser;
  if (user.last_sign_in_at) return { error: "They have signed in, so the invitation is no longer pending." };
  if (!user.invited_at || !inviteMetadataOf(user)) return { error: "That login was not made by an invitation from Settings, Access." };
  return { user };
}

export async function resendInvite(access: RequestAccess, authUserId: string): Promise<Result> {
  const found = await pending(authUserId);
  if ("error" in found) return { ok: false, error: found.error };
  const meta = inviteMetadataOf(found.user)!;
  const email = (found.user.email ?? "").trim().toLowerCase();
  const row = (await loadInvitations()).find((i) => i.authUserId === authUserId);
  const inviter = access.personId
    ? mustRows(await companyOs.from("people").select(NAME_COLUMNS).eq("id", access.personId).limit(1), "[access-invite] inviter")[0]
    : null;
  const inviterName = inviter ? personName(inviter) : access.user.email;
  const link = await mintVerifyLink({
    type: "invite",
    email,
    redirectTo: meta.landing === "admin" ? "/admin/reset-password" : "/team/change-password",
    verifyPath: meta.landing === "admin" ? "/admin/verify" : "/team/verify",
    data: { [INVITE_MARKER]: meta },
  });
  if ("error" in link) return { ok: false, error: `The link could not be reissued: ${link.error}` };
  const lifetimeHours = linkLifetimeHours();
  const mail = inviteEmail({ kind: "invite", inviterName, landing: meta.landing, roles: row?.roles ?? [], verifyUrl: link.verifyUrl, lifetimeHours });
  const sent = await sendTransactionalEmail({ to: email, subject: mail.subject, html: mail.html, logBody: mail.logBody, logMeta: { source: "access_invite_resend" } });
  if (!sent) return { ok: false, error: "The email failed to send." };
  await recordAudit({
    table: "people",
    recordId: row?.personId ?? null,
    operation: "update",
    actor: access.user.email,
    context: { action: "access_invite_resent", auth_user_id: authUserId },
  });
  return { ok: true, message: `Invitation sent to ${email} again.` };
}

export async function cancelInvite(access: RequestAccess, authUserId: string, reason: string): Promise<Result> {
  const found = await pending(authUserId);
  if ("error" in found) return { ok: false, error: found.error };
  const meta = inviteMetadataOf(found.user)!;
  const live = meta.grant_ids.length
    ? mustRows(
        await companyOs.from("access_role_assignments").select("id").in("id", meta.grant_ids).is("revoked_at", null),
        "[access-invite] access_role_assignments",
      )
    : [];
  for (const grant of live) {
    const revoked = await revokeGrantAs(access, grant.id, reason);
    // Stop before deleting the login: a grant left live with its login gone
    // would be invisible on this tab and still held.
    if (!revoked.ok) return { ok: false, error: `${revoked.error} The invitation stays.` };
  }
  const { error } = await supabase.auth.admin.deleteUser(authUserId);
  if (error) return { ok: false, error: `Their roles were revoked, but the unused login could not be deleted: ${error.message}` };
  // The person stays; only their link to the login that no longer exists goes,
  // so a later invite creates a fresh login and links that one.
  const { error: unlinkError } = await updatePeople({ auth_user_id: null }).eq("auth_user_id", authUserId);
  if (unlinkError) return { ok: false, error: `The invitation was cancelled, but People still points at the deleted login: ${unlinkError.message}` };
  await recordAudit({
    table: "people",
    recordId: null,
    operation: "update",
    actor: access.user.email,
    context: { action: "access_invite_cancelled", auth_user_id: authUserId, email: found.user.email, revoked: live.map((g) => g.id), reason },
  });
  return { ok: true, message: `Invitation to ${found.user.email} cancelled.` };
}
