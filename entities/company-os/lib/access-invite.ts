// Invite someone from Settings → Access (AE.4, spec 2026-10-07 "The invite").
// One email, a name, an employment type, the bundles to hold and a reason
// become: a People record (found or created), a team member row (found or
// created), each role granted through grantRoleTo with that one reason, and a
// branded email that creates the login, or a sign-in link when a login exists.
//
// Every refusal comes from invitePlan, read before the first write, so the
// drawer's inline refusal and Send's refusal are the same sentence and a
// refused invite writes nothing. Nothing here asks who is calling: the server
// actions in access-invite-actions.ts guard with access.manage first and hand
// the resulting access in, as access-grant.ts expects.
import { z } from "zod";
import { companyOs, supabase } from "@/kernel/data/supabase";
import { mustRows, ReadFailure } from "@/kernel/data/read";
import { escapeLikeLiteral } from "@/kernel/data/postgrest-filter";
import { recordAudit } from "@/kernel/audit/audit";
import { NAME_COLUMNS, personName } from "@/kernel/config/people-name";
import { EMPLOYMENT_TYPES, EMPLOYMENT_TYPE_LABEL } from "@/kernel/identity/employment-types";
import type { RequestAccess } from "@/kernel/identity/access-request";
import { permissionRegistry } from "@/kernel/identity/permission-registry";
import { roleKeyFrom } from "@/kernel/identity/access-grants";
import { PORTAL_STATUSES } from "@/kernel/identity/team-statuses";
import { mintVerifyLink } from "@/kernel/identity/session";
import { insertPeople, insertTeamMembers, updatePeople } from "@/kernel/identity/writes";
import { sendTransactionalEmail } from "@/kernel/messaging/email";
import { addRolePermissionAs, createRoleAs, grantRoleTo } from "./access-grant";
import { atomSides, customRoleName, invitePlan, NO_BASELINE_TYPES, type InviteFacts, type InvitePlan, type Landing, type LoginState } from "./access-invite-plan";
import { INVITE_MARKER, inviteMetadataOf, linkLifetimeHours, type InviteMetadata, type InvitedUser } from "./access-invitations";
import { inviteEmail } from "./access-invite-email";

export const InviteInput = z.object({
  email: z.string().trim().toLowerCase().email("Give a work email."),
  fullName: z.string().trim().max(120),
  employmentType: z.enum(EMPLOYMENT_TYPES),
  roleKeys: z.array(z.string().min(1).max(80)).max(20),
  customAtoms: z.array(z.string().min(3).max(120)).max(200),
  // The same rule as a grant's reason in Settings → Access.
  reason: z.string().trim().min(3, "Say why, in a few words.").max(500),
});
export type InviteInput = z.infer<typeof InviteInput>;

export type InviteMatch = { name: string; employment: string; login: string } | null;
export type Result = { ok: true; message: string } | { ok: false; error: string };

type AuthUser = InvitedUser & { banned_until?: string | null };

/** Every auth user, paged. A failed page raises: a partial list would call a real login "none". */
export async function listAuthUsers(): Promise<AuthUser[]> {
  const out: AuthUser[] = [];
  const perPage = 200;
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw new ReadFailure("[access-invite] auth users", error.message);
    out.push(...(data.users as AuthUser[]));
    if (data.users.length < perPage) return out;
  }
}

const loginOf = (user: AuthUser | undefined): LoginState => (!user ? "none" : user.last_sign_in_at ? "signed-in" : "invited");
const LOGIN_WORDS: Record<LoginState, string> = { none: "no login yet", invited: "invited, never signed in", "signed-in": "has a login" };

type Read = {
  facts: InviteFacts;
  personId: string | null;
  authUser: AuthUser | undefined;
  roleIds: Record<string, string>;
};

