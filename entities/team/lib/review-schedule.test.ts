import { describe, expect, it } from "vitest";

import {
  addMonths,
  computeNextReview,
  reviewMomentsInWindow,
  rollToFuture,
  toISODate,
  toUTCDate,
} from "./review-schedule";

// Characterisation tests: these pin the behaviour the scheduling block had
// while it lived inside ./reviews, so the split cannot have moved a date.

describe("addMonths", () => {
  it("clamps to the end of a shorter target month", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29"); // leap year
  });

  it("keeps the day when the target month is long enough", () => {
    expect(addMonths("2026-03-15", 5)).toBe("2026-08-15");
    expect(addMonths("2026-03-15", 11)).toBe("2027-02-15");
  });

  it("crosses year boundaries in both directions", () => {
    expect(addMonths("2026-12-31", 2)).toBe("2027-02-28");
    expect(addMonths("2026-01-15", -2)).toBe("2025-11-15");
    expect(addMonths("2024-02-29", 12)).toBe("2025-02-28"); // leap day into a common year
  });
});

describe("toUTCDate / toISODate", () => {
  it("round-trips a date-only string through UTC midnight", () => {
    expect(toISODate(toUTCDate("2026-07-04"))).toBe("2026-07-04");
    expect(toUTCDate("2026-07-04T13:22:00Z").toISOString()).toBe("2026-07-04T00:00:00.000Z");
  });
});

describe("rollToFuture", () => {
  it("leaves a date that is already today or later alone", () => {
    expect(rollToFuture("2026-09-01", "2026-09-01")).toBe("2026-09-01");
    expect(rollToFuture("2027-01-01", "2026-09-01")).toBe("2027-01-01");
  });

  it("adds whole years until the date reaches today", () => {
    expect(rollToFuture("2020-03-10", "2026-09-01")).toBe("2027-03-10");
  });

  it("gives up after 20 years rather than looping forever", () => {
    expect(rollToFuture("2000-01-01", "2100-01-01")).toBe("2020-01-01");
  });
});

describe("computeNextReview", () => {
  it("returns null with no dates at all", () => {
    expect(
      computeNextReview({
        startDate: null,
        contractStartDate: null,
        hasProbationReview: false,
        todayISO: "2026-09-01",
      }),
    ).toBeNull();
  });

  it("picks probation (start + 42 days) for a fresh joiner", () => {
    expect(
      computeNextReview({
        startDate: "2026-08-01",
        contractStartDate: null,
        hasProbationReview: false,
        todayISO: "2026-08-10",
      }),
    ).toEqual({ type: "probation", date: "2026-09-12" });
  });

  it("skips probation once one already exists", () => {
    expect(
      computeNextReview({
        startDate: "2026-08-01",
        contractStartDate: null,
        hasProbationReview: true,
        todayISO: "2026-08-10",
      }),
    ).toEqual({ type: "midyear", date: "2027-01-01" });
  });

  it("skips probation once it is more than 90 days past the start date", () => {
    expect(
      computeNextReview({
        startDate: "2026-01-01",
        contractStartDate: null,
        hasProbationReview: false,
        todayISO: "2026-05-01",
      }),
    ).toEqual({ type: "midyear", date: "2026-06-01" });
  });

  it("prefers the contract anchor over the start date", () => {
    expect(
      computeNextReview({
        startDate: "2024-01-01",
        contractStartDate: "2026-03-01",
        hasProbationReview: true,
        todayISO: "2026-09-01",
      }),
    ).toEqual({ type: "renewal", date: "2027-02-01" });
  });

  it("rolls the annual moments forward to the next occurrence", () => {
    expect(
      computeNextReview({
        startDate: null,
        contractStartDate: "2020-05-10",
        hasProbationReview: true,
        todayISO: "2026-09-01",
      }),
    ).toEqual({ type: "midyear", date: "2026-10-10" });
  });
});

describe("reviewMomentsInWindow", () => {
  const base = { contractStartDate: null, hasProbationReview: false, graceDays: 7 };

  it("returns nothing with no dates", () => {
    expect(
      reviewMomentsInWindow({ ...base, startDate: null, todayISO: "2026-09-01" }),
    ).toEqual([]);
  });

  it("fires probation exactly on the due date", () => {
    expect(
      reviewMomentsInWindow({ ...base, startDate: "2026-07-21", todayISO: "2026-09-01" }),
    ).toEqual([
      { type: "probation", date: "2026-09-01", cycleLabel: "probation-auto-2026" },
    ]);
  });

  it("still fires probation inside the grace window but not before or after", () => {
    const withStart = (todayISO: string) =>
      reviewMomentsInWindow({ ...base, startDate: "2026-07-21", todayISO });
    expect(withStart("2026-09-08").map((m) => m.type)).toEqual(["probation"]); // last grace day
    expect(withStart("2026-09-09")).toEqual([]); // one day too late
    expect(withStart("2026-08-31")).toEqual([]); // not due yet
  });

  it("suppresses probation when one already exists", () => {
    expect(
      reviewMomentsInWindow({
        ...base,
        hasProbationReview: true,
        startDate: "2026-07-21",
        todayISO: "2026-09-01",
      }),
    ).toEqual([]);
  });

  it("fires the midyear moment on its anniversary and labels it by year", () => {
    expect(
      reviewMomentsInWindow({
        startDate: null,
        contractStartDate: "2023-04-01",
        hasProbationReview: true,
        graceDays: 7,
        todayISO: "2026-09-01",
      }),
    ).toEqual([{ type: "midyear", date: "2026-09-01", cycleLabel: "midyear-auto-2026" }]);
  });

  it("fires the renewal moment eleven months after the anchor", () => {
    expect(
      reviewMomentsInWindow({
        startDate: null,
        contractStartDate: "2025-10-01",
        hasProbationReview: true,
        graceDays: 7,
        todayISO: "2026-09-01",
      }),
    ).toEqual([{ type: "renewal", date: "2026-09-01", cycleLabel: "renewal-auto-2026" }]);
  });
});
