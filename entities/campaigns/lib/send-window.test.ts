import { describe, it, expect } from "vitest";
import { describeWindow, nextSendInstant, TUESDAY_FRIDAY_EIGHT, zoneFor } from "./send-window";

describe("zoneFor", () => {
  it("trusts a recorded IANA zone, then a UTC offset, then city, then country, then the default", () => {
    expect(zoneFor({ timezone: "Australia/Perth", city: "Sydney", country: "Vietnam" })).toEqual({ zone: "Australia/Perth", source: "timezone" });
    expect(zoneFor({ timezone: "UTC+07:00 (Thailand, Vietnam)" })).toEqual({ zone: "Asia/Ho_Chi_Minh", source: "timezone" });
    expect(zoneFor({ timezone: "whenever", city: "Dallas", country: "United States" })).toEqual({ zone: "America/Chicago", source: "city" });
    expect(zoneFor({ country: "United States" })).toEqual({ zone: "America/New_York", source: "country" });
    expect(zoneFor({ country: "Australia", city: "O'Connor" })).toEqual({ zone: "Australia/Perth", source: "city" });
    expect(zoneFor({})).toEqual({ zone: "Asia/Ho_Chi_Minh", source: "default" });
  });
});

describe("nextSendInstant", () => {
  // Monday 7 September 2026, 00:00 UTC.
  const from = new Date("2026-09-07T00:00:00Z");

  it("finds the next Tuesday or Friday 08:00 in each zone as a UTC instant", () => {
    expect(nextSendInstant(TUESDAY_FRIDAY_EIGHT, "Asia/Ho_Chi_Minh", from).toISOString()).toBe("2026-09-08T01:00:00.000Z");
    expect(nextSendInstant(TUESDAY_FRIDAY_EIGHT, "Australia/Sydney", from).toISOString()).toBe("2026-09-07T22:00:00.000Z");
    expect(nextSendInstant(TUESDAY_FRIDAY_EIGHT, "America/New_York", from).toISOString()).toBe("2026-09-08T12:00:00.000Z");
  });

  it("takes Friday when Tuesday's window has already passed", () => {
    // Tuesday 8 September 09:00 Ho Chi Minh (02:00 UTC): the next one is Friday.
    const late = new Date("2026-09-08T02:00:00Z");
    expect(nextSendInstant(TUESDAY_FRIDAY_EIGHT, "Asia/Ho_Chi_Minh", late).toISOString()).toBe("2026-09-11T01:00:00.000Z");
  });

  it("still reads a window saved with a single weekday", () => {
    expect(nextSendInstant({ weekday: 2, hour: 8 }, "Asia/Ho_Chi_Minh", new Date("2026-09-08T02:00:00Z")).toISOString()).toBe("2026-09-15T01:00:00.000Z");
  });

  it("re-reads the offset across a daylight-saving change", () => {
    // Sydney enters DST on 4 October 2026: 08:00 local becomes 21:00 UTC the day before.
    const beforeShift = new Date("2026-10-03T00:00:00Z");
    expect(nextSendInstant(TUESDAY_FRIDAY_EIGHT, "Australia/Sydney", beforeShift).toISOString()).toBe("2026-10-05T21:00:00.000Z");
  });
});

describe("describeWindow", () => {
  it("names both days", () => {
    expect(describeWindow(TUESDAY_FRIDAY_EIGHT)).toBe("Tuesday and Friday at 08:00 in each contact's time zone");
  });
});
