import { describe, expect, it } from "vitest";
import { countWorkingDays } from "./leave";
import { rangeCovering } from "./holidays";

// What these pin down is the bug T.1 fixed: the office-closure calendar was
// never subtracted, so a week off over a public holiday burned a day of leave
// the company was shut for. Each case below is a way that could come back —
// a holiday counted anyway, a weekend double-counted, a half-day on a closure,
// or the whole thing shifting by a day in a non-UTC timezone.

// Thu 30 Apr and Fri 1 May 2026 are both statutory holidays; 2 May is a
// Saturday. Using real dates keeps the tests readable against the seed.
const REUNIFICATION = "2026-04-30";
const LABOUR_DAY = "2026-05-01";

describe("countWorkingDays", () => {
  it("counts weekdays and ignores weekends when given no calendar", () => {
    // Mon 20 Apr to Fri 24 Apr 2026: five weekdays.
    expect(countWorkingDays("2026-04-20", "2026-04-24", false)).toBe(5);
    // Through to Monday: the weekend adds nothing.
    expect(countWorkingDays("2026-04-20", "2026-04-27", false)).toBe(6);
  });

  it("keeps the old behaviour when the calendar is omitted, empty or null", () => {
    const span = ["2026-04-27", "2026-05-01"] as const;
    expect(countWorkingDays(...span, false)).toBe(5);
    expect(countWorkingDays(...span, false, [])).toBe(5);
    expect(countWorkingDays(...span, false, null)).toBe(5);
  });

  it("does not count a holiday inside the range", () => {
    // Mon 27 Apr to Fri 1 May: five weekdays, two of them closures.
    expect(countWorkingDays("2026-04-27", "2026-05-01", false, [REUNIFICATION, LABOUR_DAY])).toBe(3);
  });

  it("accepts the calendar as a Set as well as an array", () => {
    const asSet = new Set([REUNIFICATION, LABOUR_DAY]);
    expect(countWorkingDays("2026-04-27", "2026-05-01", false, asSet)).toBe(3);
  });

  it("ignores a holiday outside the range", () => {
    // The week before the closures: nothing to subtract.
    expect(countWorkingDays("2026-04-20", "2026-04-24", false, [REUNIFICATION, LABOUR_DAY])).toBe(5);
  });

  it("does not double-subtract a holiday that falls on a weekend", () => {
    // Sat 2 May 2026 is already not a working day; naming it a holiday too must
    // not push the count negative or drop a weekday.
    expect(countWorkingDays("2026-04-27", "2026-05-03", false, ["2026-05-02"])).toBe(5);
  });

  it("counts a half-day as 0.5, and as nothing when the office was shut", () => {
    expect(countWorkingDays(LABOUR_DAY, LABOUR_DAY, true)).toBe(0.5);
    expect(countWorkingDays(LABOUR_DAY, LABOUR_DAY, true, [LABOUR_DAY])).toBe(0);
  });

  it("matches a holiday by its local date, not a UTC-shifted one", () => {
    // The loop builds days from local midnight. Reading them back through
    // toISOString() in Saigon (UTC+7) would name each day as the one before, so
    // a single-day request on a closure would still count 1. It must count 0.
    expect(countWorkingDays(REUNIFICATION, REUNIFICATION, false, [REUNIFICATION])).toBe(0);
    // And the day either side is unaffected.
    expect(countWorkingDays("2026-04-29", "2026-04-29", false, [REUNIFICATION])).toBe(1);
  });

  it("returns 0 for a reversed or unparseable range", () => {
    expect(countWorkingDays("2026-05-01", "2026-04-27", false)).toBe(0);
    expect(countWorkingDays("not-a-date", "2026-04-27", false)).toBe(0);
  });
});

describe("rangeCovering", () => {
  it("spans the earliest and latest day given", () => {
    expect(
      rangeCovering(["2026-05-04", "2026-05-08", "2026-01-02", "2026-03-01", "2026-12-31"]),
    ).toEqual({ from: "2026-01-02", to: "2026-12-31" });
  });

  it("is null when there is nothing to cover, and skips blanks", () => {
    expect(rangeCovering([])).toBeNull();
    expect(rangeCovering(["", "2026-03-01"])).toEqual({ from: "2026-03-01", to: "2026-03-01" });
  });
});
