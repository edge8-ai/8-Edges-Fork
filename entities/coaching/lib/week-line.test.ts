import { describe, expect, it } from "vitest";
import { weekLine, type WeekLineInput } from "./week-line";

// 2026-09-17 is a Thursday; its ISO week runs Monday 2026-09-14 to Sunday
// 2026-09-20. Every case below is anchored on it so "this week" has a fixed,
// readable meaning in the expectations.
const TODAY = "2026-09-17";

function row(over: Partial<WeekLineInput> = {}): WeekLineInput {
  return { nextOneOnOneOn: null, proposedOn: null, proposedBy: null, kept: 0, ...over };
}

describe("weekLine", () => {
  it("says so when the roster is empty", () => {
    expect(weekLine([], TODAY)).toBe("Nobody on your roster yet");
  });

  it("reads all three clauses in order", () => {
    const rows = [
      row({ nextOneOnOneOn: "2026-09-18", kept: 2 }),
      row({ nextOneOnOneOn: "2026-09-20", kept: 1 }),
      row({ proposedOn: "2026-09-24", proposedBy: "member" }),
    ];
    expect(weekLine(rows, TODAY)).toBe(
      "2 conversations booked this week · 1 date waiting on you · 3 commitments kept since the last round",
    );
  });

  it("leaves out a clause that would read zero", () => {
    expect(weekLine([row({ kept: 4 })], TODAY)).toBe("4 commitments kept since the last round");
    expect(weekLine([row({ nextOneOnOneOn: "2026-09-14" })], TODAY)).toBe("1 conversation booked this week");
  });

  it("uses the singular for one of anything", () => {
    const rows = [row({ nextOneOnOneOn: "2026-09-17", kept: 1, proposedOn: "2026-10-01", proposedBy: "member" })];
    expect(weekLine(rows, TODAY)).toBe(
      "1 conversation booked this week · 1 date waiting on you · 1 commitment kept since the last round",
    );
  });

  it("counts both edges of the ISO week and nothing outside it", () => {
    const rows = [
      row({ nextOneOnOneOn: "2026-09-14" }), // Monday, the week's first day
      row({ nextOneOnOneOn: "2026-09-20" }), // Sunday, the week's last day
      row({ nextOneOnOneOn: "2026-09-13" }), // the Sunday before
      row({ nextOneOnOneOn: "2026-09-21" }), // the Monday after
      row({ nextOneOnOneOn: null }),
    ];
    expect(weekLine(rows, TODAY)).toBe("2 conversations booked this week");
  });

  it("only counts a date the member proposed, not one the coach put forward", () => {
    const rows = [
      row({ proposedOn: "2026-09-24", proposedBy: "coach" }),
      row({ proposedOn: "2026-09-25", proposedBy: "member" }),
    ];
    expect(weekLine(rows, TODAY)).toBe("1 date waiting on you");
  });

  it("sums kept commitments across the roster without naming anyone", () => {
    const rows = [row({ kept: 3 }), row({ kept: 0 }), row({ kept: 2 })];
    expect(weekLine(rows, TODAY)).toBe("5 commitments kept since the last round");
  });

  it("still says something when a non-empty roster has nothing on this week", () => {
    expect(weekLine([row(), row()], TODAY)).toBe("Nothing booked this week, and nothing waiting on you");
  });
});
