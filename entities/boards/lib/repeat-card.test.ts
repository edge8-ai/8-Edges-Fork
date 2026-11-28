import { describe, expect, it } from "vitest";
import { addMonths, cardRepeat, nextDate, plannedSuccessor, repeatOf } from "./repeat-card";

const card = (metadata: Record<string, unknown>, due_date: string | null = null) => ({ metadata, due_date });

describe("cardRepeat (W.59)", () => {
  it("reads a weekly and a monthly repeat", () => {
    expect(cardRepeat(card({ repeat: { every: "week" } }))).toEqual({ every: "week", until: null });
    expect(cardRepeat(card({ repeat: { every: "month", until: "2026-12-31" } }))).toEqual({ every: "month", until: "2026-12-31" });
  });

  it("refuses a shape it cannot read, so a bad jsonb never creates a card nobody asked for", () => {
    for (const bad of [undefined, null, "week", 1, [], {}, { every: "day" }, { every: "week", until: "soon" }]) {
      const read = cardRepeat(card({ repeat: bad }));
      // A bad `until` drops to open-ended rather than dropping the repeat.
      if (bad && typeof bad === "object" && (bad as { every?: string }).every === "week") expect(read).toEqual({ every: "week", until: null });
      else expect(read).toBeNull();
    }
  });
});

describe("repeatOf", () => {
  it("names the card this one is the successor of", () => {
    expect(repeatOf(card({ repeat_of: "abc" }))).toBe("abc");
    expect(repeatOf(card({}))).toBeNull();
    expect(repeatOf(card({ repeat_of: 7 }))).toBeNull();
  });
});

describe("addMonths", () => {
  it("clamps to the end of a shorter month rather than rolling over", () => {
    // 31 January plus a month is the end of February, not 3 March.
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29"); // leap year
    expect(addMonths("2026-03-31", 1)).toBe("2026-04-30");
  });

  it("crosses a year boundary", () => {
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
  });
});

describe("nextDate", () => {
  it("steps a week or a month from the old due date", () => {
    expect(nextDate("2026-09-21", "week")).toBe("2026-09-28");
    expect(nextDate("2026-09-21", "month")).toBe("2026-10-21");
  });

  it("steps from the due date, not from today, so a late close does not make the series drift", () => {
    expect(nextDate("2026-09-07", "week")).toBe("2026-09-14");
  });
});

describe("plannedSuccessor", () => {
  const today = "2026-09-21";

  it("has nothing to plan for a card that does not repeat", () => {
    expect(plannedSuccessor(card({}), today)).toBeNull();
  });

  it("dates the successor forward from the old due date", () => {
    expect(plannedSuccessor(card({ repeat: { every: "week" } }, "2026-09-21"), today)).toEqual({
      repeat: { every: "week", until: null },
      dueDate: "2026-09-28",
    });
  });

  it("a repeat with no due date still repeats, undated", () => {
    // The work recurs whether or not anybody put a date on it.
    expect(plannedSuccessor(card({ repeat: { every: "week" } }), today)).toEqual({
      repeat: { every: "week", until: null },
      dueDate: null,
    });
  });

  it("stops when the next instance would fall after `until`", () => {
    expect(plannedSuccessor(card({ repeat: { every: "week", until: "2026-09-25" } }, "2026-09-21"), today)).toBeNull();
    // One day the other side of the line still runs.
    expect(plannedSuccessor(card({ repeat: { every: "week", until: "2026-09-28" } }, "2026-09-21"), today)).not.toBeNull();
  });

  it("measures `until` against today for an undated repeat", () => {
    expect(plannedSuccessor(card({ repeat: { every: "week", until: "2026-09-01" } }), today)).toBeNull();
    expect(plannedSuccessor(card({ repeat: { every: "week", until: "2026-12-01" } }), today)).not.toBeNull();
  });
});
