import { describe, expect, it } from "vitest";
import { inQuietHours, inWorkingHours, nextWorkingMorning } from "./business-hours";

// Z.7: quiet hours are read in Saigon time (UTC+7, no daylight saving), and
// the working window is weekdays 08:30 up to 18:00. Every instant below is
// written in UTC with its Saigon reading beside it, so a boundary is exact.

const at = (iso: string) => new Date(iso);

describe("the working window", () => {
  it("opens at 08:30 Saigon time on a weekday, not a minute before", () => {
    // Wednesday 2026-10-14, 08:29 and 08:30 in Saigon.
    expect(inQuietHours(at("2026-10-14T01:29:00Z"))).toBe(true);
    expect(inWorkingHours(at("2026-10-14T01:30:00Z"))).toBe(true);
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
  it("is 08:30 the same day for a notice before the window opens", () => {
    expect(nextWorkingMorning(at("2026-10-13T23:00:00Z")).toISOString()).toBe("2026-10-14T01:30:00.000Z");
  });

  it("is the next day's 08:30 for a weekday evening, and strictly after 08:30 on the dot", () => {
    expect(nextWorkingMorning(at("2026-10-14T11:00:00Z")).toISOString()).toBe("2026-10-15T01:30:00.000Z");
    expect(nextWorkingMorning(at("2026-10-14T01:30:00Z")).toISOString()).toBe("2026-10-15T01:30:00.000Z");
  });

  it("skips the weekend: Friday 18:00 and all of Saturday and Sunday wait for Monday", () => {
    const monday = "2026-10-19T01:30:00.000Z";
    expect(nextWorkingMorning(at("2026-10-16T11:00:00Z")).toISOString()).toBe(monday);
    expect(nextWorkingMorning(at("2026-10-17T05:00:00Z")).toISOString()).toBe(monday);
    expect(nextWorkingMorning(at("2026-10-18T16:59:00Z")).toISOString()).toBe(monday);
  });
});
