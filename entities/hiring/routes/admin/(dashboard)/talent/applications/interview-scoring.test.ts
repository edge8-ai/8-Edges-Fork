import { describe, expect, it } from "vitest";
import { disagrees, humanScores, recTone } from "./interview-scoring";

// The panel shows a GAP flag when the AI panelist's score for a criterion sits a
// full point or more from any human's. These pin the exact threshold and the
// null handling, which decide whether a recruiter sees the flag at all.

const card = (...scores: [string, number | null][]) => ({
  scores: scores.map(([criterion, score]) => ({ criterion, score })),
});

describe("humanScores", () => {
  it("collects one criterion across every panelist, in panel order", () => {
    const cards = [card(["depth", 4], ["comms", 2]), card(["comms", 5], ["depth", 1])];
    expect(humanScores(cards, "depth")).toEqual([4, 1]);
    expect(humanScores(cards, "comms")).toEqual([2, 5]);
  });

  it("keeps an unscored criterion as null rather than dropping it", () => {
    expect(humanScores([card(["depth", null]), card(["depth", 3])], "depth")).toEqual([null, 3]);
  });

  it("returns an empty list for a criterion nobody scored, and for no cards", () => {
    expect(humanScores([card(["depth", 4])], "culture")).toEqual([]);
    expect(humanScores([], "depth")).toEqual([]);
  });

  it("keeps every entry when one panelist scored the same criterion twice", () => {
    expect(humanScores([card(["depth", 2], ["depth", 5])], "depth")).toEqual([2, 5]);
  });
});

describe("disagrees", () => {
  it("flags a gap of exactly one point — the threshold is inclusive", () => {
    expect(disagrees(3, [4])).toBe(true);
    expect(disagrees(3, [2])).toBe(true);
  });

  it("does not flag a gap under one point", () => {
    expect(disagrees(3, [3])).toBe(false);
    expect(disagrees(3, [3.5, 2.5])).toBe(false);
  });

  it("flags if any single human disagrees, even when the rest agree", () => {
    expect(disagrees(3, [3, 3, 5])).toBe(true);
  });

  it("never flags when the AI did not score", () => {
    expect(disagrees(null, [1, 5])).toBe(false);
  });

  it("ignores humans who did not score, and an empty panel", () => {
    expect(disagrees(3, [null, null])).toBe(false);
    expect(disagrees(3, [])).toBe(false);
    expect(disagrees(3, [null, 5])).toBe(true);
  });
});

describe("recTone", () => {
  it("maps the three tones, treating anything unknown as an error", () => {
    expect(recTone("ok")).toBe("var(--admin-ok-ink)");
    expect(recTone("warn")).toBe("var(--admin-warn-ink)");
    expect(recTone("err")).toBe("var(--admin-err-ink)");
    expect(recTone("")).toBe("var(--admin-err-ink)");
    expect(recTone("something-new")).toBe("var(--admin-err-ink)");
  });
});
