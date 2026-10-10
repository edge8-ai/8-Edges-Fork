import { describe, expect, it } from "vitest";
import {
  addPermissionRefusal,
  granteeRefusal,
  grantRefusal,
  LOCKED_ROLES,
  removePermissionRefusal,
  revokeRefusal,
  roleKeyFrom,
  scopeCovers,
} from "./access-grants";
import type { RolePermission } from "./access-model";

// Settings → Access refuses what would hand out more than the granter has,
// a role that follows a fact, and a permission no installed area declares.

const superAdmin: RolePermission[] = [
  { role: "super-admin", permission: "access.manage", scope: "all" },
  { role: "admin", permission: "crm.pipeline", scope: "all" },
  { role: "admin", permission: "boards.open", scope: "all" },
  { role: "team-member", permission: "time-off.approve", scope: "own" },
];
const plainAdmin = superAdmin.filter((p) => p.permission !== "access.manage");
// Someone who manages access through a role of their own, not Super Admin: the
// hold rule binds them exactly as before AE.2.
const steward: RolePermission[] = superAdmin.map((p) => (p.role === "super-admin" ? { ...p, role: "access-steward" } : p));
const role = (key: string, kind: "granted" | "implied" = "granted", archived = false) => ({ key, kind, archived });
const revenue: RolePermission[] = [{ role: "revenue", permission: "crm.pipeline", scope: "all" }];

describe("scopeCovers", () => {
  it("lets all cover everything, and team or clients cover own", () => {
    expect(scopeCovers("all", "team")).toBe(true);
    expect(scopeCovers("team", "own")).toBe(true);
    expect(scopeCovers("clients", "own")).toBe(true);
    expect(scopeCovers("own", "team")).toBe(false);
    expect(scopeCovers("team", "clients")).toBe(false);
  });
});

describe("granting a role", () => {
  it("lets a holder of access.manage grant a role whose every permission they hold", () => {
    expect(grantRefusal(role("revenue"), revenue, superAdmin)).toBeNull();
  });

  it("lets them grant a new one-person role nobody holds yet, when they hold what it carries", () => {
    expect(grantRefusal(role("reimbursement-approver"), [{ role: "reimbursement-approver", permission: "boards.open", scope: "all" }], superAdmin)).toBeNull();
  });

  it("refuses someone without access.manage", () => {
    expect(grantRefusal(role("revenue"), revenue, plainAdmin)).toMatch(/manages access/);
  });

  it("refuses a role carrying something the granter does not hold, naming it", () => {
    const finance: RolePermission[] = [{ role: "finance", permission: "finance.expenses", scope: "all" }];
    expect(grantRefusal(role("finance"), finance, steward)).toMatch(/finance\.expenses \(all\)/);
  });

  it("refuses a wider scope than the granter holds", () => {
    const wide: RolePermission[] = [{ role: "x", permission: "time-off.approve", scope: "all" }];
    expect(grantRefusal(role("x"), wide, steward)).toMatch(/time-off\.approve \(all\)/);
  });

  it("refuses an implied role and an archived one", () => {
    expect(grantRefusal(role("manager", "implied"), [], superAdmin)).toMatch(/follows a fact/);
    expect(grantRefusal(role("old", "granted", true), [], superAdmin)).toMatch(/archived/);
  });

  it("grants Admin and Super Admin here like any role, under the same rule (AC.20)", () => {
    const adminCarries: RolePermission[] = [{ role: "admin", permission: "crm.pipeline", scope: "all" }];
    expect(grantRefusal(role("admin"), adminCarries, superAdmin)).toBeNull();
    expect(grantRefusal(role("super-admin"), [{ role: "super-admin", permission: "access.manage", scope: "all" }], superAdmin)).toBeNull();
    const expenses: RolePermission[] = [{ role: "super-admin", permission: "finance.expenses", scope: "all" }];
    expect(grantRefusal(role("super-admin"), expenses, steward)).toMatch(/finance\.expenses \(all\)/);
  });
});

