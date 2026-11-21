import { describe, expect, it } from "vitest";
import { inClientWorkingDay, inQuietHours, inWorkingHours, nextClientWorkingStart, nextWorkingMorning, previousWorkingEvening, workingDayBefore, workingDayStartMinute } from "./business-hours";

// Z.7: quiet hours are read in Saigon time (UTC+7, no daylight saving), and
// the working window is weekdays 09:00 up to 18:00. Every instant below is
// written in UTC with its Saigon reading beside it, so a boundary is exact.

const at = (iso: string) => new Date(iso);

describe("the working window", () => {
  it("opens at 09:00 Saigon time on a weekday, not a minute before", () => {
    // Wednesday 2026-10-14, 08:59 and 09:00 in Saigon.
    expect(inQuietHours(at("2026-10-14T01:59:00Z"))).toBe(true);
    expect(inWorkingHours(at("2026-10-14T02:00:00Z"))).toBe(true);
  });

  it("closes at 18:00 Saigon time: 17:59 is working, 18:00 is quiet", () => {
    expect(inWorkingHours(at("2026-10-14T10:59:00Z"))).toBe(true);
    expect(inQuietHours(at("2026-10-14T11:00:00Z"))).toBe(true);
  });

  it("reads the Saigon day, not the UTC day: 23:00 UTC on Tuesday is 06:00 Wednesday, still quiet", () => {
    expect(inQuietHours(at("2026-10-13T23:00:00Z"))).toBe(true);
    // 02:00 UTC Monday is 09:00 Monday in Saigon.
    expect(inWorkingHours(at("2026-10-12T02:00:00Z"))).toBe(true);
  });

  it("keeps the whole weekend quiet, midday included", () => {
    // Saturday 2026-10-17 and Sunday 2026-10-18, 12:00 Saigon time.
    expect(inQuietHours(at("2026-10-17T05:00:00Z"))).toBe(true);
    expect(inQuietHours(at("2026-10-18T05:00:00Z"))).toBe(true);
    // 23:30 UTC Sunday is 06:30 Monday in Saigon: Monday, but before the window.
    expect(inQuietHours(at("2026-10-18T23:30:00Z"))).toBe(true);
  });
});

describe("the next working morning", () => {
  it("is 09:00 the same day for a notice before the window opens", () => {
    expect(nextWorkingMorning(at("2026-10-13T23:00:00Z")).toISOString()).toBe("2026-10-14T02:00:00.000Z");
  });

  it("is the next day's 09:00 for a weekday evening, and strictly after 09:00 on the dot", () => {
    expect(nextWorkingMorning(at("2026-10-14T11:00:00Z")).toISOString()).toBe("2026-10-15T02:00:00.000Z");
    expect(nextWorkingMorning(at("2026-10-14T02:00:00Z")).toISOString()).toBe("2026-10-15T02:00:00.000Z");
  });

  it("skips the weekend: Friday 18:00 and all of Saturday and Sunday wait for Monday", () => {
    const monday = "2026-10-19T02:00:00.000Z";
    expect(nextWorkingMorning(at("2026-10-16T11:00:00Z")).toISOString()).toBe(monday);
    expect(nextWorkingMorning(at("2026-10-17T05:00:00Z")).toISOString()).toBe(monday);
    expect(nextWorkingMorning(at("2026-10-18T16:59:00Z")).toISOString()).toBe(monday);
  });
});

// Z.20: a reminder whose moment falls outside the window goes before the
// window's last close instead, because holding it would pass the deadline.
describe("the previous working evening", () => {
  it("is 18:00 the same day for a weekday evening, and 18:00 on the dot is itself", () => {
    expect(previousWorkingEvening(at("2026-10-14T13:00:00Z")).toISOString()).toBe("2026-10-14T11:00:00.000Z");
    expect(previousWorkingEvening(at("2026-10-14T11:00:00Z")).toISOString()).toBe("2026-10-14T11:00:00.000Z");
  });

  it("is the day before's 18:00 for a morning or an instant inside the window", () => {
    expect(previousWorkingEvening(at("2026-10-15T01:00:00Z")).toISOString()).toBe("2026-10-14T11:00:00.000Z");
    expect(previousWorkingEvening(at("2026-10-14T10:59:00Z")).toISOString()).toBe("2026-10-13T11:00:00.000Z");
  });

  it("skips the weekend back to Friday 18:00", () => {
    const friday = "2026-10-16T11:00:00.000Z";
    expect(previousWorkingEvening(at("2026-10-17T05:00:00Z")).toISOString()).toBe(friday);
    expect(previousWorkingEvening(at("2026-10-19T01:00:00Z")).toISOString()).toBe(friday);
  });
});

