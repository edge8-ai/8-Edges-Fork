import { describe, expect, it } from "vitest";
import { clientToday, isCalendarDay, isPastDueDate } from "./due-date";

describe("due date helpers", () => {
  it("calls only an earlier day past", () => {
    const now = "2026-11-17";
    expect(isPastDueDate("2026-11-16", now)).toBe(true);
    expect(isPastDueDate("2026-11-17", now)).toBe(false);
    expect(isPastDueDate("2026-12-04", now)).toBe(false);
  });
  it("accepts only real calendar days", () => {
    expect(isCalendarDay("2026-12-04")).toBe(true);
    expect(isCalendarDay("2026-02-31")).toBe(false);
    expect(isCalendarDay("04/12/2026")).toBe(false);
  });
});

// The day a member's update window ends is the client's day (CR.6): at 03:00
// UTC on 5 Dec it is still 4 Dec in New York but already 5 Dec in Saigon.
describe("clientToday", () => {
  const now = new Date("2026-12-05T03:00:00Z");
  it("reads the day in the client's time zone", () => {
    expect(clientToday("America/New_York", now)).toBe("2026-12-04");
  });
  it("falls back to Saigon when the client has no zone, or an unknown one", () => {
    expect(clientToday(null, now)).toBe("2026-12-05");
    expect(clientToday(undefined, now)).toBe("2026-12-05");
    expect(clientToday("Not/AZone", now)).toBe("2026-12-05");
  });
});
