import { describe, expect, it } from "vitest";
import { allowedNumbers, checkStory, figureLines, figuresHash, sliceInput, storiesMatching, storyParts, storyWeekLabel } from "./narration-rules";
import type { Figures } from "./programme-read-rules";

// TR.9, spec story 53: a narration may cite only figures it was given. The
// Class figures of the TR.9 canvas: 12 people, 48 reviews, 4.3 stars.
const CLASS: Figures = {
  trainings: 22,
  reviewers: 12,
  reviews: 48,
  stars: 4.3,
  load: { too_little: 5, about_right: 35, too_much: 8 },
  tags: [
    { label: "Useful", n: 28 },
    { label: "Clear", n: 17 },
    { label: "Too fast", n: 10 },
  ],
  listed: 74,
  went: 64,
  skipped: 8,
  absent: 0,
  noAnswer: 2,
  skips: [
    { label: "Clashed", n: 5 },
    { label: "Unwell", n: 3 },
  ],
  namelessNotes: 4,
  signedNotes: 1,
};
const STORY = "Class keeps landing well: 4.3 stars from 12 people across 48 reviews. Most found the load about right (73%), though Too fast came up 10 times. 64 of 74 went.";

describe("what the model is told", () => {
  it("states the card's figures and nothing about anyone", () => {
    expect(figureLines(CLASS)).toEqual([
      "Trainings: 22",
      "People who reviewed: 12",
      "Reviews: 48",
      "Average stars: 4.3 out of 5",
      "Load: too little 10%, about right 73%, too much 17%",
      "How it felt (times chosen): Useful 28, Clear 17, Too fast 10",
      "Went: 64 of 74 (86%)",
      "Did not go: 5 clashed, 3 unwell, 2 no answer",
    ]);
    expect(sliceInput({ grain: "type", name: "Class", sub: "22 trainings" }, "start", CLASS)).toMatch(/^Training type: Class\nPeriod: Since the start\n/);
  });

  it("never passes the notes on, only that the figures have none of their words", () => {
    expect(figureLines(CLASS).join(" ")).not.toMatch(/nameless|signed|note/i);
  });

  it("leaves out the load and the misses when there are none", () => {
    const quiet = { ...CLASS, load: { too_little: 0, about_right: 0, too_much: 0 }, tags: [], listed: 10, went: 10, skips: [], noAnswer: 0 };
    expect(figureLines(quiet).join("\n")).not.toMatch(/Load|felt|Did not go/);
  });
});

describe("the check every story passes", () => {
  it("keeps a story whose every number is one of its figures", () => {
    expect(checkStory(STORY, CLASS, "start")).toEqual({ ok: true, body: STORY });
    expect([...allowedNumbers(CLASS, "start")]).toEqual(expect.arrayContaining(["12", "48", "4.3", "73", "86", "64", "74", "5", "3", "2"]));
  });

  it("refuses a story that invents a number (story 53)", () => {
    expect(checkStory(STORY.replace("12 people", "13 people"), CLASS, "start")).toEqual({ ok: false, error: "The story cites 13, which is not in its figures." });
    expect(checkStory("Class landed at 4.4 stars.", CLASS, "start")).toEqual({ ok: false, error: "The story cites 4.4, which is not in its figures." });
    expect(checkStory("75% found it about right.", CLASS, "start").ok).toBe(false);
  });

  // Found by the live test of 2026-11-04: every 30-day story was refused for
  // saying the period the model had been told.
  it("lets a story cite the period it was told, and only that one", () => {
    expect(checkStory("Over the last 30 days, 64 of 74 went.", CLASS, "m").ok).toBe(true);
    expect(checkStory("Over the last 30 days, 64 of 74 went.", CLASS, "start").ok).toBe(false);
    expect(checkStory("Over the last 30 days, 64 of 74 went.", CLASS, "q").ok).toBe(false);
  });

  it("refuses a number written in words, which the check cannot see", () => {
    expect(checkStory("Twelve people reviewed it.", CLASS, "start")).toEqual({ ok: false, error: 'The story writes "Twelve" in words, which the figures cannot check.' });
    expect(checkStory("About half found it too fast.", CLASS, "start").ok).toBe(false);
  });

  it("reads a thousands separator as part of the number", () => {
    expect(checkStory("1,200 people went.", CLASS, "start").ok).toBe(false);
  });

  it("refuses an empty story and a story past the table's limit, and tidies spacing", () => {
    expect(checkStory("   ", CLASS, "start").ok).toBe(false);
    expect(checkStory("a".repeat(801), CLASS, "start").ok).toBe(false);
    expect(checkStory("  Class   went well.\n", CLASS, "start")).toEqual({ ok: true, body: "Class went well." });
  });
});

describe("sharing a story", () => {
  it("hashes the same figures the same way and different figures differently", () => {
    const s = { grain: "type", name: "Class" };
    expect(figuresHash(CLASS, s, "start")).toBe(figuresHash({ ...CLASS }, s, "start"));
    expect(figuresHash(CLASS, s, "start")).not.toBe(figuresHash({ ...CLASS, went: 63 }, s, "start"));
    expect(figuresHash(CLASS, s, "start")).not.toBe(figuresHash(CLASS, s, "m"));
    expect(figuresHash(CLASS, s, "start")).not.toBe(figuresHash(CLASS, { grain: "plan", name: "Class" }, "start"));
  });
});

describe("the story on a card", () => {
  it("says which Monday it was written for", () => {
    expect(storyWeekLabel("2026-11-02")).toBe("Monday 2 Nov");
    expect(storyWeekLabel("2026-09-14", true)).toBe("Mon 14 Sep");
  });

  it("sets the numbers apart so the card can show them bold", () => {
    expect(storyParts("4.3 stars from 12 people (73%).")).toEqual([
      { text: "4.3", number: true },
      { text: " stars from ", number: false },
      { text: "12", number: true },
      { text: " people (", number: false },
      { text: "73%", number: true },
      { text: ").", number: false },
    ]);
  });
});

describe("a story beside its slice", () => {
  const slice = { key: "type:t0", grain: "type" as const, name: "Class", shown: true as const, figures: CLASS };
  const story = { body: STORY, week: "2026-11-02", hash: figuresHash(CLASS, slice, "start") };

  it("shows while the slice's figures are the ones it was written from", () => {
    expect(storiesMatching([slice], "start", new Map([["type:t0", story]]))).toEqual(new Map([["type:t0", { body: STORY, week: "2026-11-02" }]]));
  });

  it("drops once one review moves the figures, so the two cannot be subtracted", () => {
    const moved = { ...slice, figures: { ...CLASS, reviewers: 13, reviews: 49, stars: 4.4 } };
    expect(storiesMatching([moved], "start", new Map([["type:t0", story]])).size).toBe(0);
  });

  it("never shows on a hidden slice, nor a story written for another period", () => {
    expect(storiesMatching([{ key: "type:t0", grain: "type", name: "Class", shown: false }], "start", new Map([["type:t0", story]])).size).toBe(0);
    expect(storiesMatching([slice], "m", new Map([["type:t0", story]])).size).toBe(0);
  });
});
