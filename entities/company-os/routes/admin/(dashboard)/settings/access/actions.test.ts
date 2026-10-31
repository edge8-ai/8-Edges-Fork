import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// Settings → Access (AC.17): a grant is refused to someone without
// access.manage or who would hand out more than they hold; an implied role
// cannot be revoked; a permission no installed area declares is refused; and
// every grant and revoke writes an audit row naming who did it. Since AC.20,
// granting Admin sends a new admin their sign-in email, and nobody may take
// Admin or Super Admin from themselves or revoke the last Super Admin grant.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const emailed: string[] = [];
let emailResult: { ok: true; message: string | null } | { ok: false; error: string } = { ok: true, message: null };
vi.mock("@/entities/company-os/lib/admin-sign-in", () => ({
  sendAccessEmail: async (email: string) => {
    emailed.push(email);
    return emailResult;
  },
}));
vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (table: string) => builderFor(table) } }));
const audits: { table: string; operation: string; actor?: string | null; newData?: unknown }[] = [];
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: async (a: (typeof audits)[number]) => void audits.push(a) }));
vi.mock("@/kernel/identity/writes", () => ({
  insertAccessRoleAssignments: (row: unknown) => builderFor("access_role_assignments").insert(row),
  updateAccessRoleAssignments: (patch: unknown) => builderFor("access_role_assignments").update(patch),
  insertAccessRoles: (row: unknown) => builderFor("access_roles").insert(row),
  insertAccessRolePermissions: (row: unknown) => builderFor("access_role_permissions").insert(row),
  updateAccessRolePermissions: (patch: unknown) => builderFor("access_role_permissions").update(patch),
}));
vi.mock("@/kernel/identity/permission-registry", () => ({
  permissionRegistry: () => ({ atoms: { "crm.pipeline": {}, "boards.open": {}, "access.manage": {} }, routes: {}, actions: {}, implies: {} }),
}));
// The granter: a Super Admin who holds access.manage, crm.pipeline and boards.open.
let held = [
  { role: "super-admin", permission: "access.manage", scope: "all" },
  { role: "admin", permission: "crm.pipeline", scope: "all" },
  { role: "admin", permission: "boards.open", scope: "all" },
];
const asked: string[] = [];
vi.mock("@/kernel/identity/access-request", () => ({
  requirePermission: async (p: string) => {
    asked.push(p);
    return { roles: [{ role: "super-admin", because: "" }, { role: "admin", because: "" }], user: { id: "auth-1", email: "boss@example.com" }, personId: "p-boss" };
  },
}));
vi.mock("@/kernel/identity/access-rows", () => ({ rolePermissionsFromDb: async () => held }));

import { addRolePermission, grantRole, revokeGrant } from "./actions";

const PERSON = "11111111-1111-4111-8111-111111111111";
const ROLE = "22222222-2222-4222-8222-222222222222";
const GRANT = "33333333-3333-4333-8333-333333333333";
const role = (key: string, kind = "granted") => script("access_roles", { data: [{ id: ROLE, key, name: key, kind, archived_at: null }] });
const carries = (...permissions: string[]) => script("access_role_permissions", { data: permissions.map((permission) => ({ permission, scope: "all" })) });

beforeEach(() => {
  resetFake();
  audits.length = 0;
  asked.length = 0;
  emailed.length = 0;
  emailResult = { ok: true, message: null };
  held = [
    { role: "super-admin", permission: "access.manage", scope: "all" },
    { role: "admin", permission: "crm.pipeline", scope: "all" },
    { role: "admin", permission: "boards.open", scope: "all" },
  ];
});

