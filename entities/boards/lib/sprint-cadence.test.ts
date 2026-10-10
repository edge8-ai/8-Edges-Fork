import { describe, expect, it } from "vitest";
import { nextSprintName, planningDayOnOrAfter, sprintCovering, sprintDatesRefusal, sprintWeek, sprintWindow, weekShort, weekWindow, weeklySprintChat } from "./sprint-cadence";

// The arithmetic the Tuesday routine relies on: which day it plans for, the
// week that day opens, whether a board already has that week covered, and the
// name that continues the board's own count.

describe("weeklySprintChat", () => {
  it("reads the chat key off the board's metadata and ignores anything else", () => {
    expect(weeklySprintChat({ metadata: { weekly_sprints: "eo" } })).toBe("eo");
    expect(weeklySprintChat({ metadata: { weekly_sprints: "slack" } })).toBeNull();
    expect(weeklySprintChat({ metadata: {} })).toBeNull();
    expect(weeklySprintChat({ metadata: null })).toBeNull();
  });
});

describe("planningDayOnOrAfter", () => {
  it("is the day itself on a Tuesday and the coming Tuesday otherwise", () => {
    expect(planningDayOnOrAfter("2026-09-22")).toBe("2026-09-22"); // Tuesday
    expect(planningDayOnOrAfter("2026-09-16")).toBe("2026-09-22"); // Wednesday
    expect(planningDayOnOrAfter("2026-09-21")).toBe("2026-09-22"); // Monday
  });

  it("opens the sprint the next day and closes it a week after the meeting", () => {
    expect(sprintWindow("2026-09-22")).toEqual({ startsOn: "2026-09-23", endsOn: "2026-09-29" });
  });
});

describe("sprintCovering", () => {
  const w = { startsOn: "2026-09-23", endsOn: "2026-09-29" };

  it("finds a sprint that overlaps any day of the window, whatever its status", () => {
    expect(sprintCovering([{ starts_on: "2026-09-16", ends_on: "2026-09-30" }], w)).not.toBeNull();
    expect(sprintCovering([{ starts_on: "2026-09-23", ends_on: "2026-09-29" }], w)).not.toBeNull();
    expect(sprintCovering([{ starts_on: "2026-09-29", ends_on: "2026-10-05" }], w)).not.toBeNull();
  });

  it("ignores the sprint that ends the day before, and sprints with no dates", () => {
    expect(sprintCovering([{ starts_on: "2026-09-16", ends_on: "2026-09-22" }], w)).toBeNull();
    expect(sprintCovering([{ starts_on: null, ends_on: null }], w)).toBeNull();
  });
});

describe("nextSprintName", () => {
  it("counts one past the highest numbered sprint and keeps its prefix", () => {
    expect(nextSprintName([{ name: "Y26 Sprint 36" }, { name: "Y26 Sprint 35" }], null)).toBe("Y26 Sprint 37");
    expect(nextSprintName([{ name: "Sprint 2 - Polish" }, { name: "Sprint 1 - Foundation" }], "Ship It")).toBe("Sprint 3 - Ship It");
  });

  it("starts at one on a board whose sprints were never numbered", () => {
    expect(nextSprintName([{ name: "First Data Sync" }], null)).toBe("Sprint 1");
    expect(nextSprintName([], "Kickoff")).toBe("Sprint 1 - Kickoff");
  });
});

describe("sprint weeks (SW-01)", () => {
  it("keys a sprint on the ISO week of its first day", () => {
    expect(sprintWeek("2026-09-16")).toBe("2026-W38");
    expect(sprintWeek("2026-09-23")).toBe("2026-W39");
    // The year's first days belong to the previous ISO year when they fall before its first Thursday.
    expect(sprintWeek("2027-01-01")).toBe("2026-W53");
    expect(sprintWeek("2026-01-01")).toBe("2026-W01");
  });

  it("turns a week key back into its Wednesday-to-Tuesday window", () => {
    expect(weekWindow("2026-W38")).toEqual({ startsOn: "2026-09-16", endsOn: "2026-09-22" });
    expect(weekWindow("2026-W39")).toEqual({ startsOn: "2026-09-23", endsOn: "2026-09-29" });
    expect(weekWindow("nonsense")).toBeNull();
  });

  it("shows the short form", () => {
    expect(weekShort("2026-W38")).toBe("W38");
  });
});

describe("sprintDatesRefusal (W.146)", () => {
  const today = "2026-09-27";

  it("refuses the 1972 start that put a week in 1972 on the planning page", () => {
    expect(sprintDatesRefusal("1972-09-01", "1972-09-08", today)).toBe("1972-09-01 is more than a year from today; check the year.");
  });

  it("allows a date exactly a year either side of today, and refuses the day beyond", () => {
    expect(sprintDatesRefusal("2025-09-26", undefined, today)).toBeNull();
    expect(sprintDatesRefusal("2027-09-28", undefined, today)).toBeNull();
    expect(sprintDatesRefusal("2027-09-29", undefined, today)).not.toBeNull();
  });

  it("refuses a day the month does not have, and a string that is not a date", () => {
    expect(sprintDatesRefusal("2026-02-31", undefined, today)).toBe("2026-02-31 is not a date.");
    expect(sprintDatesRefusal("1/9/26", undefined, today)).toBe("1/9/26 is not a date.");
  });

  it("refuses an end before the start, and lets a sprint have no dates at all", () => {
    expect(sprintDatesRefusal("2026-09-30", "2026-09-29", today)).toBe("A sprint cannot end before it starts.");
    expect(sprintDatesRefusal(undefined, undefined, today)).toBeNull();
    expect(sprintDatesRefusal("2026-09-30", "2026-10-06", today)).toBeNull();
  });
});
