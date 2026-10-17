import { beforeEach, describe, expect, it, vi } from "vitest";

// AE.1 (ADR 0014), at the request seam, against this deployment's real
// declarations: a surface is entered by its atom, the capabilities that rode on
// entering the Admin view are atoms of their own, and pay and personal records
// are atoms Super Admin holds. The rows each role holds are the declared
// default holders (what access:sync seeds), plus one custom role shaped like
// the Accountant a Super Admin would compose on the Access screen; the resolver
// and the guard are the real ones.
import { PERMISSIONS } from "@/app/permissions";

const redirect = vi.fn((to: string) => {
  throw new Error(`redirect:${to}`);
});
const notFound = vi.fn(() => {
  throw new Error("notFound");
});
vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to), notFound: () => notFound() }));
vi.mock("next/headers", () => ({ headers: async () => ({ get: () => null }) }));
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: async () => {} }));
vi.mock("@/kernel/shell/surface", () => ({ currentSurface: async () => "admin" }));
vi.mock("@/kernel/approvals/waiting", () => ({ hasWaitingOn: async () => false }));

type Person = {
  session: { id: string; email: string };
  adminGrant?: boolean;
  superAdminGrant?: boolean;
  team?: boolean;
  granted?: string[];
};
let who: Person | null = null;

vi.mock("@/kernel/identity/session-user", () => ({ getSessionUser: async () => who?.session ?? null }));
vi.mock("@/kernel/identity/admin-register", () => ({
  holdsAdminGrant: async () => Boolean(who?.adminGrant || who?.superAdminGrant),
  holdsSuperAdminGrant: async () => Boolean(who?.superAdminGrant),
}));
vi.mock("@/kernel/identity/team-auth", () => ({
  getTeamActor: async () => ({
    actor: who?.team
      ? {
          authUserId: who.session.id,
          email: who.session.email,
          personId: `p-${who.session.id}`,
          teamMemberId: `tm-${who.session.id}`,
          employmentType: "full_time",
          permissions: [],
          personScope: [`p-${who.session.id}`],
        }
      : null,
  }),
}));
vi.mock("@/kernel/identity/portal-auth", () => ({ getPortalActor: async () => ({ actor: null }) }));

/** The roles that hold each atom on a fresh install, from the generated registry. */
const declared = Object.entries(PERMISSIONS.atoms).flatMap(([permission, atom]) =>
  atom.holders.map((h) => ({ role: h.role, permission, scope: h.scope })),
);
/** A custom role a Super Admin composes on the Access screen: the Accountant's Admin-view part. */
const ACCOUNTANT = ["surface.admin", "reimbursements.pay", "reimbursements.check"].map((permission) => ({
  role: "accountant-custom",
  permission,
  scope: "all" as const,
}));
vi.mock("@/kernel/identity/access-rows", () => ({
  rolePermissionsFromDb: async (roles: readonly string[]) => [...declared, ...ACCOUNTANT].filter((r) => roles.includes(r.role)),
  assignedRoles: async () => (who?.granted ?? []).map((role) => ({ role, because: `was granted it: ${role}` })),
  personIdForAuthUser: async () => (who && !who.team ? `p-${who.session.id}` : null),
}));

import { registerAccessContributions } from "@/kernel/identity/access-contributions";
import { getAccess, requirePermission } from "@/kernel/identity/access-request";

const ADMIN: Person = { session: { id: "admin", email: "admin@example.test" }, adminGrant: true, team: true };
const SUPER: Person = { session: { id: "super", email: "super@example.test" }, superAdminGrant: true, team: true };
const MEMBER: Person = { session: { id: "member", email: "member@example.test" }, team: true };
const ACCOUNTANT_PERSON: Person = { session: { id: "acc", email: "acc@example.test" }, granted: ["accountant-custom"] };

const CAPABILITIES = ["assistant.query", "assistant.write", "crm.assume", "crm.portal-invite", "crm.collections"];
const SENSITIVE = ["people.pay", "people.identity", "finance.expenses"];

beforeEach(() => {
  who = null;
  redirect.mockClear();
  notFound.mockClear();
  registerAccessContributions([]);
});

describe("the declarations", () => {
  it("give surface.admin and every capability atom to Admin, so no current admin loses anything", () => {
    for (const atom of ["surface.admin", ...CAPABILITIES]) {
      expect(PERMISSIONS.atoms[atom]?.holders, atom).toContainEqual({ role: "admin", scope: "all" });
    }
  });

  it("give the sensitive atoms to Super Admin alone", () => {
    for (const atom of SENSITIVE) {
      expect(PERMISSIONS.atoms[atom]?.holders, atom).toEqual([{ role: "super-admin", scope: "all" }]);
    }
  });

  it("no longer name surface.admin for an action that is really a capability", () => {
    for (const file of ["entities/crm/lib/assume-actions", "entities/crm/lib/team-portal-actions", "entities/crm/routes/admin/(dashboard)/revenue/billing/collections-actions"]) {
      expect(PERMISSIONS.actions[file], file).not.toBe("surface.admin");
    }
  });
});

describe("entering the Admin view", () => {
  it("admits an Admin, with every capability and none of the sensitive atoms", async () => {
    who = ADMIN;
    const access = await requirePermission("surface.admin");
    expect(access.user.email).toBe("admin@example.test");
    for (const atom of CAPABILITIES) expect(access.may(atom), atom).toBe(true);
    for (const atom of SENSITIVE) expect(access.may(atom), atom).toBe(false);
  });

  it("admits a Super Admin, who holds the sensitive atoms as well", async () => {
    who = SUPER;
    const access = await requirePermission("surface.admin");
    for (const atom of [...CAPABILITIES, ...SENSITIVE]) expect(access.may(atom), atom).toBe(true);
  });

  it("admits a custom role carrying surface.admin, with no Admin grant and no team identity", async () => {
    who = ACCOUNTANT_PERSON;
    const access = await requirePermission("surface.admin");
    expect(access.user.email).toBe("acc@example.test");
    expect(access.may("reimbursements.pay")).toBe(true);
  });

  it("refuses that custom role every capability and every sensitive atom it was not given", async () => {
    who = ACCOUNTANT_PERSON;
    const access = await getAccess();
    for (const atom of [...CAPABILITIES, ...SENSITIVE]) expect(access?.may(atom), atom).toBe(false);
    await expect(requirePermission("assistant.query")).rejects.toThrow("notFound");
  });

  it("refuses a team member who holds no role giving surface.admin", async () => {
    who = MEMBER;
    await expect(requirePermission("surface.admin")).rejects.toThrow(/notFound|redirect:\/admin\/refused/);
  });

  it("sends nobody to the sign-in", async () => {
    await expect(requirePermission("surface.admin")).rejects.toThrow("redirect:/admin/login");
  });
});

describe("the sensitive atoms", () => {
  it("refuse an Admin people.pay, and admit a Super Admin", async () => {
    who = ADMIN;
    await expect(requirePermission("people.pay")).rejects.toThrow(/redirect:\/admin\/refused\?p=people\.pay/);
    who = SUPER;
    await expect(requirePermission("people.pay")).resolves.toMatchObject({ user: { email: "super@example.test" } });
  });
});
