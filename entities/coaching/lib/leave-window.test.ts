import { describe, expect, it } from "vitest";
import {
  CLEAR_DAY_HORIZON,
  LEAVE_LOOKBACK,
  leaveCovering,
  missWorthPrompting,
  nextClearDay,
  onLeave,
  type LeaveSpan,
} from "./leave-window";

// Mon 21 Sep 2026 is a Monday; the week runs 21..27.
const LEAVE: LeaveSpan[] = [{ startDate: "2026-09-21", endDate: "2026-09-23" }];
const MONDAY = 1;
const THURSDAY = 4;

describe("onLeave", () => {
  it("covers both ends of a span", () => {
    expect(onLeave("2026-09-21", LEAVE)).toBe(true);
    expect(onLeave("2026-09-23", LEAVE)).toBe(true);
    expect(onLeave("2026-09-22", LEAVE)).toBe(true);
  });

  it("leaves the days either side alone", () => {
    expect(onLeave("2026-09-20", LEAVE)).toBe(false);
    expect(onLeave("2026-09-24", LEAVE)).toBe(false);
  });

  it("says no when nobody is away", () => {
    expect(onLeave("2026-09-22", [])).toBe(false);
  });
});

describe("leaveCovering", () => {
  // A boolean tells a coach nothing they can act on; the span tells them to
  // look at Thursday.
  it("hands back the span so the page can explain itself", () => {
    expect(leaveCovering("2026-09-22", LEAVE)).toEqual(LEAVE[0]);
    expect(leaveCovering("2026-09-24", LEAVE)).toBeNull();
  });
});

describe("nextClearDay", () => {
  it("returns the day itself when nobody is away", () => {
    expect(nextClearDay("2026-09-24", LEAVE, null)).toBe("2026-09-24");
  });

  it("walks past the leave", () => {
    expect(nextClearDay("2026-09-21", LEAVE, null)).toBe("2026-09-24");
  });

  // K.34: a Thursday person should not be quietly moved to Tuesdays for the
  // rest of the quarter by one clash.
  it("prefers the member's own weekday over an earlier day", () => {
    expect(nextClearDay("2026-09-21", LEAVE, THURSDAY)).toBe("2026-09-24");
  });

  it("skips a preferred weekday that is itself covered", () => {
    const longLeave: LeaveSpan[] = [{ startDate: "2026-09-21", endDate: "2026-09-25" }];
    // Thursday 24th is inside the leave, so the next Thursday is the 1st.
    expect(nextClearDay("2026-09-21", longLeave, THURSDAY)).toBe("2026-10-01");
  });

  it("falls back to the earliest clear day when the preferred weekday never comes clear", () => {
    // Every Monday in the horizon is covered, but other days are free.
    const mondays: LeaveSpan[] = [
      { startDate: "2026-09-21", endDate: "2026-09-21" },
      { startDate: "2026-09-28", endDate: "2026-09-28" },
      { startDate: "2026-10-05", endDate: "2026-10-05" },
      { startDate: "2026-10-12", endDate: "2026-10-12" },
    ];
    expect(nextClearDay("2026-09-21", mondays, MONDAY)).toBe("2026-09-22");
  });

  it("says nothing rather than a date past the horizon", () => {
    const forever: LeaveSpan[] = [{ startDate: "2026-09-21", endDate: "2027-01-01" }];
    expect(nextClearDay("2026-09-21", forever, null)).toBeNull();
    expect(CLEAR_DAY_HORIZON).toBe(21);
  });
});

describe("missWorthPrompting", () => {
  // The whole point: a 1-1 missed because somebody was on holiday is not a
  // missed 1-1 in any sense the product should raise.
  it("stays quiet about a 1-1 missed during leave", () => {
    expect(missWorthPrompting("2026-09-22", LEAVE)).toBe(false);
  });

  it("still prompts about a 1-1 missed on a working day", () => {
    expect(missWorthPrompting("2026-09-24", LEAVE)).toBe(true);
  });

  it("has nothing to say when nothing was missed", () => {
    expect(missWorthPrompting(null, LEAVE)).toBe(false);
  });
});

// The regression that BH-1 and BH-2 needed and nobody had. The old tests passed
// spans in BY HAND, so every one of them was about a holiday that happened to be
// in the window — and the bug was that the window never contained a finished
// holiday at all. These fix the window in place, the way the query does.
describe("the window the query actually loads (BH-1 regression)", () => {
  const TODAY = "2026-09-28";

  // What getLeaveSpans returns: spans overlapping [today - LEAVE_LOOKBACK,
  // today + CLEAR_DAY_HORIZON]. Before the fix the lower bound was TODAY, so a
  // holiday that had ended was simply absent and every question about it
  // answered "they were here".
  const loaded = (spans: LeaveSpan[], todayISO: string, lookback: number) =>
    spans.filter((s) => s.endDate >= addDaysISO(todayISO, -lookback) && s.startDate <= addDaysISO(todayISO, 21));

  function addDaysISO(iso: string, days: number): string {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  const ENDED: LeaveSpan[] = [{ startDate: "2026-09-21", endDate: "2026-09-23" }];

  it("a holiday that has ended is IN the window now", () => {
    expect(loaded(ENDED, TODAY, LEAVE_LOOKBACK)).toHaveLength(1);
  });

  it("and was NOT in it under the old forward-only bound — the bug", () => {
    expect(loaded(ENDED, TODAY, 0)).toHaveLength(0);
  });

  // The canonical case from the hunt: 1-1 booked Wednesday, leave Mon–Wed,
  // member opens the page the following Monday.
  it("a 1-1 missed during a finished holiday raises nothing", () => {
    const spans = loaded(ENDED, TODAY, LEAVE_LOOKBACK);
    expect(missWorthPrompting("2026-09-23", spans)).toBe(false);
  });

  it("but a 1-1 missed on a working day still does", () => {
    const spans = loaded(ENDED, TODAY, LEAVE_LOOKBACK);
    expect(missWorthPrompting("2026-09-25", spans)).toBe(true);
  });

  it("reaches back far enough for a miss a stalled cron left sitting", () => {
    expect(LEAVE_LOOKBACK).toBeGreaterThanOrEqual(30);
  });
});
