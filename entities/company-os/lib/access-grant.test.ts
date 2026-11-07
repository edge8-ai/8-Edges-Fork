import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// AC.18. The grant rule Settings, Access and the team invite share: the same
// refusals, a reason that may be built from the role's name, an audit row for
// every grant, and the list of roles the invite form may offer.
vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (table: string) => builderFor(table) } }));
const audits: { table: string; operation: string; actor?: string | null; newData?: unknown }[] = [];
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: async (a: (typeof audits)[number]) => void audits.push(a) }));
vi.mock("@/kernel/identity/writes", () => ({
  insertAccessRoleAssignments: (row: unknown) => builderFor("access_role_assignments").insert(row),
}));
let held = [
  { role: "super-admin", permission: "access.manage", scope: "all" },
  { role: "admin", permission: "crm.pipeline", scope: "all" },
];
vi.mock("@/kernel/identity/access-rows", () => ({ rolePermissionsFromDb: async () => held }));

import type { RequestAccess } from "@/kernel/identity/access-request";
import { grantRoleTo, loadGrantableRoles } from "./access-grant";

const access = { roles: [{ role: "super-admin", because: "" }], user: { id: "auth-1", email: "boss@example.com" }, personId: "p-boss" } as unknown as RequestAccess;
const PERSON = "11111111-1111-4111-8111-111111111111";
const ROLE = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  resetFake();
  audits.length = 0;
  held = [
    { role: "super-admin", permission: "access.manage", scope: "all" },
    { role: "admin", permission: "crm.pipeline", scope: "all" },
  ];
});

const role = (key: string, over: Record<string, unknown> = {}) =>
  script("access_roles", { data: [{ id: ROLE, key, name: key, kind: "granted", archived_at: null, ...over }] });
const carries = (...permissions: string[]) => script("access_role_permissions", { data: permissions.map((permission) => ({ permission, scope: "all" })) });

describe("grantRoleTo", () => {
  it("builds the reason from the role, writes the grant and audits it", async () => {
    role("revenue");
    carries("crm.pipeline");
    script("access_role_assignments", { data: { id: "g-1" } });
    const res = await grantRoleTo({ access, personId: PERSON, roleId: ROLE, reason: (r) => `Granted on invite: ${r.name}` });
    expect(res).toEqual({ ok: true, message: "revenue granted.", roleName: "revenue", roleKey: "revenue", assignmentId: "g-1" });
    const insert = calls.find((c) => c.table === "access_role_assignments" && c.ops[0] === "insert");
    expect(insert?.payloads[0]).toEqual({ person_id: PERSON, role_id: ROLE, granted_by: "p-boss", reason: "Granted on invite: revenue" });
    expect(audits).toEqual([expect.objectContaining({ table: "access_role_assignments", operation: "insert", actor: "boss@example.com" })]);
  });

  it("names the role it refuses, and writes nothing", async () => {
    // Someone who manages access through a role of their own, not Super Admin,
    // whom the hold rule still binds (AE.2 exempts only Super Admin).
    held = held.map((p) => (p.role === "super-admin" ? { ...p, role: "access-steward" } : p));
    role("finance");
    carries("finance.expenses");
    const res = await grantRoleTo({ access, personId: PERSON, roleId: ROLE, reason: "Pays people" });
    expect(res).toMatchObject({ ok: false, roleName: "finance", error: expect.stringMatching(/only what you hold/) });
    expect(calls.some((c) => c.ops[0] === "insert")).toBe(false);
    expect(audits).toEqual([]);
  });

  it("lets a Super Admin grant a role carrying what they do not hold, and audits it (AE.2)", async () => {
    role("finance");
    carries("finance.expenses");
    script("access_role_assignments", { data: { id: "g-2" } });
    const res = await grantRoleTo({ access, personId: PERSON, roleId: ROLE, reason: "Pays people" });
    expect(res).toMatchObject({ ok: true, roleKey: "finance" });
    expect(audits.map((x) => x.table)).toEqual(["access_role_assignments"]);
  });

  it("grants Admin to a contractor without asking about their employment", async () => {
    role("admin");
    carries("crm.pipeline");
    script("access_role_assignments", { data: { id: "g-3" } });
    expect(await grantRoleTo({ access, personId: PERSON, roleId: ROLE, reason: "Runs the admin side" })).toMatchObject({ ok: true, roleKey: "admin" });
  });

  it("refuses Super Admin to a contractor by their employment type, and writes nothing", async () => {
    role("super-admin");
    carries("access.manage");
    script("team_members", { data: [{ employment_type: "contract" }] });
    const res = await grantRoleTo({ access, personId: PERSON, roleId: ROLE, reason: "Cover" });
    expect(res).toMatchObject({ ok: false, error: "Super Admin goes only to a full-time, part-time or intern team member." });
    expect(calls.some((c) => c.ops[0] === "insert")).toBe(false);
  });

  it("grants Super Admin to a current part-time team member", async () => {
    role("super-admin");
    carries("access.manage");
    script("team_members", { data: [{ employment_type: "part_time" }] });
    script("access_role_assignments", { data: { id: "g-4" } });
    expect(await grantRoleTo({ access, personId: PERSON, roleId: ROLE, reason: "Runs access" })).toMatchObject({ ok: true, roleKey: "super-admin" });
  });

  it("says who already holds the role", async () => {
    role("revenue");
    carries("crm.pipeline");
    script("access_role_assignments", { error: { message: "duplicate", code: "23505" } as never });
    expect(await grantRoleTo({ access, personId: PERSON, roleId: ROLE, reason: "Again" })).toMatchObject({ ok: false, error: "They already hold revenue." });
  });

  it("has no name to give for a role that is gone", async () => {
    script("access_roles", { data: [] });
    carries();
    expect(await grantRoleTo({ access, personId: PERSON, roleId: ROLE, reason: "Gone" })).toEqual({ ok: false, error: "That role no longer exists.", roleName: null });
  });
});

