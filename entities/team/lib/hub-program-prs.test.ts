import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";
import { fetchPrPage } from "./hub-program-prs";

// A.52. The PR search strips the characters that are filter syntax or LIKE
// wildcards before it builds its `or(...)` string. `*` was missing, and
// PostgREST reads it as `%`, so a search for "*" matched every PR the program
// owns. These read the filter the query was actually given.
vi.mock("@/kernel/data/supabase", () => ({ ...fakeSupabase(), htt: { from: (table: string) => builderFor(table) } }));

beforeEach(() => resetFake());

async function orFiltersFor(search: string): Promise<string[]> {
  script("pull_requests", { count: 0 }, { count: 0 }, { data: [] });
  await fetchPrPage(["repo-1"], { search });
  return calls.flatMap((c) => c.filters.filter((f) => f[0] === "or").map((f) => String(f[1])));
}

describe("fetchPrPage search", () => {
  it("strips `*` with the other wildcards, so it is not a match-everything pattern", async () => {
    const ors = await orFiltersFor("fix*login");
    expect(ors.length).toBe(2);
    for (const or of ors) {
      expect(or).not.toContain("*");
      expect(or).toBe("title.ilike.%fix login%,author_login.ilike.%fix login%");
    }
  });

  it("adds no search filter when the term is only wildcards", async () => {
    expect(await orFiltersFor("*%_")).toEqual([]);
  });
});
