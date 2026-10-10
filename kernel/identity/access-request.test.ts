import { beforeEach, describe, expect, it, vi } from "vitest";

// What a guard hands back (ADR 0013): what the person may do, and who they are.
// Actions write `user.email` to the audit log, so who counts as the user is a
// rule, and it is the one getRevenueUser had: the admin sign-in first, then the
// team member, then the portal member. An admin viewing a client's portal
// through Assume is never that client.
const redirect = vi.fn((to: string) => {
  throw new Error(`redirect:${to}`);
});
const notFound = vi.fn(() => {
  throw new Error("notFound");
});
vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to), notFound: () => notFound() }));
// A refusal records where the request was headed, when the request says.
let requestHeaders: Record<string, string> = {};
vi.mock("next/headers", () => ({ headers: async () => ({ get: (k: string) => requestHeaders[k] ?? null }) }));
const recordAudit = vi.fn(async (_row: Record<string, unknown>) => {});
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: (row: Record<string, unknown>) => recordAudit(row) }));

type Session = { id: string; email: string } | null;
// The signed-in auth user, and whether the register gives them the Admin role.
let session: Session = null;
let adminGrant = false;
// The person an auth user is, for someone neither the team nor the portal knows.
let personForAuth: string | null = null;
let teamActor: Record<string, unknown> | null = null;
let portalActor: Record<string, unknown> | null = null;
vi.mock("@/kernel/identity/session-user", () => ({ getSessionUser: async () => session }));
vi.mock("@/kernel/identity/admin-register", () => ({
  holdsAdminGrant: async () => adminGrant,
  holdsSuperAdminGrant: async () => false,
}));
const grantsAskedFor: string[] = [];
vi.mock("@/kernel/identity/access-rows", () => ({
  assignedRoles: async (personId: string) => {
    grantsAskedFor.push(personId);
    return [];
  },
  rolePermissionsFromDb: async () => [],
  personIdForAuthUser: async () => personForAuth,
}));
vi.mock("@/kernel/identity/team-auth", () => ({ getTeamActor: async () => ({ actor: teamActor }) }));
vi.mock("@/kernel/identity/portal-auth", () => ({ getPortalActor: async () => ({ actor: portalActor }) }));
let surface: "admin" | "team" = "admin";
vi.mock("@/kernel/shell/surface", () => ({ currentSurface: async () => surface }));
// No grant exists for anyone in these cases, so the grants read returns no rows.
vi.mock("@/kernel/data/supabase", () => {
  const empty = { data: [], error: null };
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "is"]) chain[m] = () => chain;
  chain.then = (resolve: (v: unknown) => unknown) => resolve(empty);
  return { companyOs: { from: () => chain } };
});
// The resolver itself is tested in access.test.ts; here it only has to answer.
let held: string[] = [];
let lastFacts: Record<string, unknown> | null = null;
vi.mock("@/kernel/identity/access", () => ({
  buildAccess: async (facts: Record<string, unknown>) => {
    lastFacts = facts;
    return { roles: [], permissions: () => held, may: (p: string) => held.includes(p) };
  },
}));

import { getAccess, requirePermission } from "./access-request";

const team = (over: Record<string, unknown> = {}) => ({
  authUserId: "auth-team",
  email: "anna@example.com",
  personId: "p-anna",
  teamMemberId: "tm-anna",
  employmentType: "full_time",
  permissions: [],
  personScope: ["p-anna"],
  ...over,
});
const portal = (over: Record<string, unknown> = {}) => ({
  authUserId: "auth-client",
  email: "client@example.com",
  personId: "p-client",
  companyScope: ["c-1"],
  impersonation: null,
  ...over,
});

beforeEach(() => {
  session = null;
  adminGrant = false;
  personForAuth = null;
  lastFacts = null;
  grantsAskedFor.length = 0;
  teamActor = null;
  portalActor = null;
  held = [];
  surface = "admin";
  requestHeaders = {};
  redirect.mockClear();
  notFound.mockClear();
  recordAudit.mockClear();
});

