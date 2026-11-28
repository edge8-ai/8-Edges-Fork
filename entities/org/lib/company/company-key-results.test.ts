import { beforeEach, describe, expect, it, vi } from "vitest";

// M.25. Two foreign keys join key_results and objectives (a key result's own
// objective, and an objective's parent key result), so an embed that does not
// name one is refused by PostgREST. The read then fell back to an empty list,
// and the campaign KPI picker stayed empty from 14 Oct to 18 Nov.

let selected = "";
let rows: unknown[] | null = [];

function builder() {
  const b = {
    select: (columns: string) => {
      selected = columns;
      return b;
    },
    eq: () => b,
    neq: () => b,
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve(rows === null ? { data: null, error: { message: "boom" } } : { data: rows, error: null }).then(resolve),
  };
  return b;
}

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: () => builder() } }));

const { listCompanyKeyResults } = await import("./company-key-results");

beforeEach(() => {
  selected = "";
  rows = [];
});

describe("listCompanyKeyResults", () => {
  it("names the key result's own objective, so the embed is not ambiguous", async () => {
    await listCompanyKeyResults();
    expect(selected).toContain("objectives!key_results_objective_id_fkey!inner(");
    // A bare embed is the shape production refused.
    expect(selected).not.toMatch(/(^|[ ,])objectives!inner\(/);
  });

  it("orders key results by their objective, then by their own position", async () => {
    rows = [
      { id: "b2", title: "B two", sort_order: 2, objectives: { title: "B", sort_order: 2 } },
      { id: "a1", title: "A one", sort_order: 1, objectives: [{ title: "A", sort_order: 1 }] },
      { id: "b1", title: "B one", sort_order: 1, objectives: { title: "B", sort_order: 2 } },
    ];
    expect(await listCompanyKeyResults()).toEqual([
      { id: "a1", title: "A one", objectiveTitle: "A" },
      { id: "b1", title: "B one", objectiveTitle: "B" },
      { id: "b2", title: "B two", objectiveTitle: "B" },
    ]);
  });

  it("falls back to an empty picker when the read fails", async () => {
    rows = null;
    expect(await listCompanyKeyResults()).toEqual([]);
  });
});
