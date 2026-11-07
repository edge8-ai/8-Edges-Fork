import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// AC.18. The team invite carries Type and Roles: Type is written to the
// person's team_members row before the sign-in goes out (a contractor is a team
// member whose type is contract), and each role is granted through the same rule
// as Settings, Access. A role the inviter may not grant is reported by name and
// never stops the invite.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/kernel/config/site-origin", () => ({ getSiteOrigin: async () => "https://app.example.test" }));
vi.mock("@/kernel/messaging/email", () => ({ sendTransactionalEmail: vi.fn() }));
const invited: string[] = [];
vi.mock("@/kernel/data/supabase", () => ({
  companyOs: { from: (table: string) => builderFor(table) },
  supabase: {
    auth: {
      admin: {
        inviteUserByEmail: async (email: string) => {
          invited.push(email);
          return { data: { user: { id: "auth-new" } }, error: null };
        },
      },
    },
  },
}));
vi.mock("@/kernel/identity/access-of-person", () => ({ holdsSurfaceAdmin: async () => false }));
vi.mock("@/kernel/identity/auth-users", () => ({ findAuthUserByEmail: async () => null, bannedUntil: () => false }));
const audits: { table: string; operation: string; oldData?: unknown; newData?: unknown }[] = [];
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: async (a: (typeof audits)[number]) => void audits.push(a) }));
vi.mock("@/kernel/identity/writes", () => ({
  updatePeople: (patch: unknown) => builderFor("people").update(patch),
  updateTeamMembers: (patch: unknown) => builderFor("team_members").update(patch),
}));
let signedIn: object | null = { personId: "p-admin" };
vi.mock("@/kernel/identity/access-request", () => ({
  getAccess: async () => signedIn,
  // The invite's guard (crm.portal-invite); the admin's email is what the audit names.
  requirePermission: async () => ({ user: { id: "auth-admin", email: "admin@example.com" } }),
}));
type GrantInput = { personId: string; roleId: string; reason: (role: { name: string }) => string };
const granted: GrantInput[] = [];
let refusals: Record<string, { roleName: string; error: string }> = {};
vi.mock("@/entities/company-os", () => ({
  grantRoleTo: async (input: GrantInput) => {
    granted.push(input);
    const no = refusals[input.roleId];
    if (no) return { ok: false, error: no.error, roleName: no.roleName };
    return { ok: true, message: "granted", roleName: input.roleId === FINANCE ? "Finance" : "Revenue" };
  },
}));

import { inviteToPortal } from "./team-portal-actions";

const TM = "tm-1";
const FINANCE = "22222222-2222-4222-8222-222222222222";
const REVENUE = "33333333-3333-4333-8333-333333333333";

function member(over: { status?: string; employment_type?: string | null } = {}) {
  script("team_members", { data: { id: TM, person_id: "p-1", status: "active", employment_type: "full_time", ...over } });
  script("people", { data: { id: "p-1", email: "Sam@Example.test", auth_user_id: null } });
}
const written = (table: string) => calls.filter((c) => c.table === table && c.ops[0] === "update").map((c) => c.payloads[0]);

beforeEach(() => {
  resetFake();
  audits.length = 0;
  granted.length = 0;
  invited.length = 0;
  refusals = {};
  signedIn = { personId: "p-admin" };
});

describe("inviteToPortal · Type", () => {
  it("sets employment_type to contract before inviting, and audits the change", async () => {
    member();
    script("team_members", { data: null });
    script("people", { data: null });
    const res = await inviteToPortal(TM, { employmentType: "contract" });
    expect(res).toMatchObject({ ok: true, refused: [] });
    expect(written("team_members")).toEqual([{ employment_type: "contract" }]);
    expect(invited).toEqual(["sam@example.test"]);
    expect(audits[0]).toMatchObject({
      table: "team_members",
      operation: "update",
      oldData: { employment_type: "full_time" },
      newData: { employment_type: "contract", via: "team_invite" },
    });
  });

  it("writes nothing to team_members when the type is the one it already has", async () => {
    member({ employment_type: "contract" });
    script("people", { data: null });
    expect(await inviteToPortal(TM, { employmentType: "contract" })).toMatchObject({ ok: true });
    expect(written("team_members")).toEqual([]);
  });

  it("refuses a type outside the list, and invites no one", async () => {
    expect(await inviteToPortal(TM, { employmentType: "volunteer" as never })).toMatchObject({ ok: false });
    expect(calls).toEqual([]);
    expect(invited).toEqual([]);
  });

  it("does not touch the type of someone who cannot be invited", async () => {
    member({ status: "terminated" });
    expect(await inviteToPortal(TM, { employmentType: "contract" })).toMatchObject({ ok: false, error: expect.stringMatching(/not portal-eligible/) });
    expect(written("team_members")).toEqual([]);
  });
});

describe("inviteToPortal · Roles", () => {
  it("grants each role to the invited person with a reason naming the role", async () => {
    member();
    script("people", { data: null });
    const res = await inviteToPortal(TM, { roleIds: [FINANCE, REVENUE, FINANCE] });
    expect(res).toMatchObject({ ok: true, refused: [], message: expect.stringContaining("Granted Finance, Revenue.") });
    expect(granted.map((g) => [g.personId, g.roleId])).toEqual([
      ["p-1", FINANCE],
      ["p-1", REVENUE],
    ]);
    expect(granted[0].reason({ name: "Finance" })).toBe("Granted on invite: Finance");
  });

  it("reports a role the inviter may not grant by name, and the invite still goes out", async () => {
    member();
    script("people", { data: null });
    refusals[FINANCE] = { roleName: "Finance", error: "You may grant only what you hold yourself." };
    const res = await inviteToPortal(TM, { roleIds: [FINANCE, REVENUE] });
    expect(invited).toEqual(["sam@example.test"]);
    expect(res).toMatchObject({
      ok: true,
      refused: [{ roleId: FINANCE, roleName: "Finance", reason: "You may grant only what you hold yourself." }],
      message: expect.stringMatching(/Granted Revenue\. Not granted: Finance \(You may grant only what you hold yourself\.\)/),
    });
  });

  it("grants nothing when the invite itself fails", async () => {
    member({ status: "alumni" });
    expect(await inviteToPortal(TM, { roleIds: [FINANCE] })).toMatchObject({ ok: false });
    expect(granted).toEqual([]);
  });

  it("refuses every role when nobody can be resolved as the inviter", async () => {
    member();
    script("people", { data: null });
    signedIn = null;
    const res = await inviteToPortal(TM, { roleIds: [FINANCE] });
    expect(res).toMatchObject({ ok: true, refused: [{ roleId: FINANCE, roleName: null }] });
    expect(granted).toEqual([]);
  });

  it("refuses a role id that is not an id", async () => {
    expect(await inviteToPortal(TM, { roleIds: ["finance"] })).toMatchObject({ ok: false });
    expect(calls).toEqual([]);
  });
});