describe("getAccess's user", () => {
  it("is nobody when nobody is signed in on any register", async () => {
    expect(await getAccess()).toBeNull();
  });

  it("is the admin sign-in when the person is an admin and on the team, as revenue access audited it", async () => {
    session = { id: "auth-admin", email: "admin-anna@example.com" };
    adminGrant = true;
    teamActor = team();
    expect((await getAccess())?.user).toEqual({ id: "auth-admin", email: "admin-anna@example.com" });
  });

  it("is the team member's sign-in for someone on the team who is not an admin", async () => {
    teamActor = team();
    expect((await getAccess())?.user).toEqual({ id: "auth-team", email: "anna@example.com" });
  });

  it("is the portal member's sign-in for a client", async () => {
    portalActor = portal();
    expect((await getAccess())?.user).toEqual({ id: "auth-client", email: "client@example.com" });
  });

  it("is never the client an admin is viewing through Assume", async () => {
    session = { id: "auth-admin", email: "ops@example.com" };
    adminGrant = true;
    portalActor = portal({ impersonation: { adminEmail: "ops@example.com" } });
    expect((await getAccess())?.user).toEqual({ id: "auth-admin", email: "ops@example.com" });
  });

  // AE.1 (ADR 0014): a role granted in Settings, Access may be someone's only
  // way in, a custom role carrying surface.admin above all, so the person is
  // found from the sign-in itself when neither gate knows them.
  it("is the sign-in of someone only a granted role knows, read through their person", async () => {
    session = { id: "auth-acc", email: "acc@example.com" };
    personForAuth = "p-acc";
    const access = await getAccess();
    expect(access?.user).toEqual({ id: "auth-acc", email: "acc@example.com" });
    expect(access?.personId).toBe("p-acc");
    expect(grantsAskedFor).toEqual(["p-acc"]);
    expect(lastFacts).toMatchObject({ personId: "p-acc", isAdmin: false, teamMemberId: null });
  });

  it("is nobody for a sign-in with no person, no grant, no team and no portal", async () => {
    session = { id: "auth-x", email: "x@example.com" };
    expect(await getAccess()).toBeNull();
  });

  it("takes the Admin role from the register, never from a session gate", async () => {
    session = { id: "auth-admin", email: "ops@example.com" };
    adminGrant = true;
    expect((await getAccess())?.personId).toBeNull();
    expect(lastFacts).toMatchObject({ isAdmin: true, personId: null });
  });
});

describe("requirePermission", () => {
  it("hands back who is acting with what they may do", async () => {
    teamActor = team();
    held = ["crm.pipeline"];
    const access = await requirePermission("crm.pipeline");
    expect(access.user.email).toBe("anna@example.com");
    expect(access.may("crm.pipeline")).toBe(true);
  });

  it("sends nobody to the surface's sign-in, and writes no audit row for it", async () => {
    await expect(requirePermission("crm.pipeline")).rejects.toThrow("redirect:/admin/login");
    surface = "team";
    await expect(requirePermission("crm.pipeline")).rejects.toThrow("redirect:/team/login");
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("shows a refused person who holds access.explain the refusal page for the permission", async () => {
    teamActor = team();
    held = ["access.explain"];
    await expect(requirePermission("crm.pipeline")).rejects.toThrow("redirect:/admin/refused?p=crm.pipeline");
    surface = "team";
    await expect(requirePermission("team.hiring")).rejects.toThrow("redirect:/team/refused?p=team.hiring");
    expect(notFound).not.toHaveBeenCalled();
  });

  it("tells a refused person without access.explain that the page does not exist", async () => {
    teamActor = team();
    held = ["surface.team"];
    await expect(requirePermission("crm.pipeline")).rejects.toThrow("notFound");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("does not send someone refused the surface itself to a page that needs the surface", async () => {
    teamActor = team();
    surface = "team";
    held = ["access.explain"];
    await expect(requirePermission("surface.team")).rejects.toThrow("notFound");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("writes one audit row per refusal, whichever way the person is answered", async () => {
    teamActor = team();
    requestHeaders = { "x-invoke-path": "/admin/revenue/deals" };
    held = ["access.explain"];
    await expect(requirePermission("crm.pipeline", { company: "c-1" })).rejects.toThrow("redirect:");
    held = [];
    await expect(requirePermission("crm.pipeline")).rejects.toThrow("notFound");
    expect(recordAudit).toHaveBeenCalledTimes(2);
    expect(recordAudit).toHaveBeenNthCalledWith(1, {
      table: "access_refusals",
      recordId: null,
      operation: "insert",
      actor: "anna@example.com",
      context: { permission: "crm.pipeline", target: { company: "c-1" }, path: "/admin/revenue/deals" },
    });
    expect(recordAudit.mock.calls[1]?.[0]).toMatchObject({
      context: { permission: "crm.pipeline", target: null, path: "/admin/revenue/deals" },
    });
  });

  it("answers the same when the audit row cannot be written", async () => {
    teamActor = team();
    held = ["access.explain"];
    recordAudit.mockRejectedValueOnce(new Error("down"));
    await expect(requirePermission("crm.pipeline")).rejects.toThrow("redirect:/admin/refused?p=crm.pipeline");
  });

  it("writes no audit row when the person holds the permission", async () => {
    teamActor = team();
    held = ["crm.pipeline"];
    await requirePermission("crm.pipeline");
    expect(recordAudit).not.toHaveBeenCalled();
  });
});
