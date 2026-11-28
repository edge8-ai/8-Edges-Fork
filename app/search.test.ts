// Global search is never a side door (AC.15, ADR 0013), asserted against the
// search this deployment actually ships: the generated actions in app/search.ts,
// the real contributions they compose, and the registry in app/permissions.ts.
// Each persona holds exactly the atoms its roles hold by default (the
// registry's `holders`, which reproduce today's access), so what each one is
// searched for here is what they are searched for in production.
//
// Nothing is scripted on the fake database, so every searcher that is asked
// fails its read and comes back as a failed group. The kinds in the answer are
// therefore exactly the kinds that were asked, and a kind that is missing was
// never read at all.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, resetFake } from "@/kernel/data/testing/fake-company-os";

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (table: string) => builderFor(table) } }));

const persona = vi.hoisted(() => ({ roles: [] as string[], onTeam: true }));

vi.mock("@/kernel/identity/access-request", async (importActual) => {
  const { PERMISSIONS } = await import("@/app/permissions");
  const may = (atom: string) => (PERMISSIONS.atoms[atom]?.holders ?? []).some((h) => persona.roles.includes(h.role));
  return {
    ...(await importActual<typeof import("@/kernel/identity/access-request")>()),
    requirePermission: async (atom: string) => {
      if (!may(atom)) throw new Error(`refused: ${atom}`);
      return { roles: [], permissions: () => [], may, user: { id: "u1", email: "p@edge8.test" }, personId: "p1" };
    },
  };
});

vi.mock("@/kernel/identity/team-auth", async (importActual) => ({
  ...(await importActual<typeof import("@/kernel/identity/team-auth")>()),
  requireTeamMember: async () => {
    if (!persona.onTeam) throw new Error("refused: not on the team");
    return { personId: "p1", teamMemberId: "tm1", isAdmin: persona.roles.includes("admin"), permissions: [] };
  },
}));

const DEPLOYMENT = process.env.EDGE8_DEPLOYMENT ?? "edge8";
const describeEdge8 = DEPLOYMENT === "edge8" ? describe : describe.skip;

import { PERMISSIONS } from "@/app/permissions";
import { searchAdmin, searchTeam } from "@/app/search";
import { registerPermissionRegistry } from "@/kernel/identity/permission-registry";

registerPermissionRegistry(PERMISSIONS);

async function askedOn(surface: "admin" | "team", roles: string[]): Promise<string[]> {
  persona.roles = roles;
  persona.onTeam = surface === "team";
  const result = await (surface === "admin" ? searchAdmin : searchTeam)("acme");
  return result.groups.map((g) => g.kind);
}

beforeEach(() => {
  resetFake();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describeEdge8("global search asks only what each persona may open", () => {
  it("a team member finds cards on their boards, and is never searched for a company, a deal or an invoice", async () => {
    expect(await askedOn("team", ["team-member"])).toEqual(["card"]);
  });

  it("a contractor finds what a team member finds", async () => {
    expect(await askedOn("team", ["contractor"])).toEqual(["card"]);
  });

  it("a team member granted Revenue also finds invoices, companies and deals", async () => {
    expect(await askedOn("team", ["team-member", "revenue"])).toEqual(["card", "invoice", "company", "deal"]);
  });

  it("an admin on the team finds Revenue on the team surface, as their admin session lets them in today", async () => {
    expect(await askedOn("team", ["team-member", "admin"])).toEqual(["card", "invoice", "company", "deal"]);
  });

  it("an admin finds every admin kind except candidates, whose page only a Super Admin may open", async () => {
    expect(await askedOn("admin", ["admin"])).toEqual(["card", "invoice", "person", "company", "deal"]);
  });

  it("a Super Admin finds candidates too", async () => {
    expect(await askedOn("admin", ["admin", "super-admin"])).toEqual(["card", "invoice", "person", "company", "deal", "candidate"]);
  });

  it("someone without the surface's permission is refused before anything is searched", async () => {
    await expect(askedOn("admin", ["team-member"])).rejects.toThrow("refused: surface.admin");
  });
});
