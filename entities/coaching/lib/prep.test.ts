import { describe, expect, it } from "vitest";
import { MAX_PREP_BULLETS, shapePrep } from "./prep";

// The ten-bullet prep (K.4). The model writes one flat list; bullets it marks
// "[coach]" are for the coach alone (a retention read, a question to avoid).
// shapePrep turns that into the two stored copies: the coach's, tag stripped,
// and the member's, coach-only bullets removed. Both are capped at ten, the
// working number from the 16 September debate, in case the model overruns.

describe("shapePrep", () => {
  it("strips the [coach] tag for the coach and drops those bullets for the member", () => {
    const raw = [
      "- Goal: ask how the Q3 FAST goal moved since the demo.",
      "- [coach] Listen for whether the new PM hand-off is wearing on them.",
      "- They raised: the staging outage on Monday.",
    ].join("\n");
    const { coach, member } = shapePrep(raw);
    expect(coach).toBe(
      [
        "- Goal: ask how the Q3 FAST goal moved since the demo.",
        "- Listen for whether the new PM hand-off is wearing on them.",
        "- They raised: the staging outage on Monday.",
      ].join("\n"),
    );
    expect(member).toBe(
      ["- Goal: ask how the Q3 FAST goal moved since the demo.", "- They raised: the staging outage on Monday."].join("\n"),
    );
  });

  it("keeps only the first ten bullets and ignores headings and prose", () => {
    const raw = ["## Prep", "Some preamble.", ...Array.from({ length: 14 }, (_, i) => `- bullet ${i + 1}`)].join("\n");
    const { coach, member } = shapePrep(raw);
    expect(coach.split("\n")).toHaveLength(MAX_PREP_BULLETS);
    expect(coach.split("\n")[0]).toBe("- bullet 1");
    expect(member).toBe(coach);
  });

  it("accepts * and numbered bullets and normalises them to -", () => {
    const { coach } = shapePrep("* first\n1. second\n2) third");
    expect(coach).toBe("- first\n- second\n- third");
  });

  it("returns empty strings when the model wrote no bullets", () => {
    expect(shapePrep("Nothing to prepare.")).toEqual({ coach: "", member: "" });
  });
});
