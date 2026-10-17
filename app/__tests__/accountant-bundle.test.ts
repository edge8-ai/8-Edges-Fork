import { beforeEach, describe, expect, it, vi } from "vitest";

// AE.3 (ADR 0014), at the request seam, against this deployment's real
// declarations: the rows each role holds are what `npm run access:sync` seeds
// from them (each atom's default holders, and each declared bundle's atoms), and
// the resolver and the guard are the real ones. A contractor granted the
// Accountant bundle works Finance from the Team view and never enters the Admin
// view (Dave, 2026-10-10); the admin powers are atoms an Accountant does not
// hold; and a Revenue or Finance grant opens what the old flags opened.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PERMISSIONS } from "@/app/permissions";
import { expectedHere } from "@/scripts/fork-tree.mjs";

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
  employmentType?: "full_time" | "contract";
  granted?: string[];
};
let who: Person | null = null;

vi.mock("@/kernel/identity/session-user", () => ({ getSessionUser: async () => who?.session ?? null }));
vi.mock("@/kernel/identity/admin-register", () => ({
  holdsAdminGrant: async () => Boolean(who?.adminGrant),
  holdsSuperAdminGrant: async () => false,
}));
vi.mock("@/kernel/identity/team-auth", () => ({
  getTeamActor: async () => ({
    actor: who?.employmentType
      ? {
          authUserId: who.session.id,
          email: who.session.email,
          personId: `p-${who.session.id}`,
          teamMemberId: `tm-${who.session.id}`,
          employmentType: who.employmentType,
          personScope: [`p-${who.session.id}`],
        }
      : null,
  }),
}));
vi.mock("@/kernel/identity/portal-auth", () => ({ getPortalActor: async () => ({ actor: null }) }));

/** What access:sync seeds on a fresh install: each atom's holders, and each declared bundle's atoms. */
const seeded = [
  ...Object.entries(PERMISSIONS.atoms).flatMap(([permission, atom]) => atom.holders.map((h) => ({ role: h.role, permission, scope: h.scope }))),
  ...Object.entries(PERMISSIONS.roles).flatMap(([role, bundle]) => bundle.atoms.map((a) => ({ role, permission: a.permission, scope: a.scope }))),
];
vi.mock("@/kernel/identity/access-rows", () => ({
  rolePermissionsFromDb: async (roles: readonly string[]) => seeded.filter((r) => roles.includes(r.role)),
  assignedRoles: async () => (who?.granted ?? []).map((role) => ({ role, because: `was granted it: ${role}` })),
  personIdForAuthUser: async () => null,
}));

import { registerAccessContributions } from "@/kernel/identity/access-contributions";
import { getAccess, requirePermission } from "@/kernel/identity/access-request";

const CONTRACTOR_ACCOUNTANT: Person = { session: { id: "acc", email: "acc@example.test" }, employmentType: "contract", granted: ["accountant"] };
const ADMIN: Person = { session: { id: "admin", email: "admin@example.test" }, adminGrant: true, employmentType: "full_time" };
const REVENUE: Person = { session: { id: "rev", email: "rev@example.test" }, employmentType: "full_time", granted: ["revenue"] };
const FINANCE: Person = { session: { id: "fin", email: "fin@example.test" }, employmentType: "contract", granted: ["finance"] };
const CONTRACTOR: Person = { session: { id: "con", email: "con@example.test" }, employmentType: "contract" };

/** The admin powers that rode on getAdminUser until AE.3, each now its own atom. */
// An atom is declared by the entity its prefix names; the public fork has no
// library entity, so it has no library atom to hold.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ADMIN_POWERS = ["boards.admin", "company-os.quickbooks", "company-os.publish-editor", "library.private-workflows"].filter(
  (atom) => expectedHere(ROOT, `entities/${atom.split(".")[0]}`),
);

/** Every page of a surface the signed-in person may open, by its declared atom. */
async function pagesOpenTo(surface: "/admin" | "/team"): Promise<string[]> {
  const access = await getAccess();
  return Object.entries(PERMISSIONS.routes)
    .filter(([path, atom]) => (path === surface || path.startsWith(`${surface}/`)) && atom !== "public" && access?.may(atom))
    .map(([path]) => path)
    .sort();
}

beforeEach(() => {
  who = null;
  redirect.mockClear();
  notFound.mockClear();
  registerAccessContributions([]);
});

