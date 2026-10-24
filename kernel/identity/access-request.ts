// The access resolver for one request, and the guard pages and actions call
// first (ADR 0013, ADR 0007).
//
// getAccess gathers the facts the kernel's registers hold about the signed-in
// person (the Admin and Super Admin grants, the team actor, the portal actor,
// the roles granted in Settings, Access), resolves them through access.ts with
// the live rows of access_role_permissions, and caches the answer for the
// render. A read that fails throws, so a page is refused rather than shown with
// less than, or more than, the person holds.
//
// The Admin role here is a register fact, never the definition of "admin":
// whoever holds surface.admin, through that role or any other, enters the Admin
// view (ADR 0014). So this module asks the register, not admin-auth.ts, which
// is built on top of it.
//
// Portal facts count only when the portal actor is the signed-in person. An
// admin viewing a client's portal through Assume gets a portal actor that is
// the client, and those facts are the client's, never the admin's.
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { recordAudit } from "@/kernel/audit/audit";
import { holdsAdminGrant, holdsSuperAdminGrant } from "@/kernel/identity/admin-register";
import { getSessionUser, type SessionUser } from "@/kernel/identity/session-user";
import { assignedRoles, personIdForAuthUser, rolePermissionsFromDb } from "@/kernel/identity/access-rows";
import { getTeamActor } from "@/kernel/identity/team-auth";
import { getPortalActor, type PortalActor } from "@/kernel/identity/portal-auth";
import { perRender } from "@/kernel/identity/per-render";
import { buildAccess, type AccessFacts } from "@/kernel/identity/access";
import type { Access, Target } from "@/kernel/identity/access-model";
import { currentSurface } from "@/kernel/shell/surface";
import { hasWaitingOn } from "@/kernel/approvals/waiting";
import { refuseWritesWhileAssuming, type TeamImpersonation } from "@/kernel/identity/team-assume";

/**
 * What a guard hands back: what the person may do, and who they are, in the
 * shape requireAdmin and requireRevenueAccess returned, so an action that
 * writes the actor's email to the audit log reads it from the same call that
 * let it in.
 */
export type RequestAccess = Access & {
  readonly user: SessionUser;
  /** The signed-in person's people.id; null for an env-only admin with no person record. */
  readonly personId: string | null;
  /**
   * Set while a Super Admin views the Team pages as someone else (team assume):
   * the access above is that person's, and `user` is still the admin, so a
   * refusal is recorded under the person really looking.
   */
  readonly impersonation: TeamImpersonation | null;
};

/**
 * The facts for the signed-in person, and who they are; null when nobody is
 * signed in on any register. While a Super Admin views the Team pages as
 * someone else, the facts are that person's (what they see is what the admin
 * sees), unless `asSignedIn` asks for the admin's own.
 */
