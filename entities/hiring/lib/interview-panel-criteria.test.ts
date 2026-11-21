import { describe, expect, it } from "vitest";
import { uniqueByCriterion } from "./interview-panel";

describe("uniqueByCriterion", () => {
  it("keeps one row per criterion so the upsert batch never names a row twice", () => {
    const out = uniqueByCriterion([
      { criterion: "Ownership", score: 2, position: 0 },
      { criterion: "Values fit", score: 4, position: 1 },
      { criterion: "Ownership", score: 5, position: 2 },
    ]);
    expect(out).toEqual([
      { criterion: "Ownership", score: 5, position: 0 },
      { criterion: "Values fit", score: 4, position: 1 },
    ]);
  });
});
