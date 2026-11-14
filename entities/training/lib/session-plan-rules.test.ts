import { describe, expect, it } from "vitest";
import { BlockInput, splitMinutes } from "./session-plan-rules";

describe("splitMinutes", () => {
  it("sums each side and gives the presentation share", () => {
    expect(splitMinutes([{ side: "presentation", minutes: 8 }, { side: "presentation", minutes: 29 }, { side: "reactive", minutes: 38 }])).toEqual({ presentation: 37, reactive: 38, total: 75, presentationPercent: 49 });
    expect(splitMinutes([])).toEqual({ presentation: 0, reactive: 0, total: 0, presentationPercent: 0 });
  });
});

describe("BlockInput", () => {
  const ID = "6f1c6a9e-2b8f-4a3e-9d6e-1a2b3c4d5e6f";
  it("takes an exercise or a free line, never both and never neither", () => {
    expect(BlockInput.safeParse({ side: "reactive", exerciseId: ID, text: null, minutes: 10 }).success).toBe(true);
    expect(BlockInput.safeParse({ side: "reactive", exerciseId: null, text: "Mini stand-up", minutes: 8 }).success).toBe(true);
    expect(BlockInput.safeParse({ side: "reactive", exerciseId: ID, text: "both", minutes: 8 }).success).toBe(false);
    expect(BlockInput.safeParse({ side: "reactive", exerciseId: null, text: "", minutes: 8 }).success).toBe(false);
    expect(BlockInput.safeParse({ side: "reactive", exerciseId: null, text: "x", minutes: 0 }).success).toBe(false);
  });
});
