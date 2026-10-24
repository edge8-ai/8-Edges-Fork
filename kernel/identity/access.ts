// The access resolver's core (ADR 0013): from the facts the kernel's own
// registers hold, plus the facts entities register, to what a person may do.
//
// The kernel's registers give these roles directly:
//   - Admin and Super Admin, from company_os.admins (and the bootstrap
//     allowlist), until AC.20 folds that table into access_role_assignments;
//   - Team member or Contractor, from employment type: contract is Contractor,
//     any other engagement Team member;
//   - Manager, from having direct reports;
//   - Approver, from a request waiting on their decision (company_os.approvals);
//   - Client user, from an active portal membership, whether or not it names a
//     company (four live members' memberships name none, and the portal
//     admits them today).
// Revenue, Finance and every other role an admin hands out are grants in
// access_role_assignments (AE.3 moved the last module flags there).
// Coach and Hiring manager, a coach's coachees and a person's assigned clients
// come from the entities (access-contributions.ts).
//
// Which permissions each role holds comes from a source the caller passes: the
// live rows of access_role_permissions once that table is applied. Keeping it a
// parameter keeps every rule here testable without a database.
import { assertRegistered, impliedRoles, reachIds, type AccessSubject } from "@/kernel/identity/access-contributions";
import { resolveAccess, type Access, type RoleHolding, type RolePermission } from "@/kernel/identity/access-model";

/** What the kernel's registers say about the signed-in person. */
export type AccessFacts = {
  /** Null for an env-only admin with no person record. */
  readonly personId: string | null;
  /** The live team_members.id, or null for someone not on the team. */
  readonly teamMemberId: string | null;
  readonly isAdmin: boolean;
  /** Cleared for sensitive data: a live Super Admin grant, or the ADMIN_ALLOWLIST bootstrap (AC.20). */
  readonly isSuperAdmin: boolean;
  /** team_members.employment_type, or null. */
  readonly employmentType: string | null;
  readonly directReportPersonIds: readonly string[];
  /** Whether a pending approval names them as its approver. */
  readonly isApprover: boolean;
  /** Whether the person has an active portal membership. */
  readonly isPortalMember: boolean;
  /** The companies.id of every client company the person is a portal member of. */
  readonly portalCompanyIds: readonly string[];
  /** The live grants in access_role_assignments, each with the grant's reason. */
  readonly assignedRoles: readonly RoleHolding[];
};

/** Which permissions the given roles hold: the live rows of access_role_permissions. */
export type RolePermissionSource = (roles: readonly string[]) => Promise<readonly RolePermission[]>;

/** The roles the kernel's own registers give, each with why. */
export function kernelRoles(f: AccessFacts): RoleHolding[] {
  const out: RoleHolding[] = [];
  if (f.isAdmin) out.push({ role: "admin", because: "is an admin" });
  if (f.isSuperAdmin) out.push({ role: "super-admin", because: "is cleared to see sensitive data" });
  if (f.teamMemberId !== null) {
    out.push(
      f.employmentType === "contract"
        ? { role: "contractor", because: "is on the team on a contract" }
        : { role: "team-member", because: "is on the team" },
    );
  }
  if (f.directReportPersonIds.length > 0) {
    const n = f.directReportPersonIds.length;
    out.push({ role: "manager", because: `${n} ${n === 1 ? "person reports" : "people report"} to them` });
  }
  if (f.isApprover) out.push({ role: "approver", because: "has a request waiting on their decision" });
  if (f.isPortalMember || f.portalCompanyIds.length > 0) out.push({ role: "client-user", because: "is a member of a client company" });
  out.push(...f.assignedRoles);
  return out;
}

/**
 * What a person may do. The entities' facts are asked only about someone with a
 * person record; a fact that cannot be read throws, so the request is refused
 * rather than answered with less than the person holds.
 */
export async function buildAccess(facts: AccessFacts, permissionsOf: RolePermissionSource): Promise<Access> {
  const subject: AccessSubject | null =
    facts.personId === null ? null : { personId: facts.personId, teamMemberId: facts.teamMemberId, isAdmin: facts.isAdmin };
  // Someone with no person record (an env-only admin) has no entity facts to
  // ask about, but an unregistered build still refuses them like anyone else.
  if (!subject) assertRegistered();
  const [implied, coachees, clients] = subject
    ? await Promise.all([impliedRoles(subject), reachIds(subject, "team"), reachIds(subject, "clients")])
    : [[], [], []];
  const roles = [...kernelRoles(facts), ...implied];
  const rolePermissions = await permissionsOf([...new Set(roles.map((r) => r.role))]);
  return resolveAccess(roles, rolePermissions, {
    personId: facts.personId ?? "",
    reportIds: [...new Set([...facts.directReportPersonIds, ...coachees])],
    clientIds: [...new Set([...clients, ...facts.portalCompanyIds])],
  });
}