describe("loadGrantableRoles", () => {
  it("offers only the roles the granter may grant", async () => {
    // Someone who manages access through a role of their own, not Super Admin,
    // whom the hold rule still binds (AE.2 exempts only Super Admin).
    held = held.map((p) => (p.role === "super-admin" ? { ...p, role: "access-steward" } : p));
    script("access_roles", {
      data: [
        { id: "r-1", key: "revenue", name: "Revenue", description: "Runs the pipeline", kind: "granted", archived_at: null },
        { id: "r-2", key: "finance", name: "Finance", description: "Pays people", kind: "granted", archived_at: null },
        { id: "r-3", key: "admin", name: "Admin", description: "Admin", kind: "granted", archived_at: null },
      ],
    });
    script("access_role_permissions", {
      data: [
        { role_id: "r-1", permission: "crm.pipeline", scope: "all" },
        { role_id: "r-2", permission: "finance.expenses", scope: "all" },
        { role_id: "r-3", permission: "crm.pipeline", scope: "all" },
      ],
    });
    // Since the cutover (AC.20) Admin is granted like any role: offered when the
    // granter holds what it carries. Finance carries what they do not hold.
    expect(await loadGrantableRoles(access)).toEqual([
      { id: "r-1", key: "revenue", name: "Revenue", description: "Runs the pipeline" },
      { id: "r-3", key: "admin", name: "Admin", description: "Admin" },
    ]);
  });

  it("offers a Super Admin every live granted role, carrying what they hold or not (AE.2)", async () => {
    script("access_roles", {
      data: [
        { id: "r-1", key: "revenue", name: "Revenue", description: "Runs the pipeline", kind: "granted", archived_at: null },
        { id: "r-2", key: "finance", name: "Finance", description: "Pays people", kind: "granted", archived_at: null },
      ],
    });
    script("access_role_permissions", { data: [{ role_id: "r-2", permission: "finance.expenses", scope: "all" }] });
    expect((await loadGrantableRoles(access)).map((r) => r.key)).toEqual(["revenue", "finance"]);
  });

  it("offers none to someone who does not manage access", async () => {
    held = [{ role: "admin", permission: "crm.pipeline", scope: "all" }];
    script("access_roles", { data: [{ id: "r-1", key: "revenue", name: "Revenue", description: "", kind: "granted", archived_at: null }] });
    script("access_role_permissions", { data: [{ role_id: "r-1", permission: "crm.pipeline", scope: "all" }] });
    expect(await loadGrantableRoles(access)).toEqual([]);
  });
});
