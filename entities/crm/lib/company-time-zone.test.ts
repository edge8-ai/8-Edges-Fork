import { describe, expect, it } from "vitest";
import { clientDayFields, timeZoneOptions } from "./company-time-zone";

// CR.5.1. A company's time zone and working-day start decide when a client-review
// email may be sent, so a bad value must be refused before it reaches the column.
describe("timeZoneOptions", () => {
  it("lists real IANA names", () => {
    const zones = timeZoneOptions();
    expect(zones).toContain("Australia/Melbourne");
    expect(zones.length).toBeGreaterThan(100);
  });
});

describe("clientDayFields", () => {
  it("accepts an IANA zone and a start time", () => {
    expect(clientDayFields({ time_zone: "America/Chicago", working_day_start: "09:00" })).toEqual({
      ok: true,
      patch: { time_zone: "America/Chicago", working_day_start: "09:00" },
    });
  });

  it("maps an empty value to null, meaning not set", () => {
    expect(clientDayFields({ time_zone: "", working_day_start: " " })).toEqual({
      ok: true,
      patch: { time_zone: null, working_day_start: null },
    });
  });

  it("leaves a field out of the patch when it is not named", () => {
    expect(clientDayFields({ time_zone: "Asia/Ho_Chi_Minh" })).toEqual({ ok: true, patch: { time_zone: "Asia/Ho_Chi_Minh" } });
    expect(clientDayFields({})).toEqual({ ok: true, patch: {} });
  });

  it("refuses a name that is not a time zone", () => {
    const r = clientDayFields({ time_zone: "Mars/Olympus" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/time zone/i);
  });

  it("refuses a start that is not a time of day", () => {
    for (const bad of ["25:00", "9am", "09:60", "abc"]) {
      const r = clientDayFields({ time_zone: "Asia/Tokyo", working_day_start: bad });
      expect(r.ok).toBe(false);
    }
  });

  it("accepts a start with seconds, as a time input can give one", () => {
    expect(clientDayFields({ time_zone: "Asia/Tokyo", working_day_start: "09:30:00" })).toMatchObject({ ok: true });
  });

  it("refuses a start in the same patch that clears the zone", () => {
    expect(clientDayFields({ time_zone: "", working_day_start: "09:00" })).toEqual({
      ok: false,
      error: "Set a time zone before a working-day start: the start is a time in that zone.",
    });
  });
});
