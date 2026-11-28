import { describe, expect, it } from "vitest";
import { HOW_FIELD_MAX, HOW_I_WORK, hasHowIWork, normaliseHowField, toHowIWork } from "./how-i-work";

describe("HOW_I_WORK prompts", () => {
  it("asks for four things a colleague can act on", () => {
    expect(HOW_I_WORK).toHaveLength(4);
    expect(HOW_I_WORK.map((p) => p.key)).toEqual(["bestHours", "feedback", "quiet", "curious"]);
  });

  it("maps every field to its own column", () => {
    expect(new Set(HOW_I_WORK.map((p) => p.column)).size).toBe(4);
  });
});

describe("toHowIWork", () => {
  it("reads the four columns", () => {
    expect(toHowIWork({ how_best_hours_md: "Early.", how_feedback_md: null })).toEqual({
      bestHours: "Early.",
      feedback: null,
      quiet: null,
      curious: null,
    });
  });

  it("treats a missing row as four blanks rather than throwing", () => {
    expect(toHowIWork({})).toEqual({ bestHours: null, feedback: null, quiet: null, curious: null });
  });
});

describe("hasHowIWork", () => {
  it("is false for a member who has written nothing", () => {
    expect(hasHowIWork({ bestHours: null, feedback: null, quiet: null, curious: null })).toBe(false);
    expect(hasHowIWork({ bestHours: "   ", feedback: null, quiet: null, curious: null })).toBe(false);
  });

  it("is true as soon as one field carries words", () => {
    expect(hasHowIWork({ bestHours: null, feedback: null, quiet: "Ask me.", curious: null })).toBe(true);
  });
});

describe("normaliseHowField", () => {
  it("keeps what was written, trimmed", () => {
    expect(normaliseHowField("  Early.  ")).toBe("Early.");
  });

  it("treats blank as cleared", () => {
    expect(normaliseHowField("")).toBeNull();
    expect(normaliseHowField("   ")).toBeNull();
    expect(normaliseHowField(null)).toBeNull();
  });

  it("caps a field so a manual stays a manual", () => {
    expect(normaliseHowField("x".repeat(HOW_FIELD_MAX + 60))).toHaveLength(HOW_FIELD_MAX);
  });
});
