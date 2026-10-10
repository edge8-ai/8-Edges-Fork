import { describe, expect, it } from "vitest";
import { LETTER_MAX, letterIsOpen, normaliseLetter, quarterOf, sealedFor } from "./quarter-letter";

const WROTE = { letterMd: "I want to stop finding the problem and start fixing it.", sealedOn: "2026-07-02", quarterLabel: "2026Q3" };

describe("normaliseLetter", () => {
  it("keeps what was written, trimmed", () => {
    expect(normaliseLetter("  two sentences.  ")).toBe("two sentences.");
  });

  it("treats blank as no letter", () => {
    expect(normaliseLetter("")).toBeNull();
    expect(normaliseLetter("   ")).toBeNull();
    expect(normaliseLetter(null)).toBeNull();
  });

  it("caps it so a letter stays a letter", () => {
    expect(normaliseLetter("x".repeat(LETTER_MAX + 80))).toHaveLength(LETTER_MAX);
  });
});

describe("letterIsOpen", () => {
  // The seal is the feature: the value is entirely in not having read it.
  it("stays sealed everywhere that is not the right quarter review", () => {
    expect(letterIsOpen(WROTE, null, "2026Q4")).toBe(false);
    expect(letterIsOpen(WROTE, "2026Q2", "2026Q4")).toBe(false);
  });

  it("stays sealed during the quarter it was written for", () => {
    // Re-reading your hopes for a quarter you are still living is reading a
    // to-do list.
    expect(letterIsOpen(WROTE, "2026Q3", "2026Q3")).toBe(false);
  });

  it("opens on the review of a quarter that is over", () => {
    expect(letterIsOpen(WROTE, "2026Q3", "2026Q4")).toBe(true);
  });

  it("opens across a year boundary", () => {
    expect(letterIsOpen(WROTE, "2026Q3", "2027Q1")).toBe(true);
  });

  it("has nothing to open when nothing was written", () => {
    expect(letterIsOpen({ ...WROTE, letterMd: null }, "2026Q3", "2026Q4")).toBe(false);
  });

  it("has nothing to open for a goal with no quarter", () => {
    expect(letterIsOpen({ ...WROTE, quarterLabel: null }, "2026Q3", "2026Q4")).toBe(false);
  });
});

describe("quarterOf", () => {
  it("maps a date to its quarter label", () => {
    expect(quarterOf("2026-01-15")).toBe("2026Q1");
    expect(quarterOf("2026-03-31")).toBe("2026Q1");
    expect(quarterOf("2026-04-01")).toBe("2026Q2");
    expect(quarterOf("2026-09-18")).toBe("2026Q3");
    expect(quarterOf("2026-12-31")).toBe("2026Q4");
  });
});

describe("sealedFor", () => {
  it("says how long it sat", () => {
    expect(sealedFor("2026-07-02", "2026-10-01")).toBe("3 months ago");
    expect(sealedFor("2026-09-02", "2026-10-01")).toBe("a month ago");
    expect(sealedFor("2026-09-02", "2026-09-18")).toBe("earlier this month");
  });

  it("counts across a year boundary", () => {
    expect(sealedFor("2026-10-01", "2027-01-01")).toBe("3 months ago");
  });

  it("has nothing to say about a letter that was never sealed", () => {
    expect(sealedFor(null, "2026-10-01")).toBeNull();
  });
});
