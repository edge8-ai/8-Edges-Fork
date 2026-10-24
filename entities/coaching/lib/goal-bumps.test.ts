import { describe, expect, it } from "vitest";
import { bumpsCaption, bumpsThisQuarter, goalMoveSince, lastBumpCaption, quarterStartISO } from "./goal-bumps";

describe("quarterStartISO", () => {
  it("returns the first day of the calendar quarter", () => {
    expect(quarterStartISO("2026-01-04")).toBe("2026-01-01");
    expect(quarterStartISO("2026-05-31")).toBe("2026-04-01");
    expect(quarterStartISO("2026-09-17")).toBe("2026-07-01");
    expect(quarterStartISO("2026-12-31")).toBe("2026-10-01");
  });
});

describe("bumpsThisQuarter", () => {
  const today = "2026-09-17";

  it("counts only the rows from this quarter", () => {
    const rows = [
      { changed_at: "2026-06-30T23:59:00.000Z" },
      { changed_at: "2026-07-01T00:00:00.000Z" },
      { changed_at: "2026-08-12T09:30:00.000Z" },
      { changed_at: "2026-09-17T01:00:00.000Z" },
    ];
    expect(bumpsThisQuarter(rows, today)).toBe(3);
  });

  it("is zero with no rows", () => {
    expect(bumpsThisQuarter([], today)).toBe(0);
  });

  it("ignores a row that carries no timestamp", () => {
    expect(bumpsThisQuarter([{ changed_at: null }, { changed_at: "2026-09-01T00:00:00.000Z" }], today)).toBe(1);
  });
});

describe("bumpsCaption", () => {
  it("says nothing at zero, so an untouched goal is never scolded", () => {
    expect(bumpsCaption(0)).toBeNull();
    expect(bumpsCaption(-1)).toBeNull();
  });

  it("reads as English at one and above", () => {
    expect(bumpsCaption(1)).toBe("Adjusted once this quarter");
    expect(bumpsCaption(4)).toBe("Adjusted 4 times this quarter");
  });
});

describe("lastBumpCaption", () => {
  const today = "2026-09-17"; // a Thursday

  it("says nothing when the number has never been bumped", () => {
    expect(lastBumpCaption(null, today)).toBeNull();
    expect(lastBumpCaption("not-a-date", today)).toBeNull();
  });

  it("names today and yesterday in words", () => {
    expect(lastBumpCaption("2026-09-17T08:00:00.000Z", today)).toBe("bumped today");
    expect(lastBumpCaption("2026-09-16T08:00:00.000Z", today)).toBe("bumped yesterday");
  });

  it("names the weekday inside the last week", () => {
    expect(lastBumpCaption("2026-09-14T08:00:00.000Z", today)).toBe("bumped Monday");
  });

  it("falls back to a date once a weekday would be ambiguous", () => {
    expect(lastBumpCaption("2026-09-01T08:00:00.000Z", today)).toBe("bumped 1 Sept");
  });
});

describe("goalMoveSince — the goal's move since the last 1-1", () => {
  const row = (at: string, before: number | null, after: number) => ({
    changed_at: `${at}T09:00:00Z`,
    old_data: { current_value: before },
    new_data: { current_value: after },
  });
  it("takes the value before the first bump and after the last, whatever the row order", () => {
    const rows = [row("2026-09-16", 110, 119), row("2026-09-14", 100, 110)];
    expect(goalMoveSince(rows, "2026-09-12")).toEqual({ before: 100, after: 119 });
  });
  it("says nothing when no bump fell after the meeting", () => {
    expect(goalMoveSince([row("2026-09-10", 90, 100)], "2026-09-12")).toBeNull();
    expect(goalMoveSince([], "2026-09-12")).toBeNull();
  });
  it("counts a bump on the meeting day itself as before the window", () => {
    expect(goalMoveSince([row("2026-09-12", 90, 100)], "2026-09-12")).toBeNull();
  });
  it("treats a missing old value as starting from zero", () => {
    expect(goalMoveSince([row("2026-09-14", null, 40)], "2026-09-12")).toEqual({ before: 0, after: 40 });
  });
});
