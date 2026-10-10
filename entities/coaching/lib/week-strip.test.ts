import { describe, expect, it } from "vitest";
import { buildWeekStrip, mondayOf, type WeekRow } from "./week-strip";

// 2026-10-07 is a Wednesday.
const TODAY = "2026-10-07";

const row = (o: Partial<WeekRow>): WeekRow => ({
  profileId: "p",
  name: "Coachee One",
  nextOneOnOneOn: null,
  nextStartsAt: null,
  proposedOn: null,
  proposedBy: null,
  heldThisWeek: [],
  ...o,
});

describe("mondayOf", () => {
  it("finds the Monday of the week, Sunday included", () => {
    expect(mondayOf("2026-10-07")).toBe("2026-10-05");
    expect(mondayOf("2026-10-05")).toBe("2026-10-05");
    expect(mondayOf("2026-10-11")).toBe("2026-10-05");
  });
});

describe("buildWeekStrip", () => {
  it("lays Monday to Friday out and marks today", () => {
    const days = buildWeekStrip([], TODAY);
    expect(days.map((d) => d.iso)).toEqual(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"]);
    expect(days.filter((d) => d.isToday).map((d) => d.iso)).toEqual([TODAY]);
  });

  it("puts held, booked and proposed sessions on their days", () => {
    const days = buildWeekStrip(
      [
        row({ profileId: "a", name: "A", heldThisWeek: [{ day: "2026-10-06", format: "call" }] }),
        row({ profileId: "b", name: "B", nextOneOnOneOn: "2026-10-08", nextStartsAt: "10:00" }),
        row({ profileId: "c", name: "C", proposedOn: "2026-10-09", proposedBy: "member" }),
      ],
      TODAY,
    );
    expect(days[1].items).toEqual([expect.objectContaining({ name: "A", kind: "held", note: "Done · Call" })]);
    expect(days[3].items).toEqual([expect.objectContaining({ name: "B", kind: "booked", time: "10:00" })]);
    expect(days[4].items).toEqual([expect.objectContaining({ name: "C", kind: "proposed" })]);
  });

  it("leaves out a day only the coach proposed, and anything outside the week", () => {
    const days = buildWeekStrip(
      [row({ proposedOn: "2026-10-08", proposedBy: "coach", nextOneOnOneOn: "2026-10-14" })],
      TODAY,
    );
    expect(days.flatMap((d) => d.items)).toEqual([]);
  });
});
