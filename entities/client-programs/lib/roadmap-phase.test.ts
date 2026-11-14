import { describe, expect, it } from "vitest";
import type { BacklogItem } from "./client-backlog";
import { NO_PHASE, itemPhase, itemsByPhase } from "./roadmap-phase";

const item = (id: string, group_key: string, needs: string[]) => ({ id, group_key, needs }) as BacklogItem;

describe("itemPhase", () => {
  it("reads the first tag that names a phase", () => {
    expect(itemPhase(item("a", "g", ["Grow access", "Phase 2"]))).toBe("Phase 2");
    expect(itemPhase(item("a", "g", ["Parked"]))).toBe("Parked");
    expect(itemPhase(item("a", "g", ["Phase III"]))).toBe("Phase III");
  });

  it("does not guess a phase for an untagged item", () => {
    expect(itemPhase(item("a", "g", []))).toBe(NO_PHASE);
    expect(itemPhase(item("a", "g", ["Grow access"]))).toBe(NO_PHASE);
  });
});

describe("itemsByPhase", () => {
  const groups = [{ key: "foundation" }, { key: "revenue" }];

  it("orders phases by number, then Parked, then no phase", () => {
    const sections = itemsByPhase(
      [item("x", "revenue", ["Parked"]), item("n", "revenue", []), item("b", "revenue", ["Phase 2"]), item("a", "revenue", ["Phase 1"])],
      groups,
    );
    expect(sections.map((s) => s.phase)).toEqual(["Phase 1", "Phase 2", "Parked", NO_PHASE]);
  });

  it("treats roman and arabic numerals alike when ordering", () => {
    const sections = itemsByPhase([item("b", "revenue", ["Phase II"]), item("a", "revenue", ["Phase 1"]), item("c", "revenue", ["Phase 3"])], groups);
    expect(sections.map((s) => s.phase)).toEqual(["Phase 1", "Phase II", "Phase 3"]);
  });

  it("keeps the section order inside a phase", () => {
    const [phase1] = itemsByPhase([item("r1", "revenue", ["Phase 1"]), item("f1", "foundation", ["Phase 1"]), item("r2", "revenue", ["Phase 1"])], groups);
    expect(phase1.items.map((i) => i.id)).toEqual(["f1", "r1", "r2"]);
  });
});
