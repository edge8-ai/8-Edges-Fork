import { describe, expect, it } from "vitest";
import type { AdminUser } from "@/kernel/identity/admin-auth";
import type { SearchActor } from "@/kernel/identity/search-actor";
import { PER_KIND, runSearch as runSearchWith, searchTerms, type SearchContribution, type SearchHit } from "./search";

// The pages the hits below open, as the registry keys them.
const ROUTES = {
  "/admin/x/[id]": "x.read",
  "/admin/secret/[id]": "x.secret",
  "/team/x/[id]": "x.read",
};
const holding = (...held: string[]) => ({ may: (p: string) => held.includes(p) });
const ADMIN: SearchActor = { surface: "admin", admin: { id: "u1", email: "a@x.test" } as AdminUser, access: holding("x.read") };
const hit = (id: string, href = `/admin/x/${id}`): SearchHit => ({ id, title: `T ${id}`, detail: null, href });

function contribution(over: Partial<SearchContribution> = {}): SearchContribution {
  return { kind: "thing", label: "Things", opens: { admin: "/admin/x/[id]" }, search: async () => [hit("1")], ...over };
}

const runSearch = (cs: SearchContribution[], actor: SearchActor, query: string, opts: { timeoutMs?: number } = {}) =>
  runSearchWith(cs, actor, query, { routes: ROUTES, ...opts });

describe("searchTerms", () => {
  it("splits on whitespace and keeps each word as a term", () => {
    expect(searchTerms("  acme   invoice ")).toEqual(["acme", "invoice"]);
  });

  it("strips what PostgREST reads as filter syntax, so a term cannot add a condition", () => {
    expect(searchTerms('x,id.gt.0 "(y)"')).toEqual(["xid.gt.0", "y"]);
  });

  it("drops a term that strips to nothing and folds duplicates", () => {
    expect(searchTerms("%%% acme ACME acme")).toEqual(["acme", "ACME"]);
  });

  it("caps the number of terms, so one query cannot fan out into dozens of filters", () => {
    expect(searchTerms("a1 b2 c3 d4 e5 f6 g7")).toHaveLength(5);
  });
});

describe("runSearch", () => {
  it("answers nothing below two characters without asking any searcher", async () => {
    let asked = false;
    const result = await runSearch([contribution({ search: async () => ((asked = true), [hit("1")]) })], ADMIN, "a");
    expect(result.groups).toEqual([]);
    expect(asked).toBe(false);
  });

  it("asks only the contributions that serve the actor's surface", async () => {
    const team = contribution({ kind: "team-only", opens: { team: "/team/x/[id]" } });
    const result = await runSearch([contribution(), team], ADMIN, "acme");
    expect(result.groups.map((g) => g.kind)).toEqual(["thing"]);
  });

  it("hands the searcher the terms and the per-kind limit, and trims what it returns to that limit", async () => {
    let seen: unknown[] = [];
    const many = Array.from({ length: PER_KIND + 3 }, (_, i) => hit(String(i)));
    const result = await runSearch(
      [contribution({ search: async (_actor, terms, limit) => ((seen = [terms, limit]), many) })],
      ADMIN,
      "acme corp",
    );
    expect(seen).toEqual([["acme", "corp"], PER_KIND]);
    expect(result.groups[0].hits).toHaveLength(PER_KIND);
  });

  it("leaves out a kind with no hits, keeping the contributions' order for the rest", async () => {
    const result = await runSearch(
      [contribution({ kind: "a" }), contribution({ kind: "b", search: async () => [] }), contribution({ kind: "c" })],
      ADMIN,
      "acme",
    );
    expect(result.groups.map((g) => g.kind)).toEqual(["a", "c"]);
  });

  it("marks a searcher that throws as failed rather than empty, and the others still answer", async () => {
    // A failed read must not render as "no matches" (CLAUDE.md rule 2): the
    // palette says that kind could not be searched.
    const result = await runSearch(
      [contribution({ kind: "broken", search: async () => Promise.reject(new Error("db down")) }), contribution()],
      ADMIN,
      "acme",
    );
    expect(result.groups).toEqual([
      { kind: "broken", label: "Things", hits: [], failed: true },
      { kind: "thing", label: "Things", hits: [hit("1")], failed: false },
    ]);
  });

  it("gives up on a slow searcher at the timeout and marks it failed, so one kind cannot blank the palette", async () => {
    const slow = contribution({ kind: "slow", search: () => new Promise<SearchHit[]>(() => {}) });
    const result = await runSearch([slow, contribution()], ADMIN, "acme", { timeoutMs: 10 });
    expect(result.groups.map((g) => [g.kind, g.failed])).toEqual([
      ["slow", true],
      ["thing", false],
    ]);
  });

  describe("is never a side door (ADR 0013)", () => {
    it("does not ask a contribution whose page the actor may not open", async () => {
      let asked = false;
      const secret = contribution({ kind: "secret", opens: { admin: "/admin/secret/[id]" }, search: async () => ((asked = true), [hit("9", "/admin/secret/9")]) });
      const result = await runSearch([secret, contribution()], ADMIN, "acme");
      expect(asked).toBe(false);
      expect(result.groups.map((g) => g.kind)).toEqual(["thing"]);
    });

    it("withholds a hit whose own page the actor may not open, and keeps the rest", async () => {
      const mixed = contribution({ search: async () => [hit("1"), hit("2", "/admin/secret/2")] });
      const result = await runSearch([mixed], ADMIN, "acme");
      expect(result.groups[0].hits.map((h) => h.id)).toEqual(["1"]);
    });

    it("shows the same hit to someone who holds the page's permission", async () => {
      const mixed = contribution({ search: async () => [hit("1"), hit("2", "/admin/secret/2")] });
      const result = await runSearch([mixed], { ...ADMIN, access: holding("x.read", "x.secret") }, "acme");
      expect(result.groups[0].hits.map((h) => h.id)).toEqual(["1", "2"]);
    });

    it("is closed by default: a hit whose page no declaration names is withheld, even from someone holding everything", async () => {
      const everything = { may: () => true };
      const stray = contribution({ search: async () => [hit("1"), hit("3", "/admin/undeclared/3")] });
      const result = await runSearch([stray], { ...ADMIN, access: everything }, "acme");
      expect(result.groups[0].hits.map((h) => h.id)).toEqual(["1"]);
    });

    it("is closed by default: a contribution that names an undeclared page, or none for this surface, is never asked", async () => {
      let asked = false;
      const search = async () => ((asked = true), [hit("1")]);
      const everything = { may: () => true };
      await runSearch(
        [contribution({ opens: { admin: "/admin/undeclared/[id]" }, search }), contribution({ opens: {}, search })],
        { ...ADMIN, access: everything },
        "acme",
      );
      expect(asked).toBe(false);
    });
  });
});
