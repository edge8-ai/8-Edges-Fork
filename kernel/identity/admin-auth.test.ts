import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// AC.20, part 3: Admin and Super Admin grants are the only register. The admins
// table is never read, SENSITIVE_VIEWERS grants nothing, and ADMIN_ALLOWLIST
// opens the door only while no Admin grant exists anywhere; a failed count
// raises, because "no grants" is the permissive branch.
vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (table: string) => builderFor(table) } }));
vi.mock("@/kernel/data/supabase/server", () => ({ createSessionClient: vi.fn() }));
// The wrappers ask the resolver; what it answers is access-request's own tests.
let access: { may: (p: string) => boolean; user: { id: string; email: string } } | null = null;
const requirePermission = vi.fn(async (permission: string) => {
  if (!access) throw new Error("redirect:/admin/login");
  if (!access.may(permission)) throw new Error("notFound");
  return access;
});
vi.mock("@/kernel/identity/access-request", () => ({
  getAccess: async () => access,
  requirePermission: (p: string) => requirePermission(p),
}));

import { holdsAdminGrant, holdsSuperAdminGrant } from "./admin-register";
import { getAdminUser, requireAdmin } from "./admin-auth";

const ROLES = { data: [{ id: "r-admin", key: "admin" }, { id: "r-super", key: "super-admin" }] };

/** The three reads of adminGrantsByEmail for a person holding these role ids. */
function grantsOf(roleIds: string[]) {
  script("people", { data: [{ id: "p-1" }] });
  script("access_roles", ROLES);
  script("access_role_assignments", { data: roleIds.map((role_id) => ({ role_id })) });
}

/** The two reads of liveGrantCount("admin"). */
function adminGrantCount(count: number) {
  script("access_roles", { data: [{ id: "r-admin" }] });
  script("access_role_assignments", { count });
}

beforeEach(() => {
  access = null;
  requirePermission.mockClear();
  resetFake();
  vi.unstubAllEnvs();
});

describe("holdsAdminGrant", () => {
  it("admits a holder of a live Admin grant, by email", async () => {
    grantsOf(["r-admin"]);
    expect(await holdsAdminGrant("Lan@Example.com")).toBe(true);
  });

  it("admits a Super Admin grant alone: a Super Admin is an admin who may also see more", async () => {
    grantsOf(["r-super"]);
    expect(await holdsAdminGrant("mai@example.com")).toBe(true);
  });

  it("refuses someone without a grant, and never reads the admins table", async () => {
    grantsOf([]);
    expect(await holdsAdminGrant("lan@example.com")).toBe(false);
    expect(calls.some((c) => c.table === "admins")).toBe(false);
  });

  it("refuses on a failed grants read rather than admitting", async () => {
    script("people", { error: { message: "boom" } });
    expect(await holdsAdminGrant("lan@example.com")).toBe(false);
  });

  it("refuses nobody's email without a read", async () => {
    expect(await holdsAdminGrant("  ")).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

describe("the ADMIN_ALLOWLIST bootstrap", () => {
  it("admits an allowlisted address as Admin and Super Admin while no Admin grant exists", async () => {
    vi.stubEnv("ADMIN_ALLOWLIST", "ops@example.test");
    script("people", { data: [] });
    adminGrantCount(0);
    expect(await holdsAdminGrant("ops@example.test")).toBe(true);
    script("people", { data: [] });
    adminGrantCount(0);
    expect(await holdsSuperAdminGrant("ops@example.test")).toBe(true);
  });

  it("grants nothing once one Admin grant exists anywhere", async () => {
    vi.stubEnv("ADMIN_ALLOWLIST", "ops@example.test");
    script("people", { data: [] });
    adminGrantCount(1);
    expect(await holdsAdminGrant("ops@example.test")).toBe(false);
  });

  it("raises when the grants cannot be counted, rather than reading the system as empty", async () => {
    vi.stubEnv("ADMIN_ALLOWLIST", "ops@example.test");
    script("people", { data: [] });
    script("access_roles", { data: [{ id: "r-admin" }] });
    script("access_role_assignments", { error: { message: "boom" } });
    await expect(holdsAdminGrant("ops@example.test")).rejects.toThrow(/boom/);
  });

  it("is never counted for an address the allowlist does not name", async () => {
    vi.stubEnv("ADMIN_ALLOWLIST", "ops@example.test");
    grantsOf([]);
    expect(await holdsAdminGrant("lan@example.com")).toBe(false);
    expect(calls.filter((c) => c.table === "access_role_assignments")).toHaveLength(1);
  });
});

describe("holdsSuperAdminGrant", () => {
  it("clears a holder of a live Super Admin grant", async () => {
    grantsOf(["r-admin", "r-super"]);
    expect(await holdsSuperAdminGrant("owner@example.com")).toBe(true);
  });

  it("does not clear a plain Admin", async () => {
    grantsOf(["r-admin"]);
    expect(await holdsSuperAdminGrant("lan@example.com")).toBe(false);
  });

  it("ignores SENSITIVE_VIEWERS, which is retired", async () => {
    vi.stubEnv("SENSITIVE_VIEWERS", "lan@example.com");
    grantsOf(["r-admin"]);
    expect(await holdsSuperAdminGrant("lan@example.com")).toBe(false);
  });
});

// AE.1 (ADR 0014): the Admin view is entered by holding surface.admin, whichever
// role gives it, and requireAdmin is a thin wrapper that still returns the user.
describe("getAdminUser and requireAdmin", () => {
  const user = { id: "auth-1", email: "anna@example.com" };
  const holding = (...held: string[]) => ({ may: (p: string) => held.includes(p), user });

  it("answers the signed-in user for anyone holding surface.admin, through any role", async () => {
    access = holding("surface.admin", "reimbursements.pay");
    expect(await getAdminUser()).toEqual(user);
    expect(await requireAdmin()).toEqual(user);
    expect(requirePermission).toHaveBeenCalledWith("surface.admin");
  });

  it("answers null for a signed-in person without surface.admin, and requireAdmin refuses them", async () => {
    access = holding("surface.team");
    expect(await getAdminUser()).toBeNull();
    await expect(requireAdmin()).rejects.toThrow("notFound");
  });

  it("answers null for nobody signed in, and requireAdmin sends them to sign in", async () => {
    expect(await getAdminUser()).toBeNull();
    await expect(requireAdmin()).rejects.toThrow("redirect:/admin/login");
  });

  it("never reads the admin register itself: the role's facts are the resolver's business", async () => {
    access = holding("surface.admin");
    await getAdminUser();
    expect(calls).toHaveLength(0);
  });
});
