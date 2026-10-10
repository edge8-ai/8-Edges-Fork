import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// S.1. Hiring answers the global search with candidates, admin only: the team
// hub has no candidate screen to open. A candidate's name and email live on
// their person row, so the match is made there and the candidates behind the
// matching people are returned, each opening its candidate page.
vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (table: string) => builderFor(table) } }));

import type { AdminUser } from "@/kernel/identity/admin-auth";
import type { SearchActor } from "@/kernel/identity/search-actor";
import { ReadFailure } from "@/kernel/data/read";
import { searchContributions } from "./search";

const [candidates] = searchContributions;
const ADMIN: SearchActor = { surface: "admin", admin: { id: "u1", email: "a@x.test" } as AdminUser, access: { may: () => true } };
const person = { id: "p1", display_name: "Lan Pham", preferred_name: null, full_name: "Pham Lan", email: "lan@x.test" };

beforeEach(() => resetFake());

describe("hiring's search contribution", () => {
  it("offers candidates on the admin surface only, by the candidate page each opens", () => {
    expect(searchContributions.map((c) => [c.kind, c.opens])).toEqual([["candidate", { admin: "/admin/talent/candidates/[id]" }]]);
  });

  it("matches on the person and returns the candidates behind them, opening each candidate page", async () => {
    script("people", { data: [person, { ...person, id: "p2" }] });
    script("candidates", { data: [{ id: "c1", person_id: "p1", current_title: "AI Engineer" }] });
    const hits = await candidates.search(ADMIN, ["lan"], 5);
    expect(hits).toEqual([{ id: "c1", title: "Lan Pham", detail: "AI Engineer", href: "/admin/talent/candidates/c1" }]);
    expect(calls[0].filters).toContainEqual([
      "or",
      "full_name.ilike.*lan*,display_name.ilike.*lan*,preferred_name.ilike.*lan*,email.ilike.*lan*",
    ]);
    expect(calls[1].filters).toContainEqual(["in", "person_id", ["p1", "p2"]]);
  });

  it("asks for no candidates when no person matched", async () => {
    script("people", { data: [] });
    expect(await candidates.search(ADMIN, ["zzz"], 5)).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it("raises a failed read rather than answering that nobody matched", async () => {
    script("people", { data: [person] });
    script("candidates", { error: { message: "db down" } });
    await expect(candidates.search(ADMIN, ["lan"], 5)).rejects.toBeInstanceOf(ReadFailure);
  });
});
