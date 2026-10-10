import { describe, expect, it } from "vitest";
import { isStatusWeek, statusTitle, statusWeek, weekStartsAt } from "./week";

// Z.12 risk 10: the week is the ISO week in Saigon time, and only a real ISO
// week is ever written (the table's check would admit W00 and W99).

describe("statusWeek", () => {
  it("is the ISO week of the moment in Saigon", () => {
    expect(statusWeek(new Date("2026-10-09T03:00:00Z"))).toBe("2026-W41"); // Friday 10:00 Saigon
    // Sunday 23:30 UTC is already Monday 06:30 in Saigon: the new week.
    expect(statusWeek(new Date("2026-10-11T23:30:00Z"))).toBe("2026-W42");
    // A Run now on a Monday opens the new week's rows, never last week's.
    expect(statusWeek(new Date("2026-10-12T02:00:00Z"))).toBe("2026-W42");
    expect(statusWeek(new Date("2026-12-31T20:00:00Z"))).toBe("2026-W53");
  });
});

describe("isStatusWeek", () => {
  it("admits only a week that exists", () => {
    expect(isStatusWeek("2026-W41")).toBe(true);
    expect(isStatusWeek("2026-W53")).toBe(true);
    expect(isStatusWeek("2026-W00")).toBe(false);
    expect(isStatusWeek("2026-W99")).toBe(false);
    expect(isStatusWeek("2025-W53")).toBe(false);
    expect(isStatusWeek("2026-41")).toBe(false);
  });
});

describe("the week's names", () => {
  it("starts at midnight Monday in Saigon and is titled by that Monday", () => {
    expect(weekStartsAt("2026-W41")).toBe("2026-10-04T17:00:00.000Z");
    expect(statusTitle("2026-W41")).toBe("Weekly status, week of 5 October");
  });
});
