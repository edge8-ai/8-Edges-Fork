import { afterEach, describe, expect, it } from "vitest";

import { buildAccess, kernelRoles, type AccessFacts } from "@/kernel/identity/access";
import { registerAccessContributions, resetAccessContributions } from "@/kernel/identity/access-contributions";
import type { RolePermission } from "@/kernel/identity/access-model";

// The resolver's own rules: which roles the kernel's tables give a person, and
// how those roles, the entities' registered facts and the roles' permissions
// add up to what a person may do. The permission source is injected, so these
// cases need no database.

afterEach(() => resetAccessContributions());

const nobody: AccessFacts = {
  personId: "p-1",
  teamMemberId: null,
  isAdmin: false,
  isSuperAdmin: false,
  employmentType: null,
  directReportPersonIds: [],
  isApprover: false,
  isPortalMember: false,
  portalCompanyIds: [],
  assignedRoles: [],
};
const member: AccessFacts = { ...nobody, teamMemberId: "tm-1", employmentType: "full_time" };

const keys = (f: AccessFacts) => kernelRoles(f).map((r) => r.role).sort();

describe("kernelRoles", () => {
  it("gives nothing to someone on no register", () => {
    expect(keys(nobody)).toEqual([]);
  });

  it("makes a team member on any engagement but contract a Team member, and contract a Contractor", () => {
    expect(keys(member)).toEqual(["team-member"]);
    expect(keys({ ...member, employmentType: "part_time" })).toEqual(["team-member"]);
    expect(keys({ ...member, employmentType: "intern" })).toEqual(["team-member"]);
    expect(keys({ ...member, employmentType: "contract" })).toEqual(["contractor"]);
  });

  it("makes someone with direct reports a Manager, and says why", () => {
    const roles = kernelRoles({ ...member, directReportPersonIds: ["p-2", "p-3"] });
    expect(roles).toContainEqual({ role: "manager", because: "2 people report to them" });
  });

  it("gives Revenue and Finance only through a grant, never from a team_members flag (AE.3)", () => {
    expect(keys(member)).toEqual(["team-member"]);
    const granted = [{ role: "revenue", because: "was granted it: migrated from team_members.permissions" }];
    expect(keys({ ...member, assignedRoles: granted })).toEqual(["revenue", "team-member"]);
  });

  it("gives an admin Admin, and a sensitive-cleared admin Super Admin as well", () => {
    expect(keys({ ...nobody, isAdmin: true })).toEqual(["admin"]);
    expect(keys({ ...nobody, isAdmin: true, isSuperAdmin: true })).toEqual(["admin", "super-admin"]);
  });

  it("adds every role granted in Settings, Access, with the grant's reason", () => {
    const roles = kernelRoles({ ...member, assignedRoles: [{ role: "reimbursement-payer", because: "granted by Dave: pays approved claims" }] });
    expect(roles).toContainEqual({ role: "reimbursement-payer", because: "granted by Dave: pays approved claims" });
  });

  it("makes a member of a client company a Client user", () => {
    expect(keys({ ...nobody, isPortalMember: true, portalCompanyIds: ["c-acme"] })).toEqual(["client-user"]);
    // Four live memberships name no company; their holders reach the portal today.
    expect(keys({ ...nobody, isPortalMember: true })).toEqual(["client-user"]);
  });
});

const perms: RolePermission[] = [
  { role: "team-member", permission: "surface.team", scope: "all" },
  { role: "team-member", permission: "time-off.approve", scope: "own" },
  { role: "manager", permission: "time-off.approve", scope: "team" },
  { role: "coach", permission: "coaching.roster", scope: "team" },
  { role: "team-member", permission: "team.clients", scope: "clients" },
];
const source = async (roles: readonly string[]) => perms.filter((p) => roles.includes(p.role));

describe("buildAccess", () => {
  it("refuses to resolve before the entities' facts are registered", async () => {
    await expect(buildAccess(member, source)).rejects.toThrow(/not registered/);
  });

  it("adds the entities' implied roles to the kernel's, and their reach to the scopes", async () => {
    registerAccessContributions([
      {
        impliers: [{ role: "coach", because: "coaches at least one person", holds: async () => true }],
        reach: [
          { scope: "team", ids: async () => ["p-coachee"] },
          { scope: "clients", ids: async () => ["c-acme"] },
        ],
      },
    ]);
    const access = await buildAccess({ ...member, directReportPersonIds: ["p-report"] }, source);
    expect(access.roles.map((r) => r.role).sort()).toEqual(["coach", "manager", "team-member"]);
    // A manager's team reaches their report; a coach's team reaches their coachee too.
    expect(access.may("time-off.approve", { person: "p-report" })).toBe(true);
    expect(access.may("coaching.roster", { person: "p-coachee" })).toBe(true);
    expect(access.may("team.clients", { company: "c-acme" })).toBe(true);
    expect(access.may("team.clients", { company: "c-other" })).toBe(false);
  });

  it("asks the permission source only for the roles the person holds", async () => {
    registerAccessContributions([]);
    let asked: readonly string[] = [];
    await buildAccess(member, async (roles) => ((asked = roles), []));
    expect(asked).toEqual(["team-member"]);
  });

  it("does not ask an entity about someone with no person record, and still resolves the kernel's roles", async () => {
    registerAccessContributions([{ impliers: [{ role: "coach", because: "x", holds: async () => { throw new Error("must not be asked"); } }] }]);
    const access = await buildAccess({ ...nobody, personId: null, isAdmin: true }, async () => []);
    expect(access.roles.map((r) => r.role)).toEqual(["admin"]);
  });

  it("refuses when an entity's fact cannot be read", async () => {
    registerAccessContributions([{ impliers: [{ role: "coach", because: "x", holds: async () => { throw new Error("read failed"); } }] }]);
    await expect(buildAccess(member, source)).rejects.toThrow(/read failed/);
  });
});