/** Everything the plan and Send need about this email and the declared bundles. */
async function read(access: RequestAccess, input: Pick<InviteInput, "email" | "fullName" | "employmentType">): Promise<Read> {
  const { email } = input;
  const registry = permissionRegistry();
  const [peopleRows, roleRows, inviterRows, users] = await Promise.all([
    companyOs.from("people").select(`id, ${NAME_COLUMNS}`).ilike("email", escapeLikeLiteral(email)).limit(1),
    companyOs.from("access_roles").select("id, key, name, kind, access_role_permissions(permission, revoked_at)").is("archived_at", null),
    access.personId ? companyOs.from("people").select(NAME_COLUMNS).eq("id", access.personId).limit(1) : Promise.resolve({ data: [], error: null }),
    listAuthUsers(),
  ]);
  const person = mustRows(peopleRows, "[access-invite] people")[0] ?? null;
  // Every live granted role may be offered, declared or not (Revenue, a
  // one-person role); an implied role follows its fact and is never invited to.
  const granted = mustRows(roleRows, "[access-invite] access_roles").filter((r) => r.kind === "granted");
  const roleIds: Record<string, string> = Object.fromEntries(granted.map((r) => [r.key, r.id]));
  const bundles: InviteFacts["bundles"] = Object.fromEntries([
    ...granted.map((r) => {
      const pairs = (r.access_role_permissions ?? []) as { permission: string; revoked_at: string | null }[];
      return [r.key, { name: r.name, atoms: pairs.filter((p) => !p.revoked_at).map((p) => p.permission), seeded: true }] as const;
    }),
    // A declared bundle access:sync has not seeded yet: offered, and refused by the plan.
    ...Object.entries(registry.roles)
      .filter(([key]) => !(key in roleIds))
      .map(([key, r]) => [key, { name: r.name, atoms: r.atoms.map((a) => a.permission), seeded: false }] as const),
  ]);
  const inviter = mustRows(inviterRows, "[access-invite] inviter")[0];
  const team = person
    ? mustRows(
        await companyOs.from("team_members").select("employment_type").eq("person_id", person.id).in("status", PORTAL_STATUSES).limit(1),
        "[access-invite] team_members",
      )[0] ?? null
    : null;
  // What the grant helper and createRoleAs would refuse after the first write,
  // read now so the plan refuses it before: a role already held, a taken name.
  const held = person
    ? mustRows(
        await companyOs.from("access_role_assignments").select("role:access_roles(key)").eq("person_id", person.id).is("revoked_at", null),
        "[access-invite] live grants",
      )
    : [];
  const heldRoleKeys = new Set(
    held.flatMap((g) => {
      const role = g.role as { key: string } | { key: string }[] | null;
      return (Array.isArray(role) ? role : role ? [role] : []).map((r) => r.key);
    }),
  );
  const customKey = roleKeyFrom(customRoleName(person ? personName(person) : input.fullName.trim() || "them", input.employmentType));
  const customNameTaken =
    NO_BASELINE_TYPES.has(input.employmentType) &&
    mustRows(await companyOs.from("access_roles").select("id").eq("key", customKey).limit(1), "[access-invite] custom role key").length > 0;
  const authUser = users.find((u) => (u.email ?? "").trim().toLowerCase() === email);
  const { adminSide, teamSide } = atomSides(registry);
  return {
    personId: person?.id ?? null,
    authUser,
    roleIds,
    facts: {
      person: person ? { name: personName(person), employmentType: team?.employment_type ?? null, login: loginOf(authUser) } : null,
      bundles,
      adminSide,
      teamSide,
      inviterName: inviter ? personName(inviter) : access.user.email,
      linkLifetimeHours: linkLifetimeHours(),
      heldRoleKeys,
      customNameTaken,
    },
  };
}

/** The drawer's "What will happen" box, and who the email already is. Writes nothing. */
export async function previewInvite(access: RequestAccess, input: InviteInput): Promise<{ plan: InvitePlan; match: InviteMatch }> {
  const { facts } = await read(access, input);
  const match = facts.person
    ? {
        name: facts.person.name,
        employment: facts.person.employmentType
          ? (EMPLOYMENT_TYPE_LABEL[facts.person.employmentType as keyof typeof EMPLOYMENT_TYPE_LABEL] ?? facts.person.employmentType)
          : "not on the team",
        login: LOGIN_WORDS[facts.person.login],
      }
    : null;
  return { plan: invitePlan(input, facts), match };
}

/** The link and the email for one person, by where they land and whether they have a login. */
async function sendLink(input: {
  email: string;
  landing: "admin" | "team";
  login: LoginState;
  inviterName: string;
  roles: string[];
  metadata: InviteMetadata;
  lifetimeHours: number;
}): Promise<{ ok: true; userId: string | null } | { ok: false; error: string }> {
  const verifyPath = input.landing === "admin" ? "/admin/verify" : "/team/verify";
  // An invite lands on the password page of the surface it opens; /verify
  // sends type=invite there once the person presses "Sign in".
  const passwordPage = input.landing === "admin" ? "/admin/reset-password" : "/team/change-password";
  const signedIn = input.login === "signed-in";
  const link = signedIn
    ? await mintVerifyLink({ type: "magiclink", email: input.email, redirectTo: input.landing === "admin" ? "/api/auth/callback?next=/admin" : "/team/callback", verifyPath })
    : await mintVerifyLink({ type: "invite", email: input.email, redirectTo: passwordPage, verifyPath, data: { [INVITE_MARKER]: input.metadata } });
  if ("error" in link) return { ok: false, error: `The login could not be created: ${link.error}` };
  const mail = inviteEmail({
    kind: signedIn ? "sign_in" : "invite",
    inviterName: input.inviterName,
    landing: input.landing,
    roles: input.roles,
    verifyUrl: link.verifyUrl,
    lifetimeHours: input.lifetimeHours,
  });
  const sent = await sendTransactionalEmail({
    to: input.email,
    subject: mail.subject,
    html: mail.html,
    logBody: mail.logBody,
    logMeta: { source: signedIn ? "access_invite_sign_in" : "access_invite" },
  });
  if (!sent) return { ok: false, error: "The email failed to send." };
  return { ok: true, userId: link.userId };
}

