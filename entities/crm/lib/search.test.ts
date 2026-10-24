import { beforeEach, describe, expect, it, vi } from "vitest";

// S.1, SR.2.2. crm answers the global search for the three kinds whose screens
// it owns: people (/admin/contacts), companies and deals (Revenue, on both
// surfaces), each through the database's ranked search (company_os.search_people,
// search_companies, search_deals; matching and order proved against production
// in the SR.2.1 migration's proof). Each kind names the page its hits open, and
// runSearch asks it only of someone who may open that page (ADR 0013), so who
// finds a company or a deal is the Revenue pages' own declared permission;
// app/search.test.ts proves it for the personas. Nobody on the team surface
// finds a person: there is no such page.
const rpc = vi.fn<(fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>>();
vi.mock("@/kernel/data/supabase", () => ({ companyOs: { rpc: (fn: string, args: Record<string, unknown>) => rpc(fn, args) } }));

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
const answer = (data: unknown[]) => rpc.mockResolvedValue({ data, error: null });

beforeEach(() => rpc.mockReset());

describe("crm's search contributions", () => {
  it("offers people to admins only, and companies and deals on both surfaces, each by the page its hits open", () => {
    expect(searchContributions.map((c) => [c.kind, c.opens])).toEqual([
      ["person", { admin: "/admin/contacts/[id]" }],
      ["company", { admin: "/admin/revenue/companies/[id]", team: "/team/revenue/companies/[id]" }],
      ["deal", { admin: "/admin/revenue/deals/[id]", team: "/team/revenue/deals/[id]" }],
    ]);
  });

  it("asks the ranked people search with the terms, names a person as everywhere else, and opens their contact page", async () => {
    answer([{ id: "p9", display_name: "Mai Tran", preferred_name: null, full_name: "Tran Thi Mai", email: "mai@x.test", score: 60 }]);
    const hits = await byKind("person").search(ADMIN, ["mai", "tran"], 5);
    expect(rpc).toHaveBeenCalledWith("search_people", { terms: ["mai", "tran"], lim: 5 });
    expect(hits).toEqual([{ id: "p9", title: "Mai Tran", detail: "mai@x.test", href: "/admin/contacts/p9" }]);
  });

  it("keeps the database's order, best match first", async () => {
    answer([
      { id: "a", display_name: "An Nguyen", preferred_name: null, full_name: null, email: "a@x.test", score: 100 },
      { id: "b", display_name: "Thanh Le", preferred_name: null, full_name: null, email: "b@x.test", score: 10 },
    ]);
    expect((await byKind("person").search(ADMIN, ["an"], 5)).map((h) => h.id)).toEqual(["a", "b"]);
  });

  it("raises a failed read instead of answering that nobody matched", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "db down" } });
    await expect(byKind("person").search(ADMIN, ["mai"], 5)).rejects.toBeInstanceOf(ReadFailure);
  });

  it("links a company to the Revenue screen of the surface the searcher is on", async () => {
    answer([{ id: "c1", name: "Acme", website_url: "https://acme.test", score: 30 }]);
    const [admin] = await byKind("company").search(ADMIN, ["acme"], 5);
    expect(rpc).toHaveBeenCalledWith("search_companies", { terms: ["acme"], lim: 5 });
    expect(admin).toEqual({ id: "c1", title: "Acme", detail: "https://acme.test", href: "/admin/revenue/companies/c1" });
    answer([{ id: "c1", name: "Acme", website_url: null, score: 30 }]);
    const [onTeam] = await byKind("company").search(teamWith({}), ["acme"], 5);
    expect(onTeam.href).toBe("/team/revenue/companies/c1");
  });

  it("links a deal to the team's Revenue screen for a searcher on the team surface, with its company", async () => {
    answer([{ id: "d1", title: "Acme pilot", company_name: "Acme", score: 30 }]);
    const [hit] = await byKind("deal").search(teamWith({}), ["pilot"], 5);
    expect(rpc).toHaveBeenCalledWith("search_deals", { terms: ["pilot"], lim: 5 });
    expect(hit).toEqual({ id: "d1", title: "Acme pilot", detail: "Acme", href: "/team/revenue/deals/d1" });
  });
});
