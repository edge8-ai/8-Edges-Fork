import { describe, expect, it } from "vitest";
import { QUESTION_LIBRARY } from "./questions-library";

describe("QUESTION_LIBRARY", () => {
  it("offers four groups", () => {
    expect(QUESTION_LIBRARY).toHaveLength(4);
    expect(QUESTION_LIBRARY.map((g) => g.title)).toEqual([
      "Career",
      "Workload",
      "Feedback",
      "The company",
    ]);
  });

  it("holds between eight and twelve questions", () => {
    // The list is a prompt, not a catalogue: past a dozen it stops being
    // something a member can skim in the seconds before a 1-1.
    const all = QUESTION_LIBRARY.flatMap((g) => g.questions);
    expect(all.length).toBeGreaterThanOrEqual(8);
    expect(all.length).toBeLessThanOrEqual(12);
  });

  it("has no empty titles, groups or questions", () => {
    for (const group of QUESTION_LIBRARY) {
      expect(group.title.trim()).not.toBe("");
      expect(group.questions.length).toBeGreaterThan(0);
      for (const question of group.questions) expect(question.trim()).not.toBe("");
    }
  });

  it("does not repeat a question", () => {
    const all = QUESTION_LIBRARY.flatMap((g) => g.questions);
    expect(new Set(all).size).toBe(all.length);
  });
});
