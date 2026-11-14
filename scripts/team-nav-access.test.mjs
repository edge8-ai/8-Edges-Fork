import { afterEach, describe, expect, it } from "vitest";
import { TEAM_NAV } from "../app/nav.ts";
import { PERMISSIONS } from "../app/permissions.ts";
import { keepRows } from "../kernel/shell/nav.ts";
import { permissionForPath } from "../kernel/identity/permission-lookup.ts";
import { buildAccess } from "../kernel/identity/access.ts";
import { registerAccessContributions, resetAccessContributions } from "../kernel/identity/access-contributions.ts";

// AC.8: the Team layout shows a row only to someone who may open its page, and
// nothing else decides it (team-nav-gate is gone; app/nav.test.ts pins each
// viewer's rows). Here: the row follows the permission the moment a role loses
// it, which is what narrowing the Contractor baseline (AC.19) relies on.

afterEach(() => resetAccessContributions());

const rows = Object.entries(PERMISSIONS.atoms).flatMap(([permission, a]) =>
  a.holders.map((h) => ({ role: h.role, permission, scope: h.scope })),
);
const source = async (roles) => rows.filter((r) => roles.includes(r.role));
const hrefs = (sections) => sections.flatMap((s) => s.groups.flatMap((g) => g.items.flatMap((i) => ("items" in i ? i.items : [i]).map((x) => x.href)))).sort();

describe("the Team sidebar under permissions", () => {
  it("drops a row the moment its role loses the permission", async () => {
    registerAccessContributions([]);
    const without = rows.filter((r) => !(r.role === "contractor" && r.permission === "team.directory"));
    const access = await buildAccess(
      { personId: "p-1", teamMemberId: "tm-1", isAdmin: false, isSuperAdmin: false, employmentType: "contract", directReportPersonIds: [], isApprover: false, isPortalMember: false, portalCompanyIds: [], assignedRoles: [] },
      async (roles) => without.filter((r) => roles.includes(r.role)),
    );
    const allowed = keepRows(TEAM_NAV, (item) => {
      const permission = permissionForPath(PERMISSIONS.routes, item.href);
      return permission === null || permission === "public" || access.may(permission);
    });
    expect(hrefs(allowed)).not.toContain("/team/directory");
    expect(hrefs(allowed)).toContain("/team/profile");
  });
});