describe("grantRole", () => {
  it("grants a role whose every permission the granter holds, and audits who granted it and why", async () => {
    role("revenue");
    carries("crm.pipeline");
    script("access_role_assignments", { data: { id: GRANT } });
    expect(await grantRole(PERSON, ROLE, "Runs the pipeline now")).toEqual({ ok: true, message: "revenue granted." });
    const insert = calls.find((c) => c.table === "access_role_assignments" && c.ops[0] === "insert");
    expect(insert?.payloads[0]).toEqual({ person_id: PERSON, role_id: ROLE, granted_by: "p-boss", reason: "Runs the pipeline now" });
    expect(audits).toEqual([
      expect.objectContaining({ table: "access_role_assignments", operation: "insert", actor: "boss@example.com" }),
    ]);
    expect(asked).toEqual(["access.manage"]);
  });

  it("refuses a role carrying something the granter does not hold, and writes nothing", async () => {
    // Someone who manages access through a role of their own, not Super Admin,
    // whom the hold rule still binds (AE.2 exempts only Super Admin).
    held = held.map((p) => (p.role === "super-admin" ? { ...p, role: "access-steward" } : p));
    role("finance");
    carries("finance.expenses");
    const res = await grantRole(PERSON, ROLE, "Pays people");
    expect(res).toMatchObject({ ok: false, error: expect.stringMatching(/only what you hold/) });
    expect(calls.some((c) => c.ops[0] === "insert")).toBe(false);
    expect(audits).toEqual([]);
  });

  it("refuses a granter without access.manage", async () => {
    held = held.filter((p) => p.permission !== "access.manage");
    role("revenue");
    carries("crm.pipeline");
    expect(await grantRole(PERSON, ROLE, "Runs the pipeline")).toMatchObject({ ok: false, error: expect.stringMatching(/manages access/) });
  });

  it("refuses an implied role", async () => {
    role("manager", "implied");
    carries();
    expect(await grantRole(PERSON, ROLE, "Leads a team")).toMatchObject({ ok: false, error: expect.stringMatching(/follows a fact/) });
  });

  it("asks for a reason", async () => {
    expect(await grantRole(PERSON, ROLE, "")).toMatchObject({ ok: false });
    expect(calls).toEqual([]);
  });

  it("grants Admin here and invites a new admin to sign in (AC.20)", async () => {
    role("admin");
    carries("crm.pipeline");
    script("access_role_assignments", { data: { id: GRANT } });
    script("people", { data: [{ email: "Lan@Example.com" }] });
    emailResult = { ok: true, message: "Invite sent to lan@example.com." };
    expect(await grantRole(PERSON, ROLE, "Runs operations")).toEqual({ ok: true, message: "admin granted. Invite sent to lan@example.com." });
    expect(emailed).toEqual(["Lan@Example.com"]);
  });

  it("refuses Super Admin to a contractor, and writes nothing", async () => {
    role("super-admin");
    carries("crm.pipeline");
    script("team_members", { data: [{ employment_type: "contract" }] });
    expect(await grantRole(PERSON, ROLE, "Runs operations")).toMatchObject({
      ok: false,
      error: "Super Admin goes only to a full-time, part-time or intern team member.",
    });
    expect(calls.some((c) => c.table === "access_role_assignments" && c.ops[0] === "insert")).toBe(false);
  });

  it("keeps an Admin grant whose sign-in email failed, and says so", async () => {
    role("admin");
    carries("crm.pipeline");
    script("access_role_assignments", { data: { id: GRANT } });
    script("people", { data: [{ email: "lan@example.com" }] });
    emailResult = { ok: false, error: "Invite failed: rate limited" };
    const res = await grantRole(PERSON, ROLE, "Runs operations");
    expect(res).toMatchObject({ ok: true, message: expect.stringMatching(/could not be sent \(Invite failed: rate limited\)/) });
    expect(audits).toHaveLength(1);
  });

  it("sends no email for any other role", async () => {
    role("revenue");
    carries("crm.pipeline");
    script("access_role_assignments", { data: { id: GRANT } });
    await grantRole(PERSON, ROLE, "Runs the pipeline now");
    expect(emailed).toEqual([]);
  });
});

/** The facts a revoke reads: the granter's person rows and the live Super Admin count. */
function revokeFacts(granterPeople: string[], liveSuperAdmins: number) {
  script("people", { data: granterPeople.map((id) => ({ id })) });
  script("access_roles", { data: [{ id: "r-super" }] });
  script("access_role_assignments", { count: liveSuperAdmins });
}

