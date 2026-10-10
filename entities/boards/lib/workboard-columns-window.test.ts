import { describe, expect, it } from "vitest";
import {
  activeSprintIds,
  activeSprintStart,
  businessDaysBack,
  cardsDrawnOnBoard,
  doneWindowNote,
  doneWindowStart,
  DONE_RECENT_DAYS,
  DONE_WINDOW_FALLBACK_DAYS,
  groupDoneCards,
  orderTodoCards,
  TODO_DUE_SOON_DAYS,
} from "./workboard-columns-window";

// 2026-09-21 is a Monday, which is the day the CEO reported both columns.
const MONDAY = "2026-09-21";

describe("activeSprintStart", () => {
  it("takes the latest active sprint that has already started", () => {
    const start = activeSprintStart(
      [
        { status: "active", starts_on: "2026-09-14" },
        { status: "active", starts_on: "2026-09-21" },
        { status: "closed", starts_on: "2026-09-07" },
      ],
      MONDAY,
    );
    expect(start).toBe("2026-09-21");
  });

  it("ignores a sprint that has not begun", () => {
    // The incident behind W.94: next week's sprint was opened as active, and
    // a window taken from it would have been ahead of today.
    const start = activeSprintStart(
      [
        { status: "active", starts_on: "2026-09-14" },
        { status: "active", starts_on: "2026-09-23" },
      ],
      MONDAY,
    );
    expect(start).toBe("2026-09-14");
  });

  it("is null when no active sprint has started", () => {
    expect(activeSprintStart([{ status: "closed", starts_on: "2026-09-07" }], MONDAY)).toBeNull();
    expect(activeSprintStart([], MONDAY)).toBeNull();
  });
});

describe("businessDaysBack", () => {
  it("counts the day itself as the first and skips weekends", () => {
    // Monday, seven business days: Mon Fri Thu Wed Tue Mon Fri -> 09-11.
    expect(businessDaysBack(MONDAY, 7)).toBe("2026-09-11");
    expect(businessDaysBack(MONDAY, 1)).toBe(MONDAY);
    expect(businessDaysBack(MONDAY, 2)).toBe("2026-09-18");
  });

  it("starts from the previous working day when asked on a weekend", () => {
    expect(businessDaysBack("2026-09-20", 1)).toBe("2026-09-18");
  });
});

describe("doneWindowStart", () => {
  it("is the active sprint's start when there is one", () => {
    expect(doneWindowStart([{ status: "active", starts_on: "2026-09-14" }], MONDAY)).toBe("2026-09-14");
  });

  it("falls back to the last seven business days when there is none", () => {
    expect(DONE_WINDOW_FALLBACK_DAYS).toBe(7);
    expect(doneWindowStart([], MONDAY)).toBe("2026-09-11");
  });
});

const doneColumnIds = new Set(["done"]);
const card = (id: string, columnId: string, completed_at: string | null) => ({ id, columnId, completed_at });

describe("cardsDrawnOnBoard", () => {
  it("leaves finished work from before the window off the board", () => {
    const drawn = cardsDrawnOnBoard(
      [
        card("this-week", "done", "2026-09-21T03:00:00Z"),
        card("last-month", "done", "2026-08-12T03:00:00Z"),
        card("open", "todo", null),
      ],
      { doneColumnIds, windowStart: "2026-09-14" },
    );
    expect(drawn.map((c) => c.id)).toEqual(["this-week", "open"]);
  });

  it("reads the completion day in the business timezone", () => {
    // 2026-09-13T18:00Z is 2026-09-14 01:00 in Saigon, so it is inside a
    // window that opens on the 14th. Slicing the ISO string would drop it.
    const drawn = cardsDrawnOnBoard([card("late", "done", "2026-09-13T18:00:00Z")], {
      doneColumnIds,
      windowStart: "2026-09-14",
    });
    expect(drawn.map((c) => c.id)).toEqual(["late"]);
  });

  it("never drops a finished card with no completion date", () => {
    const drawn = cardsDrawnOnBoard([card("undated", "done", null)], { doneColumnIds, windowStart: "2026-09-14" });
    expect(drawn.map((c) => c.id)).toEqual(["undated"]);
  });

  it("draws everything when the board is narrowed", () => {
    // A search or any filter passes no window: a card a search did not find
    // is exactly the failure this replaced the fold to avoid.
    const cards = [card("old", "done", "2026-01-02T03:00:00Z")];
    expect(cardsDrawnOnBoard(cards, { doneColumnIds, windowStart: null })).toEqual(cards);
  });

  it("draws everything under a grouping with no done column", () => {
    const cards = [card("old", "p1", "2026-01-02T03:00:00Z")];
    expect(cardsDrawnOnBoard(cards, { doneColumnIds: new Set<string>(), windowStart: "2026-09-14" })).toEqual(cards);
  });
});

