import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// S.1. crm answers the global search for the three kinds whose screens it owns:
// people (/admin/contacts), companies and deals (Revenue, on both surfaces).
// Each kind names the page its hits open, and runSearch asks it only of someone
// who may open that page (ADR 0013), so who finds a company or a deal is the
// Revenue pages' own declared permission; app/search.test.ts proves it for the
// personas. Nobody on the team surface finds a person: there is no such page.
vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (table: string) => builderFor(table) } }));

import type { AdminUser } from "@/kernel/identity/admin-auth";
import type { SearchActor } from "@/kernel/identity/search-actor";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { ReadFailure } from "@/kernel/data/read";
import { searchContributions } from "./search";

const everything = { may: () => true };
const ADMIN: SearchActor = { surface: "admin", admin: { id: "u1", email: "a@x.test" } as AdminUser, access: everything };
const teamWith = (over: Partial<TeamActor>): SearchActor => ({
  surface: "team",
  team: { personId: "p1", isAdmin: false, permissions: [], ...over } as TeamActor,
  access: everything,
});
const byKind = (kind: string) => {
  const c = searchContributions.find((x) => x.kind === kind);
  if (!c) throw new Error(`no ${kind} contribution`);
  return c;
};

beforeEach(() => resetFake());

describe("crm's search contributions", () => {
  it("offers people to admins only, and companies and deals on both surfaces, each by the page its hits open", () => {
    expect(searchContributions.map((c) => [c.kind, c.opens])).toEqual([
      ["person", { admin: "/admin/contacts/[id]" }],
      ["company", { admin: "/admin/revenue/companies/[id]", team: "/team/revenue/companies/[id]" }],
      ["deal", { admin: "/admin/revenue/deals/[id]", team: "/team/revenue/deals/[id]" }],
    ]);
  });

  it("finds a person by any of their names or email, every term matching, and opens their contact page", async () => {
    script("people", { data: [{ id: "p9", display_name: "Mai Tran", preferred_name: null, full_name: "Tran Thi Mai", email: "mai@x.test" }] });
    const hits = await byKind("person").search(ADMIN, ["mai", "tran"], 5);
    expect(hits).toEqual([{ id: "p9", title: "Mai Tran", detail: "mai@x.test", href: "/admin/contacts/p9" }]);
    const ors = calls[0].filters.filter((f) => f[0] === "or").map((f) => f[1]);
    expect(ors).toEqual([
      "full_name.ilike.*mai*,display_name.ilike.*mai*,preferred_name.ilike.*mai*,email.ilike.*mai*",
      "full_name.ilike.*tran*,display_name.ilike.*tran*,preferred_name.ilike.*tran*,email.ilike.*tran*",
    ]);
    expect(calls[0].filters).toContainEqual(["is", "archived_at", null]);
    expect(calls[0].ops).toContain("limit");
  });

  it("raises a failed read instead of answering that nobody matched", async () => {
    script("people", { error: { message: "db down" } });
    await expect(byKind("person").search(ADMIN, ["mai"], 5)).rejects.toBeInstanceOf(ReadFailure);
  });

  it("links a company to the Revenue screen of the surface the searcher is on", async () => {
    script("companies", { data: [{ id: "c1", name: "Acme", website_url: "acme.test" }] }, { data: [{ id: "c1", name: "Acme", website_url: null }] });
    const admin = await byKind("company").search(ADMIN, ["acme"], 5);
    const team = await byKind("company").search(teamWith({}), ["acme"], 5);
    expect(admin[0]).toEqual({ id: "c1", title: "Acme", detail: "acme.test", href: "/admin/revenue/companies/c1" });
    expect(team[0].href).toBe("/team/revenue/companies/c1");
  });

  it("links a deal to the team's Revenue screen for a searcher on the team surface", async () => {
    script("deals", { data: [{ id: "d1", title: "Acme pilot", company: { name: "Acme" } }] });
    const hits = await byKind("deal").search(teamWith({ isAdmin: true }), ["pilot"], 5);
    expect(hits).toEqual([{ id: "d1", title: "Acme pilot", detail: "Acme", href: "/team/revenue/deals/d1" }]);
  });
});
