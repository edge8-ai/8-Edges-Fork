import { describe, expect, it } from "vitest";
import { Rhythm, occurrencesFor, rhythmLabel, sessionMinutes } from "./plan-rhythm";

// The English group: Tuesdays and Thursdays, 14:00 to 15:15 Vietnam time.
const english = Rhythm.parse({ weekdays: [4, 2], start: "14:00", end: "15:15" });

describe("occurrencesFor", () => {
  it("gives every Tuesday and Thursday from the start to the end date, both inclusive", () => {
    // 2026-10-13 is a Tuesday; 2026-10-29 is a Thursday.
    const dates = occurrencesFor(english, "2026-10-13", "2026-10-29").map((o) => o.date);
    expect(dates).toEqual(["2026-10-13", "2026-10-15", "2026-10-20", "2026-10-22", "2026-10-27", "2026-10-29"]);
  });

  it("places each session at 14:00 Vietnam time for 75 minutes", () => {
    const [first] = occurrencesFor(english, "2026-10-13", "2026-10-13");
    expect(first).toEqual({ date: "2026-10-13", startsAt: "2026-10-13T07:00:00.000Z", endsAt: "2026-10-13T08:15:00.000Z" });
    expect(sessionMinutes(english)).toBe(75);
  });

  it("gives nothing when the end is before the start, or no weekday falls in the range", () => {
    expect(occurrencesFor(english, "2026-10-20", "2026-10-13")).toEqual([]);
    // Friday to Monday holds no Tuesday or Thursday.
    expect(occurrencesFor(english, "2026-10-16", "2026-10-19")).toEqual([]);
  });

  it("is unmoved by the end of the year, which has no DST in Vietnam", () => {
    const dates = occurrencesFor(english, "2026-12-29", "2027-01-07").map((o) => o.date);
    expect(dates).toEqual(["2026-12-29", "2026-12-31", "2027-01-05", "2027-01-07"]);
    const last = occurrencesFor(english, "2027-01-07", "2027-01-07")[0];
    expect(last?.startsAt).toBe("2027-01-07T07:00:00.000Z");
  });
});

describe("Rhythm", () => {
  it("sorts and dedupes weekdays, and refuses a session that ends before it starts", () => {
    expect(english.weekdays).toEqual([2, 4]);
    expect(Rhythm.parse({ weekdays: [2, 2, 4], start: "09:00", end: "10:00" }).weekdays).toEqual([2, 4]);
    expect(Rhythm.safeParse({ weekdays: [2], start: "15:00", end: "14:00" }).success).toBe(false);
    expect(Rhythm.safeParse({ weekdays: [], start: "14:00", end: "15:00" }).success).toBe(false);
  });

  it("reads back as the page says it", () => {
    expect(rhythmLabel(english)).toBe("Tue, Thu 14:00–15:15");
  });
});