describe("activeSprintIds", () => {
  it("holds the active sprints that have started", () => {
    const ids = activeSprintIds(
      [
        { id: "now", status: "active", starts_on: "2026-09-14" },
        { id: "next", status: "active", starts_on: "2026-09-23" },
        { id: "past", status: "closed", starts_on: "2026-09-07" },
      ],
      MONDAY,
    );
    expect([...ids]).toEqual(["now"]);
  });
});

const todo = (id: string, sprint_id: string | null, due_date: string | null) => ({ id, sprint_id, due_date });

describe("orderTodoCards", () => {
  const sprintIds = new Set(["now"]);

  it("puts the sprint first, then what is due soon, then the rest", () => {
    const groups = orderTodoCards(
      [
        todo("far", null, "2026-12-01"),
        todo("soon-late", null, "2026-10-02"),
        todo("committed", "now", "2026-11-30"),
        todo("undated", null, null),
        todo("soon-early", null, "2026-09-22"),
      ],
      { sprintIds, today: MONDAY },
    );
    expect(groups.map((g) => [g.key, g.cards.map((c) => c.id)])).toEqual([
      ["sprint", ["committed"]],
      ["soon", ["soon-early", "soon-late"]],
      ["backlog", ["far", "undated"]],
    ]);
  });

  it("counts a card in an active sprint once, whatever its due date", () => {
    const groups = orderTodoCards([todo("committed", "now", "2026-09-22")], { sprintIds, today: MONDAY });
    expect(groups).toEqual([{ key: "sprint", cards: [todo("committed", "now", "2026-09-22")] }]);
  });

  it("ignores a sprint id that is not active", () => {
    const groups = orderTodoCards([todo("stale", "past", null)], { sprintIds, today: MONDAY });
    expect(groups.map((g) => g.key)).toEqual(["backlog"]);
  });

  it("cuts 'due soon' at a fortnight", () => {
    expect(TODO_DUE_SOON_DAYS).toBe(14);
    const groups = orderTodoCards([todo("edge", null, "2026-10-05"), todo("past-edge", null, "2026-10-06")], {
      sprintIds,
      today: MONDAY,
    });
    expect(groups.map((g) => [g.key, g.cards.map((c) => c.id)])).toEqual([
      ["soon", ["edge"]],
      ["backlog", ["past-edge"]],
    ]);
  });

  it("drops empty groups, so a column with one kind of card gets no labels", () => {
    const groups = orderTodoCards([todo("a", null, null), todo("b", null, null)], { sprintIds, today: MONDAY });
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("backlog");
  });

  it("returns nothing for an empty column", () => {
    expect(orderTodoCards([], { sprintIds, today: MONDAY })).toEqual([]);
  });
});

// ─── Done across many boards (W.103.7) ────────────────────────────────────

const SPRINT = [{ status: "active", starts_on: "2026-09-14" }];

describe("doneWindowStart across many boards", () => {
  it("reaches back one day, whatever the sprints say", () => {
    expect(DONE_RECENT_DAYS).toBe(2);
    expect(doneWindowStart(SPRINT, MONDAY, "many")).toBe("2026-09-20");
  });

  it("counts CALENDAR days, so a Monday's yesterday is the Sunday", () => {
    // Agents ship at the weekend — 38 cards finished on a Saturday and 60 on
    // the Sunday — so a working-day window would open Monday's board on a
    // Friday and claim the weekend had produced nothing.
    expect(doneWindowStart([], MONDAY, "many")).toBe("2026-09-20");
    expect(businessDaysBack(MONDAY, 2)).toBe("2026-09-18");
  });

  it("leaves a single board on its sprint", () => {
    expect(doneWindowStart(SPRINT, MONDAY, "single")).toBe("2026-09-14");
    expect(doneWindowStart(SPRINT, MONDAY)).toBe("2026-09-14");
    expect(doneWindowStart([], MONDAY, "single")).toBe("2026-09-11");
  });
});

