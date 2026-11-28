import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// What any person may do, read from the registers (Settings → Access, and the
// recipients of a notification). The facts must be the ones the session gates
// give the same person, or the person view would answer a different question
// from the page.
vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (table: string) => builderFor(table) } }));
let admins = new Set<string>();
let supers = new Set<string>();
let personIds: Record<string, string[]> = {};
vi.mock("@/kernel/identity/admin-register", () => ({
  holdsAdminGrant: async (email: string) => admins.has(email),
  holdsSuperAdminGrant: async (email: string) => supers.has(email),
  personIdsByEmail: async (email: string) => personIds[email] ?? [],
}));
vi.mock("@/kernel/approvals/waiting", () => ({ hasWaitingOn: async () => false }));
let granted: { role: string; because: string }[] = [{ role: "reimbursement-payer", because: "was granted it: pays claims" }];
let grantedBy: Record<string, { role: string; because: string }[]> = {};
// Which atoms each role holds, as access_role_permissions would say.
const ROLE_ATOMS: Record<string, string[]> = { admin: ["surface.admin"], accountant: ["surface.admin", "reimbursements.pay"], "team-member": ["surface.team"] };
vi.mock("@/kernel/identity/access-rows", () => ({
  assignedRoles: async (personId: string) => grantedBy[personId] ?? granted,
  rolePermissionsFromDb: async (roles: readonly string[]) =>
    roles.flatMap((role) => (ROLE_ATOMS[role] ?? []).map((permission) => ({ role, permission, scope: "all" as const }))),
}));

import { accessFactsOf, holdsSurfaceAdmin } from "./access-of-person";
import { registerAccessContributions } from "./access-contributions";

beforeEach(() => {
  resetFake();
  admins = new Set();
  supers = new Set();
  personIds = {};
  grantedBy = {};
  granted = [{ role: "reimbursement-payer", because: "was granted it: pays claims" }];
});

describe("accessFactsOf", () => {
  it("is null for a person who does not exist", async () => {
    script("people", { data: [] });
    expect(await accessFactsOf("p-none")).toBeNull();
  });

  it("reads a manager on contract: the active engagement, their reports, their grants, no portal", async () => {
    admins.add("lan@example.com");
    script("people", { data: [{ id: "p-lan", email: "lan@example.com" }] });
    script(
      "team_members",
      { data: [{ id: "tm-old", status: "notice", employment_type: "full_time" }, { id: "tm-lan", status: "active", employment_type: "contract" }] },
      { data: [{ person_id: "p-a" }, { person_id: "p-b" }] },
    );
    expect(await accessFactsOf("p-lan")).toEqual({
      personId: "p-lan",
      teamMemberId: "tm-lan",
      isAdmin: true,
      isSuperAdmin: false,
      employmentType: "contract",
      directReportPersonIds: ["p-a", "p-b"],
      isApprover: false,
      isPortalMember: false,
      portalCompanyIds: [],
      assignedRoles: [{ role: "reimbursement-payer", because: "was granted it: pays claims" }],
    });
  });

  it("reads a client whose only membership names no company as a portal member", async () => {
    script("people", { data: [{ id: "p-c", email: "c@client.example" }] });
    script("team_members", { data: [] });
    script("portal_members", { data: [{ company_id: null }] });
    expect(await accessFactsOf("p-c")).toMatchObject({ teamMemberId: null, isPortalMember: true, portalCompanyIds: [] });
  });

  it("refuses rather than answers when a read fails", async () => {
    script("people", { data: null, error: { message: "boom" } });
    await expect(accessFactsOf("p-x")).rejects.toThrow(/boom/);
  });
});

// AE.1 (ADR 0014): "is an admin" outside the Admin view's own guard means holds
// surface.admin, whichever role gives it, not a match against the register.
describe("holdsSurfaceAdmin", () => {
  beforeEach(() => registerAccessContributions([]));

  /** The reads accessFactsOf makes for someone on no team and in no portal. */
  const nobodyOnTheTeam = (id: string, email: string) => {
    script("people", { data: [{ id, email }] });
    script("team_members", { data: [] });
    script("portal_members", { data: [] });
  };

  it("holds for a person with the Admin grant", async () => {
    admins.add("lan@example.com");
    personIds["lan@example.com"] = ["p-lan"];
    granted = [];
    nobodyOnTheTeam("p-lan", "lan@example.com");
    expect(await holdsSurfaceAdmin("Lan@Example.com")).toBe(true);
  });

  it("holds for a custom role carrying surface.admin, with no Admin grant at all", async () => {
    personIds["acc@example.com"] = ["p-acc"];
    granted = [{ role: "accountant", because: "was granted it: books" }];
    nobodyOnTheTeam("p-acc", "acc@example.com");
    expect(await holdsSurfaceAdmin("acc@example.com")).toBe(true);
  });

  it("does not hold for a team member whose roles never give surface.admin", async () => {
    personIds["anna@example.com"] = ["p-anna"];
    granted = [];
    script("people", { data: [{ id: "p-anna", email: "anna@example.com" }] });
    script("team_members", { data: [{ id: "tm-anna", status: "active", employment_type: "full_time" }] }, { data: [] });
    expect(await holdsSurfaceAdmin("anna@example.com")).toBe(false);
  });

  it("asks every person row with the email, so a duplicate holding it counts (B.28)", async () => {
    personIds["dup@example.com"] = ["p-old", "p-new"];
    granted = [];
    grantedBy["p-new"] = [{ role: "accountant", because: "was granted it: books" }];
    nobodyOnTheTeam("p-old", "dup@example.com");
    nobodyOnTheTeam("p-new", "dup@example.com");
    expect(await holdsSurfaceAdmin("dup@example.com")).toBe(true);
  });

  it("asks the register alone for an email with no person, so the bootstrap still enters", async () => {
    admins.add("ops@example.test");
    expect(await holdsSurfaceAdmin("ops@example.test")).toBe(true);
    expect(await holdsSurfaceAdmin("stranger@example.test")).toBe(false);
  });

  it("throws when a read fails, since 'not an admin' is the permissive answer to an invite refusal", async () => {
    personIds["lan@example.com"] = ["p-lan"];
    script("people", { data: null, error: { message: "boom" } });
    await expect(holdsSurfaceAdmin("lan@example.com")).rejects.toThrow(/boom/);
  });

  it("answers no for a blank email without reading anything", async () => {
    expect(await holdsSurfaceAdmin("  ")).toBe(false);
  });
});
