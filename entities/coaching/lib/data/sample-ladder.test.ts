import { describe, expect, it } from "vitest";
import { sampleLadderRungs } from "./sample-ladder";

describe("sampleLadderRungs", () => {
  it("draws objective, key result and goal, in that order", () => {
    expect(sampleLadderRungs().map((rung) => rung.kind)).toEqual(["objective", "key_result", "goal"]);
  });

  it("carries no numbers, so the example never reads as this member's progress", () => {
    for (const rung of sampleLadderRungs()) {
      expect(rung.currentValue).toBeNull();
      expect(rung.targetValue).toBeNull();
      expect(rung.progressPct).toBeNull();
      expect(rung.measure).toBeNull();
    }
  });

  it("gives every rung a label and a paragraph to open", () => {
    for (const rung of sampleLadderRungs()) {
      expect(rung.label.length).toBeGreaterThan(0);
      expect(rung.detail).not.toBeNull();
    }
  });
});