describe("the Accountant bundle", () => {
  it("is declared by finance with exactly its six atoms, and neither surface", () => {
    const bundle = PERMISSIONS.roles.accountant;
    expect(bundle?.owner).toBe("finance");
    expect(bundle?.atoms.map((a) => `${a.permission}:${a.scope}`).sort()).toEqual(
      ["access.explain", "boards.open", "finance.invoices", "finance.payroll", "org.legal-registration", "reimbursements.pay"].map((a) => `${a}:all`).sort(),
    );
  });

  it("puts a contractor holding it onto Finance and the invoices in the Team view, and keeps them out of the Admin view", async () => {
    who = CONTRACTOR_ACCOUNTANT;
    await expect(requirePermission("surface.admin")).rejects.toThrow("notFound");
    const team = await pagesOpenTo("/team");
    // The accountant pays; Dave checks and approves (Dave, 2026-10-10).
    expect(team).not.toContain("/team/finance/claims/to-check");
    expect(team).toEqual(
      expect.arrayContaining([
        "/team/finance/payment-runs",
        "/team/finance/payment-runs/[id]",
        "/team/revenue/invoices",
        "/team/finance/payroll",
        "/team/finance/payroll/[id]",
      ]),
    );
    // The Revenue pages beyond the invoices come with a Revenue grant, not this bundle.
    expect(team.some((p) => p.startsWith("/team/revenue/") && p !== "/team/revenue/invoices")).toBe(false);
  });

  it("keeps the legal entities' registration details, but never adds an entity or renames one", () => {
    // Khoa, 2026-10-08: the Accountant keeps tax number, registration number,
    // address and the rest current, as Vietnamese law asks; creating an entity
    // and changing its name stay the Super Admin's.
    expect(PERMISSIONS.atoms["org.legal-registration"]?.holders).toContainEqual({ role: "accountant", scope: "all" });
    expect(PERMISSIONS.atoms["org.legal-entities"]?.holders).not.toContainEqual(expect.objectContaining({ role: "accountant" }));
    expect(PERMISSIONS.roles.accountant?.atoms.map((a) => a.permission)).not.toContain("org.legal-entities");
  });

  it("refuses the Accountant every admin power that rode on entering the Admin view, and commerce", async () => {
    who = CONTRACTOR_ACCOUNTANT;
    const access = await getAccess();
    for (const atom of [...ADMIN_POWERS, "company-os.commerce", "assistant.query"]) expect(access?.may(atom), atom).toBe(false);
  });

  it("keeps the contractor's own Team baseline, and the Company module page by page", async () => {
    who = CONTRACTOR_ACCOUNTANT;
    const team = await pagesOpenTo("/team");
    expect(team).toEqual(expect.arrayContaining(["/team/claims", "/team/directory", "/team/company-goals", "/team/strategy", "/team/vendors", "/team/coaching-sessions"]));
    // Cover is an employment benefit, not part of the Company module.
    expect(team).not.toContain("/team/insurance");
  });
});

describe("the Contractor baseline", () => {
  it("holds each Company page atom by its own holder line, not through the company role", () => {
    for (const atom of ["team.company", "team.directory", "team.vendors", "team.ideas", "team.culture", "coaching.sessions"]) {
      expect(PERMISSIONS.atoms[atom]?.holders, atom).toContainEqual({ role: "contractor", scope: "all" });
    }
    expect(PERMISSIONS.atoms["team.benefits"]?.holders).not.toContainEqual({ role: "contractor", scope: "all" });
  });

  it("opens the Company module for a plain contractor, without the Admin view", async () => {
    who = CONTRACTOR;
    const access = await getAccess();
    for (const atom of ["team.company", "team.directory", "team.vendors", "coaching.sessions"]) expect(access?.may(atom), atom).toBe(true);
    expect(access?.may("surface.admin")).toBe(false);
  });
});

describe("the admin powers", () => {
  it("are held by Admin by declaration, and listed in the Admin bundle", async () => {
    for (const atom of [...ADMIN_POWERS, "finance.invoices"]) {
      expect(PERMISSIONS.atoms[atom]?.holders, atom).toContainEqual({ role: "admin", scope: "all" });
      expect(PERMISSIONS.roles.admin?.atoms.map((a) => a.permission), atom).toContain(atom);
    }
    who = ADMIN;
    const access = await getAccess();
    for (const atom of [...ADMIN_POWERS, "finance.invoices", "company-os.commerce"]) expect(access?.may(atom), atom).toBe(true);
  });
});

describe("finance.invoices", () => {
  it("guards both invoices pages and the three invoice actions, which commerce no longer covers", () => {
    expect(PERMISSIONS.routes["/admin/revenue/invoices"]).toBe("finance.invoices");
    expect(PERMISSIONS.routes["/team/revenue/invoices"]).toBe("finance.invoices");
    for (const action of ["history-action", "map-action", "sync-action"]) {
      expect(PERMISSIONS.actions[`entities/finance/routes/admin/(dashboard)/revenue/invoices/${action}`], action).toBe("finance.invoices");
    }
    expect(PERMISSIONS.routes["/admin/revenue/products"]).toBe("company-os.commerce");
    expect(PERMISSIONS.atoms["finance.invoices"]?.owner).toBe("finance");
  });
});

describe("a Revenue or Finance holder, after the flags became grants", () => {
  it("keeps the invoices and commerce through the Revenue grant", async () => {
    who = REVENUE;
    const access = await getAccess();
    for (const atom of ["finance.invoices", "company-os.commerce"]) expect(access?.may(atom), atom).toBe(true);
    expect(await pagesOpenTo("/team")).toEqual(expect.arrayContaining(["/team/revenue/invoices", "/team/revenue/products"]));
  });

  it("keeps checking claims through the Finance grant", async () => {
    who = FINANCE;
    const access = await getAccess();
    expect(access?.may("reimbursements.check")).toBe(true);
    expect(await pagesOpenTo("/team")).toEqual(expect.arrayContaining(["/team/finance/claims/to-check"]));
  });
});
