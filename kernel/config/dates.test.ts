import { describe, expect, it } from "vitest";
import { addDays, clockLabel, dayMonth, diffDays, isTimeZone, isWeekend, monthDay, nextWorkday, previousWorkday, saigonToday, shortDay, timeZoneLabel, workdaysBefore, zonedClock, zonedInstant } from "./dates";

describe("addDays", () => {
  it("adds within a month", () => {
    expect(addDays("2026-09-02", 5)).toBe("2026-09-07");
  });
  it("crosses a month boundary", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("crosses a year boundary and handles leap days", () => {
    expect(addDays("2025-12-31", 1)).toBe("2026-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });
});

describe("diffDays", () => {
  it("counts whole days in either direction", () => {
    expect(diffDays("2026-01-31", "2026-02-02")).toBe(2);
    expect(diffDays("2026-02-02", "2026-01-31")).toBe(-2);
  });
});

describe("saigonToday", () => {
  it("returns a YYYY-MM-DD string", () => {
    expect(saigonToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("the working week", () => {
  // 2026-09-19 is a Saturday, 2026-09-20 the Sunday after it.
  it("names the two days nobody works", () => {
    expect(isWeekend("2026-09-19")).toBe(true);
    expect(isWeekend("2026-09-20")).toBe(true);
    expect(isWeekend("2026-09-18")).toBe(false);
    expect(isWeekend("2026-09-21")).toBe(false);
  });
  it("offers the Friday before and the Monday after", () => {
    expect(previousWorkday("2026-09-19")).toBe("2026-09-18");
    expect(nextWorkday("2026-09-19")).toBe("2026-09-21");
    expect(previousWorkday("2026-09-20")).toBe("2026-09-18");
    expect(nextWorkday("2026-09-20")).toBe("2026-09-21");
  });
  it("leaves a weekday alone, so a caller can apply them blind", () => {
    expect(previousWorkday("2026-09-16")).toBe("2026-09-16");
    expect(nextWorkday("2026-09-16")).toBe("2026-09-16");
  });
  it("crosses a month boundary both ways", () => {
    // 2026-08-01 is a Saturday; its Friday is in July.
    expect(previousWorkday("2026-08-01")).toBe("2026-07-31");
    // 2026-10-31 is a Saturday; its Monday is in November.
    expect(nextWorkday("2026-10-31")).toBe("2026-11-02");
  });
});

describe("workdaysBefore", () => {
  it("counts back over weekdays only", () => {
    // Friday 4 December 2026, three working days back, is Tuesday 1 December.
    expect(workdaysBefore("2026-12-04", 3)).toBe("2026-12-01");
    // A Monday's working day before is the Friday.
    expect(workdaysBefore("2026-11-23", 1)).toBe("2026-11-20");
  });
});

// CR.5.4: a client's wall clock. New York left daylight saving at 02:00 on
// Sunday 1 November 2026 (EDT, UTC-4, to EST, UTC-5) and enters it at 02:00 on
// Sunday 8 March 2026, so 9:00 am there is 13:00 UTC on one side and 14:00 on
// the other. Each expected instant below is worked out from those offsets.
describe("zonedInstant", () => {
  const NY = "America/New_York";
  it("reads 9:00 am in New York on both sides of the November change", () => {
    expect(zonedInstant("2026-10-30", "09:00", NY)).toBe("2026-10-30T13:00:00.000Z");
    expect(zonedInstant("2026-11-02", "09:00", NY)).toBe("2026-11-02T14:00:00.000Z");
    // The prototype's example: Wed 18 Nov, 9:00 am Eastern is 9:00 pm in Saigon.
    expect(zonedInstant("2026-11-18", "09:00", NY)).toBe("2026-11-18T14:00:00.000Z");
  });
  it("reads 9:00 am in New York on both sides of the March change", () => {
    expect(zonedInstant("2026-03-06", "09:00", NY)).toBe("2026-03-06T14:00:00.000Z");
    expect(zonedInstant("2026-03-09", "09:00", NY)).toBe("2026-03-09T13:00:00.000Z");
  });
  it("carries a skipped time forward and takes the first of a repeated one", () => {
    // 02:30 on 8 March never happens in New York; it is read as 03:30 EDT.
    expect(zonedInstant("2026-03-08", "02:30", NY)).toBe("2026-03-08T07:30:00.000Z");
    // 01:30 on 1 November happens twice; the first is EDT.
    expect(zonedInstant("2026-11-01", "01:30", NY)).toBe("2026-11-01T05:30:00.000Z");
  });
  it("handles a half-hour zone east of UTC and Saigon itself", () => {
    expect(zonedInstant("2026-11-18", "09:00", "Asia/Kolkata")).toBe("2026-11-18T03:30:00.000Z");
    expect(zonedInstant("2026-11-18", "09:00", "Asia/Ho_Chi_Minh")).toBe("2026-11-18T02:00:00.000Z");
  });
  it("refuses a malformed part or an unknown zone", () => {
    expect(zonedInstant("18 Nov", "09:00", NY)).toBeNull();
    expect(zonedInstant("2026-11-18", "9am", NY)).toBeNull();
    expect(zonedInstant("2026-11-18", "09:00", "Mars/Olympus")).toBeNull();
  });
});

describe("zonedClock", () => {
  it("is the inverse: the wall clock at an instant, with its weekday", () => {
    expect(zonedClock("2026-11-18T14:00:00.000Z", "America/New_York")).toEqual({ date: "2026-11-18", time: "09:00", weekday: 3, minute: 540 });
    // 02:00 UTC on Thursday is still Wednesday evening in New York.
    expect(zonedClock("2026-11-19T02:00:00.000Z", "America/New_York")).toEqual({ date: "2026-11-18", time: "21:00", weekday: 3, minute: 1260 });
    expect(zonedClock("2026-11-18T14:00:00.000Z", "Asia/Ho_Chi_Minh")).toMatchObject({ date: "2026-11-18", time: "21:00" });
  });
});

describe("zone and day words", () => {
  it("knows a zone, and names it the way people do", () => {
    expect(isTimeZone("America/New_York")).toBe(true);
    expect(isTimeZone("Mars/Olympus")).toBe(false);
    expect(isTimeZone(null)).toBe(false);
    expect(timeZoneLabel("America/New_York")).toBe("Eastern");
  });
  it("writes days and times without Intl's month spellings", () => {
    expect(shortDay("2026-12-04")).toBe("Fri 4 Dec");
    expect(shortDay("2026-09-07")).toBe("Mon 7 Sep");
    expect(monthDay("2026-11-17")).toBe("Nov 17");
    expect(dayMonth("2026-09-15")).toBe("15 Sep");
    expect(clockLabel("09:00")).toBe("9:00 am");
    expect(clockLabel("21:30")).toBe("9:30 pm");
    expect(clockLabel("00:15")).toBe("12:15 am");
    expect(clockLabel("12:00")).toBe("12:00 pm");
  });
});
