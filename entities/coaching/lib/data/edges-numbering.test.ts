import { describe, expect, it, vi } from "vitest";

// The ladder picker and Company Goals must name a key result the same way: a
// member who sees KR2.4 on Company Goals must find KR2.4 in the coaching
// dropdown. The picker used to restart at KR1 inside each objective and to
// number every objective it loaded, of any year or level (K.76).

// The real numbering helpers, so a regression in either side shows here; only
// the database reads are stubbed.
vi.mock("@/kernel/data/supabase", () => ({ companyOs: {} }));
vi.mock("@/entities/org", async () => ({
  ...(await vi.importActual<typeof import("@/entities/org/lib/company/edges-shared")>(
    "@/entities/org/lib/company/edges-shared",
  )),
  selectObjectives: vi.fn(),
  selectKeyResults: vi.fn(),
}));

import { numberEdges } from "./goals";

const obj = (id: string, extra: Partial<{ level: string; year: number | null; status: string }> = {}) => ({
  id,
  title: `Objective ${id}`,
  level: "company",
  year: 2026,
  status: "active",
  ...extra,
});
const kr = (id: string, objective_id: string | null) => ({ id, title: `KR ${id}`, objective_id });

describe("numberEdges", () => {
  it("numbers key results objective.n, counting within each objective", () => {
    const edges = numberEdges(
      [obj("a"), obj("b")],
      [kr("a1", "a"), kr("b1", "b"), kr("a2", "a"), kr("b2", "b"), kr("b3", "b"), kr("b4", "b")],
      2026,
    );
    expect(edges.objectives.map((o) => o.code)).toEqual(["O1", "O2"]);
    expect(Object.fromEntries(edges.keyResults.map((k) => [k.id, k.code]))).toEqual({
      a1: "KR1.1",
      a2: "KR1.2",
      b1: "KR2.1",
      b2: "KR2.2",
      b3: "KR2.3",
      b4: "KR2.4",
    });
  });

  it("numbers only this year's active company objectives, as Company Goals shows them", () => {
    const edges = numberEdges(
      [obj("old", { year: 2025 }), obj("gone", { status: "dropped" }), obj("office", { level: "office" }), obj("a")],
      [kr("old1", "old"), kr("gone1", "gone"), kr("office1", "office"), kr("a1", "a")],
      2026,
    );
    // The one current company objective is O1, not O4.
    expect(edges.objectives[0]).toMatchObject({ id: "a", code: "O1" });
    expect(edges.keyResults.find((k) => k.id === "a1")?.code).toBe("KR1.1");
  });

  it("keeps the uncoded rows so an older goal's ladder still resolves", () => {
    const edges = numberEdges([obj("old", { year: 2025 }), obj("a")], [kr("old1", "old"), kr("loose", null)], 2026);
    expect(edges.objectives.find((o) => o.id === "old")).toMatchObject({ code: null, label: "Objective old" });
    expect(edges.keyResults.find((k) => k.id === "old1")).toMatchObject({ code: null, label: "KR old1" });
    expect(edges.keyResults.find((k) => k.id === "loose")).toMatchObject({ code: null, objectiveId: null });
  });
});