describe("revoking a grant", () => {
  // Someone else's grant, with two Super Admins left.
  const other = { granterPersonIds: ["p-me"], granteePersonId: "p-other", liveSuperAdmins: 2 };

  it("lets a manager of access revoke a granted role", () => {
    expect(revokeRefusal(role("revenue"), superAdmin, other)).toBeNull();
  });

  it("refuses an implied role, which follows its fact", () => {
    expect(revokeRefusal(role("coach", "implied"), superAdmin, other)).toMatch(/change the fact/);
  });

  it("refuses someone without access.manage", () => {
    expect(revokeRefusal(role("revenue"), plainAdmin, other)).toMatch(/manages access/);
  });

  it("lets a manager of access revoke someone else's Admin or Super Admin", () => {
    expect(revokeRefusal(role("admin"), superAdmin, other)).toBeNull();
    expect(revokeRefusal(role("super-admin"), superAdmin, other)).toBeNull();
  });

  it("refuses taking Admin or Super Admin from yourself, under any of your person rows", () => {
    const self = { granterPersonIds: ["p-me", "p-me-duplicate"], granteePersonId: "p-me-duplicate", liveSuperAdmins: 3 };
    expect(revokeRefusal(role("admin"), superAdmin, self)).toMatch(/You can't remove yourself/);
    expect(revokeRefusal(role("super-admin"), superAdmin, self)).toMatch(/You can't remove yourself/);
    // Any other role of your own is yours to give up.
    expect(revokeRefusal(role("revenue"), superAdmin, self)).toBeNull();
  });

  it("refuses revoking the last live Super Admin grant", () => {
    expect(revokeRefusal(role("super-admin"), superAdmin, { ...other, liveSuperAdmins: 1 })).toMatch(/last Super Admin grant/);
    // The last Admin grant is not the guard's business: a Super Admin still manages access.
    expect(revokeRefusal(role("admin"), superAdmin, { ...other, liveSuperAdmins: 1 })).toBeNull();
  });
});

describe("editing a role's permissions", () => {
  const declared = new Set(["crm.pipeline", "boards.open", "time-off.approve", "access.manage"]);

  it("adds a declared permission the editor holds", () => {
    expect(addPermissionRefusal(role("revenue"), "boards.open", "all", declared, superAdmin)).toBeNull();
  });

  it("refuses a key no installed area declares", () => {
    expect(addPermissionRefusal(role("revenue"), "crm.pipline", "all", declared, superAdmin)).toMatch(/No installed area declares "crm\.pipline"/);
  });

  it("refuses a permission or scope the editor does not hold", () => {
    expect(addPermissionRefusal(role("revenue"), "time-off.approve", "all", declared, steward)).toMatch(/only what you hold/);
  });

  it("leaves the Admin roles to their declarations", () => {
    expect(addPermissionRefusal(role("admin"), "boards.open", "all", declared, superAdmin)).toMatch(/declares them/);
    expect(removePermissionRefusal(role("super-admin"), superAdmin)).toMatch(/declares them/);
  });

  it("lets a manager of access take a permission off a role, an implied one included", () => {
    expect(removePermissionRefusal(role("contractor", "implied"), superAdmin)).toBeNull();
    expect(removePermissionRefusal(role("contractor", "implied"), plainAdmin)).toMatch(/manages access/);
  });
});

// AE.2: the hold rule stops a granter escalating others past themselves, and
// Super Admin is the ceiling, so a Super Admin grants and edits without holding
// what the role carries. Nobody else is exempt, and the locked roles stay locked.
describe("the Super Admin exemption", () => {
  const declared = new Set(["crm.pipeline", "boards.open", "time-off.approve", "access.manage", "finance.invoices"]);
  const accountant: RolePermission[] = [
    { role: "accountant", permission: "finance.invoices", scope: "all" },
    { role: "accountant", permission: "time-off.approve", scope: "all" },
  ];

  it("lets a Super Admin grant a role carrying what they do not hold", () => {
    expect(grantRefusal(role("accountant"), accountant, superAdmin)).toBeNull();
  });

  it("lets a Super Admin add an atom they do not hold, at any scope, to an unlocked role", () => {
    expect(addPermissionRefusal(role("accountant"), "finance.invoices", "all", declared, superAdmin)).toBeNull();
    expect(addPermissionRefusal(role("accountant"), "time-off.approve", "all", declared, superAdmin)).toBeNull();
  });

  it("lets a Super Admin take an atom off an unlocked role", () => {
    expect(removePermissionRefusal(role("accountant"), superAdmin)).toBeNull();
  });

  it("keeps the hold rule for someone who manages access without being Super Admin", () => {
    expect(grantRefusal(role("accountant"), accountant, steward)).toMatch(/You do not hold finance\.invoices \(all\), time-off\.approve \(all\)/);
    expect(addPermissionRefusal(role("accountant"), "finance.invoices", "all", declared, steward)).toMatch(/only what you hold/);
  });

  it("gives an Admin nothing: without access.manage they may not grant or edit at all", () => {
    expect(grantRefusal(role("accountant"), accountant, plainAdmin)).toMatch(/manages access/);
    expect(addPermissionRefusal(role("accountant"), "boards.open", "all", declared, plainAdmin)).toMatch(/manages access/);
  });

  it("does not open the locked roles, an undeclared atom, an implied role or an archived one to a Super Admin", () => {
    expect(addPermissionRefusal(role("admin"), "finance.invoices", "all", declared, superAdmin)).toMatch(/declares them/);
    expect(removePermissionRefusal(role("super-admin"), superAdmin)).toMatch(/declares them/);
    expect(addPermissionRefusal(role("accountant"), "finance.invoics", "all", declared, superAdmin)).toMatch(/No installed area declares/);
    expect(grantRefusal(role("manager", "implied"), [], superAdmin)).toMatch(/follows a fact/);
    expect(grantRefusal(role("old", "granted", true), accountant, superAdmin)).toMatch(/archived/);
  });
});

// The locked roles are named here and declared in the kernel's permission
// declaration; the two lists must be the same, or a declared bundle would be
// editable on the screen, or a locked role would have no declaration.
describe("LOCKED_ROLES", () => {
  it("is exactly the bundles the kernel declares", async () => {
    const { permissions } = await import("./permissions");
    expect([...LOCKED_ROLES].sort()).toEqual(Object.keys(permissions.roles ?? {}).sort());
  });
});

describe("roleKeyFrom", () => {
  it("turns a typed name into a role key", () => {
    expect(roleKeyFrom("Reimbursement approver")).toBe("reimbursement-approver");
    expect(roleKeyFrom("  Billing / QA  ")).toBe("billing-qa");
  });
});

describe("granteeRefusal", () => {
  const refused = "Super Admin goes only to a full-time, part-time or intern team member.";

  it("gives Super Admin only to a current full-time, part-time or intern team member", () => {
    for (const t of ["full_time", "part_time", "intern"]) expect(granteeRefusal("super-admin", { employmentTypes: [t] })).toBeNull();
    for (const t of ["contract", "temp", "advisor"]) expect(granteeRefusal("super-admin", { employmentTypes: [t] })).toBe(refused);
    expect(granteeRefusal("super-admin", { employmentTypes: [] })).toBe(refused);
  });

  it("lets Admin and every other role go to a contractor, temp, advisor or anyone in the register", () => {
    for (const t of ["contract", "temp", "advisor"]) expect(granteeRefusal("admin", { employmentTypes: [t] })).toBeNull();
    expect(granteeRefusal("admin", { employmentTypes: [] })).toBeNull();
    expect(granteeRefusal("finance", { employmentTypes: ["contract"] })).toBeNull();
  });
});