async function accessFacts(asSignedIn = false): Promise<{ facts: AccessFacts; user: SessionUser; impersonation: TeamImpersonation | null } | null> {
  const [session, team] = await Promise.all([getSessionUser(), getTeamActor()]);
  const assumed = team.actor?.impersonation ? team.actor : null;
  if (assumed && !asSignedIn && session) {
    // Independent reads, so they run together (SR.1.5). Super Admin counts only
    // with Admin, and both come from one memoised read of the grants.
    const [isAdmin, superAdmin, isApprover, roles] = await Promise.all([
      holdsAdminGrant(assumed.email),
      holdsSuperAdminGrant(assumed.email),
      hasWaitingOn(assumed.personId),
      assignedRoles(assumed.personId),
    ]);
    const facts: AccessFacts = {
      personId: assumed.personId,
      teamMemberId: assumed.teamMemberId,
      isAdmin,
      isSuperAdmin: isAdmin && superAdmin,
      employmentType: assumed.employmentType,
      directReportPersonIds: assumed.personScope.filter((id) => id !== assumed.personId),
      isApprover,
      isPortalMember: false,
      portalCompanyIds: [],
      assignedRoles: roles,
    };
    return { facts, user: session, impersonation: assumed.impersonation };
  }
  // The admin's own facts while assuming carry no team actor: the one resolved
  // is the person being viewed, not them.
  const teamActor = assumed ? null : (team.actor ?? null);
  // A team member is never a portal member in their own right: the portal gate
  // sends anyone employed (the same PORTAL_STATUSES, the same auth user) to
  // /team, and an admin to /admin or to a client viewed through Assume, whose
  // facts are the client's. So the portal is asked only of someone with no team
  // actor. For an admin it was the slowest read of the request, a second whole
  // access build behind holdsSurfaceAdmin (SR.1.5). On the portal its own guard
  // has already resolved the actor, so this is the memoised answer.
  const portal = teamActor ? null : await getPortalActor();
  // An impersonating portal actor is the client the admin is viewing, not the admin.
  const portalActor = portal?.actor && !portal.actor.impersonation ? portal.actor : null;
  // The grants and, when a team or portal actor already names the person, that
  // person's approvals and roles do not wait on one another (SR.1.5). Only
  // someone neither gate recognises has their person looked up below, and theirs
  // are read after it.
  const knownPersonId = teamActor?.personId ?? portalActor?.personId ?? null;
  const [isAdmin, superAdmin, knownApprover, knownRoles] = await Promise.all([
    session ? holdsAdminGrant(session.email) : false,
    session ? holdsSuperAdminGrant(session.email) : false,
    knownPersonId ? hasWaitingOn(knownPersonId) : false,
    knownPersonId ? assignedRoles(knownPersonId) : [],
  ]);
  // The admin session first, as getRevenueUser read it: an admin who is also on
  // the team is audited under the admin sign-in.
  let user: SessionUser | null =
    (isAdmin ? session : null) ??
    (teamActor ? { id: teamActor.authUserId, email: teamActor.email } : null) ??
    (portalActor ? { id: portalActor.authUserId, email: portalActor.email } : null);
  let personId = knownPersonId;
  // Someone neither gate recognises may still hold a role granted in Settings,
  // Access, a custom role carrying surface.admin above all (ADR 0014): their
  // person is found from the sign-in itself, and their grants decide the rest.
  if (!user && session) {
    personId = await personIdForAuthUser(session.id);
    if (personId) user = session;
  }
  if (!user) return null;
  const [isApprover, roles] =
    personId === knownPersonId
      ? [knownApprover, knownRoles]
      : await Promise.all([personId ? hasWaitingOn(personId) : false, personId ? assignedRoles(personId) : []]);
  const facts: AccessFacts = {
    personId,
    teamMemberId: teamActor?.teamMemberId ?? null,
    isAdmin,
    isSuperAdmin: isAdmin && session !== null && superAdmin,
    employmentType: teamActor?.employmentType ?? null,
    directReportPersonIds: teamActor ? teamActor.personScope.filter((id) => id !== teamActor.personId) : [],
    isApprover,
    isPortalMember: portalActor !== null,
    portalCompanyIds: portalActor?.companyScope ?? [],
    assignedRoles: roles,
  };
  return { facts, user, impersonation: null };
}

/** What the signed-in person may do, once per render; null when nobody is signed in. */
export const getAccess = perRender(async (): Promise<RequestAccess | null> => {
  const found = await accessFacts();
  if (!found) return null;
  const access = await buildAccess(found.facts, rolePermissionsFromDb);
  return Object.assign(access, { user: found.user, personId: found.facts.personId, impersonation: found.impersonation });
});

/** The signed-in person's own access, even while they view the Team pages as someone else. */
const getOwnAccess = perRender(async (): Promise<RequestAccess | null> => {
  const found = await accessFacts(true);
  if (!found) return null;
  const access = await buildAccess(found.facts, rolePermissionsFromDb);
  return Object.assign(access, { user: found.user, personId: found.facts.personId, impersonation: null });
});