describe("revokeGrant", () => {
  it("puts a Super Admin grant back when a revoke at the same moment left none", async () => {
    script("access_role_assignments", { data: [{ id: GRANT, person_id: PERSON, role_id: ROLE, revoked_at: null }] });
    role("super-admin");
    carries("access.manage");
    revokeFacts(["p-boss"], 2);
    script("access_role_assignments", { data: null }); // the revoke
    script("access_roles", { data: [{ id: "r-super" }] });
    script("access_role_assignments", { count: 0 }, { data: null }); // the recount, then the undo
    expect(await revokeGrant(GRANT, "Stepping back")).toMatchObject({ ok: false, error: expect.stringMatching(/same moment/) });
    const updates = calls.filter((c) => c.table === "access_role_assignments" && c.ops[0] === "update");
    expect(updates.map((u) => u.payloads[0])).toEqual([
      expect.objectContaining({ revoke_reason: "Stepping back" }),
      { revoked_at: null, revoked_by: null, revoke_reason: null },
    ]);
    expect(audits).toEqual([]);
  });

  it("stamps the grant revoked with who and why, and audits it", async () => {
    script("access_role_assignments", { data: [{ id: GRANT, person_id: PERSON, role_id: ROLE, revoked_at: null }] });
    role("revenue");
    carries("crm.pipeline");
    revokeFacts(["p-boss"], 2);
    script("access_role_assignments", { data: null });
    expect(await revokeGrant(GRANT, "Moved to delivery")).toMatchObject({ ok: true });
    const update = calls.find((c) => c.table === "access_role_assignments" && c.ops[0] === "update");
    expect(update?.payloads[0]).toMatchObject({ revoked_by: "p-boss", revoke_reason: "Moved to delivery" });
    expect(audits).toEqual([expect.objectContaining({ table: "access_role_assignments", operation: "update", actor: "boss@example.com" })]);
  });

  it("refuses to revoke an implied role", async () => {
    script("access_role_assignments", { data: [{ id: GRANT, person_id: PERSON, role_id: ROLE, revoked_at: null }] });
    role("coach", "implied");
    carries();
    revokeFacts(["p-boss"], 2);
    expect(await revokeGrant(GRANT, "No longer coaching")).toMatchObject({ ok: false, error: expect.stringMatching(/change the fact/) });
    expect(audits).toEqual([]);
  });

  it("refuses taking Admin from yourself, matched by your email's person row too", async () => {
    script("access_role_assignments", { data: [{ id: GRANT, person_id: PERSON, role_id: ROLE, revoked_at: null }] });
    role("admin");
    carries("crm.pipeline");
    revokeFacts([PERSON], 2);
    expect(await revokeGrant(GRANT, "Stepping down")).toMatchObject({ ok: false, error: expect.stringMatching(/You can't remove yourself/) });
    expect(calls.some((c) => c.ops[0] === "update")).toBe(false);
    expect(audits).toEqual([]);
  });

  it("refuses revoking the last live Super Admin grant", async () => {
    script("access_role_assignments", { data: [{ id: GRANT, person_id: PERSON, role_id: ROLE, revoked_at: null }] });
    role("super-admin");
    carries("access.manage");
    revokeFacts(["p-boss"], 1);
    expect(await revokeGrant(GRANT, "Leaving")).toMatchObject({ ok: false, error: expect.stringMatching(/last Super Admin grant/) });
    expect(calls.some((c) => c.ops[0] === "update")).toBe(false);
  });

  it("raises rather than revoking when the Super Admins cannot be counted", async () => {
    script("access_role_assignments", { data: [{ id: GRANT, person_id: PERSON, role_id: ROLE, revoked_at: null }] });
    role("super-admin");
    carries("access.manage");
    script("people", { data: [{ id: "p-boss" }] });
    script("access_roles", { data: [{ id: "r-super" }] });
    script("access_role_assignments", { error: { message: "boom" } });
    await expect(revokeGrant(GRANT, "Leaving")).rejects.toThrow(/boom/);
    expect(calls.some((c) => c.ops[0] === "update")).toBe(false);
  });
});

describe("addRolePermission", () => {
  it("refuses a key no installed area declares", async () => {
    role("revenue");
    carries();
    expect(await addRolePermission(ROLE, "crm.pipline", "all")).toMatchObject({ ok: false, error: expect.stringMatching(/No installed area declares/) });
  });

  it("adds a declared permission the editor holds, and audits it", async () => {
    role("revenue");
    carries();
    script("access_role_permissions", { data: { id: GRANT } });
    expect(await addRolePermission(ROLE, "boards.open", "all")).toMatchObject({ ok: true });
    expect(audits).toEqual([expect.objectContaining({ table: "access_role_permissions", operation: "insert" })]);
  });
});
