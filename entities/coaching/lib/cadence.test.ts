import { describe, expect, it } from "vitest";
import { describeDay, nearestWeekday, nextWeekdayOnOrAfter, openProposal, shortTime, validateProposedDate } from "./cadence";

describe("weekday helpers", () => {
  it("finds the nearest occurrence, never more than three days away", () => {
    expect(nearestWeekday("2026-09-09", 3)).toBe("2026-09-09");
    expect(nearestWeekday("2026-09-09", 1)).toBe("2026-09-07");
    expect(nearestWeekday("2026-09-09", 0)).toBe("2026-09-06");
    expect(nearestWeekday("2026-09-09", 6)).toBe("2026-09-12");
  });
  it("finds the first occurrence on or after a date", () => {
    expect(nextWeekdayOnOrAfter("2026-09-09", 3)).toBe("2026-09-09");
    expect(nextWeekdayOnOrAfter("2026-09-09", 1)).toBe("2026-09-14");
  });
  it("shortens a Postgres time", () => {
    expect(shortTime("15:00:00")).toBe("15:00");
    expect(shortTime("09:30")).toBe("09:30");
    expect(shortTime(null)).toBeNull();
    expect(shortTime("")).toBeNull();
  });
});

describe("describeDay", () => {
  it("names the weekday and the day from the date string alone", () => {
    expect(describeDay("2026-09-23")).toBe("Wednesday 23 Sep");
    expect(describeDay("2026-01-01")).toBe("Thursday 1 Jan");
  });
});

describe("validateProposedDate", () => {
  const today = "2026-09-17"; // a Thursday
  it("accepts a weekday today or later", () => {
    expect(validateProposedDate("2026-09-17", today)).toEqual({ ok: true });
    expect(validateProposedDate("2026-09-23", today)).toEqual({ ok: true });
  });
  it("refuses a past date, a weekend and a malformed one", () => {
    expect(validateProposedDate("2026-09-16", today).ok).toBe(false);
    expect(validateProposedDate("2026-09-19", today).ok).toBe(false); // Saturday
    expect(validateProposedDate("2026-09-20", today).ok).toBe(false); // Sunday
    expect(validateProposedDate("next week", today).ok).toBe(false);
  });
});

describe("openProposal", () => {
  it("keeps a proposal for today or later", () => {
    expect(openProposal("2026-10-06", "2026-10-06")).toBe("2026-10-06");
    expect(openProposal("2026-10-09", "2026-10-06")).toBe("2026-10-09");
  });

  it("drops a proposal whose day has passed, so nobody is asked to confirm it", () => {
    expect(openProposal("2026-10-01", "2026-10-06")).toBeNull();
  });

  it("has nothing to say about no proposal", () => {
    expect(openProposal(null, "2026-10-06")).toBeNull();
  });
});