describe("a time on the working day before", () => {
  const TEN = 10 * 60;

  it("is the day before, for a day after a weekday", () => {
    // Wednesday 2026-10-14 17:00 Saigon: Tuesday 10:00 Saigon is 03:00 UTC.
    expect(workingDayBefore(at("2026-10-14T10:00:00Z"), TEN).toISOString()).toBe("2026-10-13T03:00:00.000Z");
  });

  it("reads the day in Saigon time, not UTC: 00:30 Saigon on a Tuesday is still Tuesday", () => {
    // 2026-10-12T17:30Z is Tuesday 00:30 Saigon, so the day before is Monday.
    expect(workingDayBefore(at("2026-10-12T17:30:00Z"), TEN).toISOString()).toBe("2026-10-12T03:00:00.000Z");
  });

  it("skips the weekend back to Friday, from a Monday, a Saturday or a Sunday", () => {
    const friday = "2026-10-16T03:00:00.000Z";
    expect(workingDayBefore(at("2026-10-19T03:00:00Z"), TEN).toISOString()).toBe(friday);
    expect(workingDayBefore(at("2026-10-17T05:00:00Z"), TEN).toISOString()).toBe(friday);
    expect(workingDayBefore(at("2026-10-18T05:00:00Z"), TEN).toISOString()).toBe(friday);
  });
});

// CR.5.4: a client's working day, read in the client's own zone. New York is
// UTC-5 after 1 November 2026 (EST) and UTC-4 before it (EDT), so 9:00 am
// there is 14:00 UTC in November and 13:00 UTC in October.
describe("a client's working day", () => {
  const NY = { timeZone: "America/New_York", startMinute: 9 * 60 };

  it("runs from the client's start for nine hours, on its weekdays", () => {
    expect(inClientWorkingDay(at("2026-11-18T14:00:00Z"), NY)).toBe(true); // Wed 09:00
    expect(inClientWorkingDay(at("2026-11-18T13:59:00Z"), NY)).toBe(false); // Wed 08:59
    expect(inClientWorkingDay(at("2026-11-18T22:59:00Z"), NY)).toBe(true); // Wed 17:59
    expect(inClientWorkingDay(at("2026-11-18T23:00:00Z"), NY)).toBe(false); // Wed 18:00
    expect(inClientWorkingDay(at("2026-11-21T15:00:00Z"), NY)).toBe(false); // Sat 10:00
  });

  it("leaves the Saigon window as it was: a New York morning is a Saigon night", () => {
    expect(inClientWorkingDay(at("2026-11-18T14:00:00Z"), NY)).toBe(true);
    expect(inWorkingHours(at("2026-11-18T14:00:00Z"))).toBe(false);
  });

  it("follows a start that runs past midnight into the next calendar day", () => {
    const late = { timeZone: "America/New_York", startMinute: 16 * 60 };
    // 00:30 on Wednesday in New York is inside Tuesday's 16:00 to 01:00.
    expect(inClientWorkingDay(at("2026-11-18T05:30:00Z"), late)).toBe(true);
    expect(inClientWorkingDay(at("2026-11-18T06:00:00Z"), late)).toBe(false);
  });

  it("names the next start: later today, tomorrow, or Monday", () => {
    expect(nextClientWorkingStart(at("2026-11-18T13:00:00Z"), NY).toISOString()).toBe("2026-11-18T14:00:00.000Z");
    expect(nextClientWorkingStart(at("2026-11-18T23:30:00Z"), NY).toISOString()).toBe("2026-11-19T14:00:00.000Z");
    expect(nextClientWorkingStart(at("2026-11-20T23:30:00Z"), NY).toISOString()).toBe("2026-11-23T14:00:00.000Z");
    // Strictly after: at the start itself, the next one is the following day's.
    expect(nextClientWorkingStart(at("2026-11-18T14:00:00Z"), NY).toISOString()).toBe("2026-11-19T14:00:00.000Z");
  });

  it("keeps 9:00 am across the clocks going back", () => {
    // Friday 30 October 18:00 EDT; the next start is Monday 2 November 09:00 EST.
    expect(nextClientWorkingStart(at("2026-10-30T22:00:00Z"), NY).toISOString()).toBe("2026-11-02T14:00:00.000Z");
  });

  it("reads the stored start, and 09:00 when the client has none", () => {
    expect(workingDayStartMinute("08:30:00")).toBe(510);
    expect(workingDayStartMinute("10:00")).toBe(600);
    expect(workingDayStartMinute(null)).toBe(540);
  });
});