export async function sendInvite(access: RequestAccess, input: InviteInput): Promise<Result> {
  const r = await read(access, input);
  const plan = invitePlan(input, r.facts);
  if (plan.refusal) return { ok: false, error: plan.refusal };
  if (!r.facts.person && input.fullName.length < 2) return { ok: false, error: "Give their full name." };
  const landing = plan.landing as Exclude<Landing, null>;

  let personId = r.personId;
  if (!personId) {
    const { data, error } = await insertPeople({ email: input.email, full_name: input.fullName, source: "access_invite" }).select("id").single();
    if (error) return { ok: false, error: `Could not add them to People: ${error.message}` };
    personId = data.id;
  }
  if (!r.facts.person?.employmentType) {
    // Active, which the Team gate admits (PORTAL_STATUSES) and the Super Admin
    // rule counts as a current team member; pre_start is neither for the latter.
    const { error } = await insertTeamMembers({ person_id: personId, employment_type: input.employmentType, status: "active" });
    if (error) return { ok: false, error: `Could not add them to the team: ${error.message}` };
  }

  const roleIds = input.roleKeys.map((k) => r.roleIds[k]);
  const done: string[] = [];
  if (plan.customRoleName) {
    const created = await createRoleAs(access, plan.customRoleName, `${plan.customRoleName}'s own access, shaped when they were invited.`);
    if (!created.ok) return { ok: false, error: created.error };
    for (const atom of plan.customAtoms) {
      const added = await addRolePermissionAs(access, created.id, atom, "all");
      if (!added.ok) return { ok: false, error: `${plan.customRoleName} was created, but ${atom} could not be added: ${added.error}` };
    }
    roleIds.push(created.id);
  }
  const grantIds: string[] = [];
  for (const roleId of roleIds) {
    const granted = await grantRoleTo({ access, personId, roleId, reason: input.reason });
    if (!granted.ok) {
      const so = done.length > 0 ? ` ${done.join(", ")} ${done.length === 1 ? "was" : "were"} granted; no email was sent.` : " No email was sent.";
      return { ok: false, error: `${granted.error}${so}` };
    }
    done.push(granted.roleName);
    grantIds.push(granted.assignmentId);
  }

  const metadata: InviteMetadata = { grant_ids: grantIds, inviter_person_id: access.personId, landing };
  if (r.authUser && loginOf(r.authUser) === "invited") {
    // A pending invite re-sent with more roles: the marker must name every
    // grant Cancel would take back, so the new ones join the old.
    const old = inviteMetadataOf(r.authUser)?.grant_ids ?? [];
    metadata.grant_ids = [...new Set([...old, ...grantIds])];
    const { error } = await supabase.auth.admin.updateUserById(r.authUser.id, {
      user_metadata: { ...(r.authUser.user_metadata ?? {}), [INVITE_MARKER]: metadata },
    });
    if (error) return { ok: false, error: `Roles granted, but the pending invite could not be updated: ${error.message}` };
  }
  const login = r.facts.person?.login ?? loginOf(r.authUser);
  const sent = await sendLink({
    email: input.email,
    landing,
    login,
    inviterName: r.facts.inviterName,
    roles: done,
    metadata,
    lifetimeHours: r.facts.linkLifetimeHours,
  });
  if (!sent.ok) return { ok: false, error: `${done.join(", ") || "Their access"} granted, but ${sent.error} Use Resend on the Invitations tab.` };
  if (sent.userId && !r.authUser) {
    const { error } = await updatePeople({ auth_user_id: sent.userId }).eq("id", personId);
    if (error) console.error("[access-invite] linking the new login to People failed:", error.message);
  }
  await recordAudit({
    table: "people",
    recordId: personId,
    operation: "update",
    actor: access.user.email,
    context: { action: "access_invite", roles: done, employment_type: input.employmentType, landing, login, reason: input.reason },
  });
  const who = r.facts.person?.name ?? input.fullName;
  return { ok: true, message: login === "signed-in" ? `${who} has their roles and a sign-in link.` : `Invitation sent to ${who}.` };
}