describe("doneWindowNote", () => {
  it("says what each scope is showing", () => {
    expect(doneWindowNote(SPRINT, MONDAY, "many")).toBe("today & yesterday");
    expect(doneWindowNote(SPRINT, MONDAY, "single")).toBe("this sprint");
    expect(doneWindowNote([], MONDAY, "single")).toBe(`last ${DONE_WINDOW_FALLBACK_DAYS} days`);
  });
});

describe("groupDoneCards", () => {
  const done = (id: string, completed_at: string | null) => ({ id, completed_at });

  it("splits the lane into the two days", () => {
    const groups = groupDoneCards(
      [done("a", "2026-09-21T03:00:00Z"), done("b", "2026-09-20T03:00:00Z"), done("c", "2026-09-21T09:00:00Z")],
      { today: MONDAY },
    );
    expect(groups.map((g) => [g.key, g.cards.map((c) => c.id)])).toEqual([
      ["today", ["a", "c"]],
      ["yesterday", ["b"]],
    ]);
  });

  it("reads the completion day in the business timezone", () => {
    // 20:00 UTC on the Sunday is 03:00 Monday in Saigon, so this finished
    // TODAY; slicing the ISO string would file it under yesterday.
    const groups = groupDoneCards([done("late", "2026-09-20T20:00:00Z")], { today: MONDAY });
    expect(groups).toEqual([{ key: "today", cards: [done("late", "2026-09-20T20:00:00Z")] }]);
  });

  it("keeps a card with no completion time, in a group that does not claim a day", () => {
    const groups = groupDoneCards([done("a", "2026-09-21T03:00:00Z"), done("odd", null)], { today: MONDAY });
    expect(groups.map((g) => g.key)).toEqual(["today", "undated"]);
  });

  it("drops empty groups, so a lane finished in one day gets no labels", () => {
    const groups = groupDoneCards([done("a", "2026-09-21T03:00:00Z")], { today: MONDAY });
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("today");
  });

  it("returns nothing for an empty lane", () => {
    expect(groupDoneCards([], { today: MONDAY })).toEqual([]);
  });

  it("groups exactly what the window drew, and nothing else", () => {
    // The window and the grouping share a day, which is why there is no
    // "older" group: the cards that reach the grouping are the cards the
    // window kept.
    const cards = [
      card("today", "done", "2026-09-21T03:00:00Z"),
      card("yesterday", "done", "2026-09-20T03:00:00Z"),
      card("older", "done", "2026-09-19T03:00:00Z"),
    ];
    const drawn = cardsDrawnOnBoard(cards, { doneColumnIds, windowStart: doneWindowStart([], MONDAY, "many") });
    expect(drawn.map((c) => c.id)).toEqual(["today", "yesterday"]);
    expect(groupDoneCards(drawn, { today: MONDAY }).map((g) => g.key)).toEqual(["today", "yesterday"]);
  });
});

// W.139: the Not Doing lane had no window, so it grew for the life of the
// board. It is drawn by Done's window, dated by when a card entered it, since
// a card set aside was never finished and has no completion date.
describe("cardsDrawnOnBoard and the Not Doing lane", () => {
  const closed = new Set(["done", "nd"]);
  const card = (id: string, columnId: string, completed_at: string | null, last_column_move_at: string | null) => ({ id, columnId, completed_at, last_column_move_at });

  it("draws a card set aside in the window, and leaves one set aside before it off", () => {
    const cards = [
      card("recent", "nd", null, "2026-09-22T03:00:00Z"),
      card("old", "nd", null, "2026-08-01T03:00:00Z"),
      card("open", "todo", null, "2026-08-01T03:00:00Z"),
    ];
    expect(cardsDrawnOnBoard(cards, { doneColumnIds: closed, windowStart: "2026-09-21" }).map((c) => c.id)).toEqual(["recent", "open"]);
  });

  it("still draws a card with no date at all rather than hide it", () => {
    expect(cardsDrawnOnBoard([card("x", "nd", null, null)], { doneColumnIds: closed, windowStart: "2026-09-21" })).toHaveLength(1);
  });
});