/** Where a refused request was headed, as best the request says; null when it does not say. */
async function refusedPath(): Promise<string | null> {
  try {
    const h = await headers();
    return h.get("x-invoke-path") ?? h.get("referer");
  } catch {
    return null;
  }
}

/**
 * A refusal leaves a row, so a person who is turned away from a page they
 * should reach is visible in production (AC.16). Like every audit write it is
 * best-effort: a failed insert is only logged and never changes the answer.
 */
async function recordRefusal(user: SessionUser, permission: string, target: Target | undefined): Promise<void> {
  try {
    await recordAudit({
      table: "access_refusals",
      recordId: null,
      operation: "insert",
      actor: user.email,
      context: { permission, target: target ?? null, path: await refusedPath() },
    });
  } catch (e) {
    console.error("[access] could not record a refusal:", e instanceof Error ? e.message : e);
  }
}

/**
 * The first statement of a page or server action that needs `permission`
 * (ADR 0007). With a target, the permission's reach must cover that person or
 * company. Nobody signed in goes to the surface's sign-in. Someone signed in
 * without the permission is recorded, then either shown the kernel's refusal
 * page, which names the permission and who can grant it, or, when they do not
 * hold access.explain (the Contractor baseline's flag), told the page does not
 * exist. The refusal page needs only the surface's own permission, and refusing
 * that one is a 404, so a refusal never loops.
 */
export async function requirePermission(
  permission: string,
  target?: Target,
  options?: { asSignedIn?: boolean },
): Promise<RequestAccess> {
  // asSignedIn asks the admin's own access while they view the Team pages as
  // someone else: only the controls that end that view use it.
  const access = options?.asSignedIn ? await getOwnAccess() : await getAccess();
  const base = (await currentSurface()) === "team" ? "/team" : "/admin";
  if (!access) redirect(`${base}/login`);
  if (!access.may(permission, target)) {
    await recordRefusal(access.user, permission, target);
    // The refusal page itself needs the surface's own permission, so refusing
    // that one with a redirect to it would loop: it is a 404 whoever asks.
    const refusalPageNeedsIt = permission === `surface.${base.slice(1)}`;
    if (!refusalPageNeedsIt && access.may("access.explain")) redirect(`${base}/refused?p=${encodeURIComponent(permission)}`);
    notFound();
  }
  // Viewing as someone else is read-only: a page renders, a write is refused.
  await refuseWritesWhileAssuming(access.impersonation);
  return access;
}

/**
 * What the client an admin is viewing through Assume may do: the client's own
 * facts and grants, never the admin's. Viewing a portal "as them" means seeing
 * exactly what they see.
 */
async function clientAccess(actor: PortalActor): Promise<Access> {
  return buildAccess(
    {
      personId: actor.personId,
      teamMemberId: null,
      isAdmin: false,
      isSuperAdmin: false,
      employmentType: null,
        directReportPersonIds: [],
      isApprover: false,
      isPortalMember: true,
      portalCompanyIds: actor.companyScope,
      assignedRoles: await assignedRoles(actor.personId),
    },
    rolePermissionsFromDb,
  );
}

/**
 * The first statement of a client-portal page or server action (ADR 0013,
 * AC.14), in place of requirePortalMember: it refuses someone without a portal
 * identity the way requirePortalMember did, then asks for `permission`, and
 * hands back the portal actor the page or action reads. During an Assume
 * session the permission is asked of the client being viewed, so the admin sees
 * what the client sees. A refused person goes to the portal's sign-in rather
 * than its home, which would ask again.
 */
export async function requirePortalPermission(permission: string): Promise<PortalActor> {
  const { actor, redirectTo } = await getPortalActor();
  if (!actor) redirect(redirectTo);
  const access = actor.impersonation ? await clientAccess(actor) : await getAccess();
  if (!access?.may(permission)) redirect("/portal/login");
  return actor;
}
