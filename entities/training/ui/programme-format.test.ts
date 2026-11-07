// TR.7: the programme read's bars are twenty segments; their maths, proved.
import { describe, expect, it } from "vitest";
import { notWentLine, segmentClasses } from "./programme-format";
import type { Figures } from "../lib/programme-read-rules";

describe("segmentClasses", () => {
  it("fills the whole bar, in the order given", () => {
    const s = segmentClasses([
      { cls: "a", n: 5 },
      { cls: "b", n: 35 },
      { cls: "c", n: 8 },
    ]);
    expect(s).toHaveLength(20);
    expect(s.indexOf("b")).toBeGreaterThan(s.lastIndexOf("a"));
    expect(s.indexOf("c")).toBeGreaterThan(s.lastIndexOf("b"));
  });

  it("never drops an answer: a share under one segment still gets one", () => {
    // 1 of 41 is under one segment; it is raised to one rather than dropped.
    const s = segmentClasses([{ cls: "a", n: 1 }, { cls: "b", n: 40 }]);
    expect(s.filter((c) => c === "a")).toHaveLength(1);
    expect(s).toHaveLength(20);
  });

  it("draws nothing when nothing was answered", () => {
    expect(segmentClasses([{ cls: "a", n: 0 }])).toEqual([]);
  });
});

describe("notWentLine", () => {
  const base: Figures = { trainings: 1, reviewers: 3, reviews: 3, stars: 4, load: { too_little: 0, about_right: 3, too_much: 0 }, tags: [], listed: 3, went: 3, skipped: 0, absent: 0, noAnswer: 0, skips: [], namelessNotes: 0, signedNotes: 0 };

  it("says everyone went when they did", () => {
    expect(notWentLine(base)).toBe("everyone went");
  });

  it("names every reason, then the absent and the unanswered", () => {
    expect(notWentLine({ ...base, skips: [{ label: "Clashed", n: 2 }], absent: 1, noAnswer: 3 })).toBe("2 clashed, 1 marked absent, 3 no answer");
  });
});
