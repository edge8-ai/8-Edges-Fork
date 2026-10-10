import { describe, expect, it } from "vitest";
import { myWeek, sprintWeekOf, summaryLine, windowDays, type MyWeekModel } from "./my-week";
import type { MyWeekBlocker, MyWeekBoard, MyWeekCard, MyWeekRead } from "./my-week-read";
import { WEEKLY_SPRINTS_KEY } from "./sprint-cadence";
import type { BoardColumnRow, SprintRow } from "./types";

// W.169. The page is one column of sections, and what has to be proved is
// where each of the reader's cards lands: in exactly one section, by one order
// of precedence, with the strip counting the same buckets the sections list.
//
// 2026-W41 runs Wednesday 2026-10-07 to Tuesday 2026-10-13. The page is read
// on Friday the 9th unless a test says otherwise.
const WEEK = "2026-W41";
const FRIDAY = "2026-10-09";

const col = (id: string, board: string, position: number, over: Partial<BoardColumnRow> = {}): BoardColumnRow =>
  ({ id, board_id: board, name: id, position, is_done: false, wip_limit: null, is_not_doing: false, ...over }) as BoardColumnRow;

const board = (id: string, over: Partial<MyWeekBoard> = {}): MyWeekBoard =>
  ({
    id,
    name: `Board ${id}`,
    slug: `board-${id}`,
    description: null,
    client_company_id: null,
    ai_program_id: null,
    owner_id: null,
    status: "active",
    sort_order: 0,
    metadata: { [WEEKLY_SPRINTS_KEY]: "product" },
    client_name: null,
    columns: [col(`${id}-todo`, id, 0), col(`${id}-doing`, id, 1), col(`${id}-done`, id, 2, { is_done: true })],
    ...over,
  }) as MyWeekBoard;

const sprint = (id: string, boardId: string, week: string, startsOn: string): SprintRow =>
  ({ id, board_id: boardId, name: id, goal: null, starts_on: startsOn, ends_on: null, status: "active", sort_order: 0, meeting_id: null, focus_improvement: null, going_well: null, meeting_summary: null, week, locked_at: null }) as SprintRow;

let n = 0;
const card = (over: Partial<MyWeekCard> = {}): MyWeekCard => ({
  id: `c${(n += 1)}`,
  title: `Card ${n}`,
  board_id: "b1",
  board_column_id: "b1-todo",
  sprint_id: "s41",
  status: "open",
  priority: "p2",
  due_date: null,
  human_tokens: 0.3,
  completed_at: null,
  assignee_id: "me",
  metadata: {},
  ...over,
});

const read = (cards: MyWeekCard[], over: Partial<MyWeekRead> = {}): MyWeekRead => ({
  boards: [board("b1")],
  sprints: [sprint("s41", "b1", WEEK, "2026-10-07"), sprint("s40", "b1", "2026-W40", "2026-09-30")],
  cards,
  blockers: [],
  ...over,
});

/** Every row id the page lists, wherever it lists it. */
const listed = (m: MyWeekModel) => [...m.doing, ...m.now, ...m.fresh, ...m.days.flatMap((d) => d.open), ...m.later, ...m.undated].map((r) => r.id);

describe("the sprint week a date belongs to", () => {
  it("puts Monday and Tuesday in the sprint that began the previous Wednesday", () => {
    expect(sprintWeekOf("2026-10-12")).toBe(WEEK);
    expect(sprintWeekOf("2026-10-13")).toBe(WEEK);
    expect(sprintWeekOf("2026-10-07")).toBe(WEEK);
    expect(windowDays({ startsOn: "2026-10-07", endsOn: "2026-10-13" })).toHaveLength(7);
  });
});

describe("one card, one section", () => {
  it("lists each open card exactly once: in progress, late, due today, new, its day, no date", () => {
    const doing = card({ board_column_id: "b1-doing", due_date: "2026-10-12" });
    const late = card({ due_date: "2026-10-07" });
    const today = card({ due_date: FRIDAY });
    const fresh = card({ metadata: { assigned_at: "2026-10-08T02:00:00.000Z" } });
    const monday = card({ due_date: "2026-10-12" });
    const undated = card();
    const m = myWeek(read([doing, late, today, fresh, monday, undated]), FRIDAY);

    expect(m.doing.map((r) => r.id)).toEqual([doing.id]);
    expect(m.now.map((r) => r.id)).toEqual([late.id, today.id]);
    expect(m.fresh.map((r) => r.id)).toEqual([fresh.id]);
    expect(m.days.find((d) => d.date === "2026-10-12")?.open.map((r) => r.id)).toEqual([monday.id]);
    expect(m.undated.map((r) => r.id)).toEqual([undated.id]);
    expect(listed(m).sort()).toEqual([doing, late, today, fresh, monday, undated].map((c) => c.id).sort());
    expect(m.counts.open).toBe(6);
  });

  it("lists a late card that is in progress once, as in progress, and still says how late it is", () => {
    const c = card({ board_column_id: "b1-doing", due_date: "2026-10-07" });
    const m = myWeek(read([c]), FRIDAY);
    expect(m.now).toEqual([]);
    expect(m.doing).toHaveLength(1);
    expect(m.doing[0]).toMatchObject({ id: c.id, doing: true, lateDays: 2 });
    expect(m.counts).toMatchObject({ doing: 1, late: 1, doingLate: 1 });
    expect(m.strip.late).toBe(1);
  });

  it("keeps started work in In progress with its own date, however far out it is due (W.171)", () => {
    const c = card({ board_column_id: "b1-doing", due_date: "2026-10-30" });
    const m = myWeek(read([c]), FRIDAY);
    expect(m.doing.map((r) => r.id)).toEqual([c.id]);
    expect(m.doing[0]?.due).toBe("2026-10-30");
    expect(m.later).toEqual([]);
    expect(m.strip.days.find((d) => d.isToday)?.open).toBe(1);
  });

  it("counts a card as new for seven days from the day it was assigned", () => {
    const sixDays = card({ metadata: { assigned_at: "2026-10-03T08:00:00.000Z" } });
    const sevenDays = card({ metadata: { assigned_at: "2026-10-02T08:00:00.000Z" } });
    const m = myWeek(read([sixDays, sevenDays]), FRIDAY);
    expect(m.fresh.map((r) => r.id)).toEqual([sixDays.id]);
    expect(m.undated.map((r) => r.id)).toEqual([sevenDays.id]);
  });

  it("keeps a new card that already has a day this sprint on that day, marked new, so the strip's count is exact", () => {
    const c = card({ due_date: "2026-10-12", metadata: { assigned_at: "2026-10-08T02:00:00.000Z" } });
    const m = myWeek(read([c]), FRIDAY);
    expect(m.fresh).toEqual([]);
    expect(m.days.find((d) => d.date === "2026-10-12")?.open[0]).toMatchObject({ id: c.id, fresh: true });
    expect(m.strip.days.find((d) => d.date === "2026-10-12")?.open).toBe(1);
  });

  it("asks for a day for new work due after the sprint, under New to you", () => {
    const c = card({ due_date: "2026-10-30", metadata: { assigned_at: "2026-10-08T02:00:00.000Z" } });
    expect(myWeek(read([c]), FRIDAY).fresh.map((r) => r.id)).toEqual([c.id]);
  });

  it("lists nothing on a past day: work due then is late, not Thursday's", () => {
    const c = card({ due_date: "2026-10-08" });
    const m = myWeek(read([c]), FRIDAY);
    expect(m.days.find((d) => d.date === "2026-10-08")?.open).toEqual([]);
    expect(m.now.map((r) => r.id)).toEqual([c.id]);
  });

  it("lists work due after the sprint under its own heading, even on the sprint's last day", () => {
    const later = card({ due_date: "2026-10-30" });
    const tuesday = "2026-10-13";
    for (const today of [FRIDAY, tuesday]) {
      const m = myWeek(read([later]), today);
      expect(m.later.map((r) => r.id)).toEqual([later.id]);
      expect(m.days.flatMap((d) => d.open)).toEqual([]);
    }
  });

  it("keeps a carried card on its day and says it is carried", () => {
    const c = card({ sprint_id: "s40", due_date: "2026-10-12" });
    const m = myWeek(read([c]), FRIDAY);
    expect(m.days.find((d) => d.date === "2026-10-12")?.open[0]).toMatchObject({ id: c.id, carried: true, carriedFrom: "W40" });
  });

  it("names no week for a carried card whose sprint has none, and none for a card this sprint holds", () => {
    const old = card({ sprint_id: "s-old", due_date: "2026-10-12" });
    const mine = card({ due_date: "2026-10-12" });
    const m = myWeek(read([old, mine], { sprints: [sprint("s41", "b1", WEEK, "2026-10-07"), { ...sprint("s-old", "b1", "", "2026-09-01"), week: null }] }), FRIDAY);
    const rows = m.days.find((d) => d.date === "2026-10-12")?.open ?? [];
    expect(rows.find((r) => r.id === old.id)).toMatchObject({ carried: true, carriedFrom: null });
    expect(rows.find((r) => r.id === mine.id)).toMatchObject({ carried: false, carriedFrom: null });
  });

  it("calls a card in progress by its column's place, whatever the board names its lanes", () => {
    const b2 = board("b2", { columns: [col("backlog", "b2", 0), col("in-review", "b2", 1), col("shipped", "b2", 2, { is_done: true })] });
    const reviewing = card({ board_id: "b2", board_column_id: "in-review", sprint_id: "s41b" });
    const queued = card({ board_id: "b2", board_column_id: "backlog", sprint_id: "s41b" });
    const m = myWeek(read([reviewing, queued], { boards: [b2], sprints: [sprint("s41b", "b2", WEEK, "2026-10-07")] }), FRIDAY);
    expect(m.doing.map((r) => r.id)).toEqual([reviewing.id]);
    expect(m.undated.map((r) => r.id)).toEqual([queued.id]);
  });

  it("counts, and never lists, open work this sprint does not hold", () => {
    const noSprint = card({ sprint_id: null });
    const noCadence = card({ board_id: "b9", board_column_id: "b9-todo" });
    const m = myWeek(read([noSprint, noCadence], { boards: [board("b1"), board("b9", { metadata: {} })] }), FRIDAY);
    expect(listed(m)).toEqual([]);
    expect(m.counts.otherOpen).toBe(2);
  });
});

describe("waiting on you", () => {
  const blocker = (over: Partial<MyWeekBlocker> = {}): MyWeekBlocker => ({
    id: "bl1",
    title: "Needs your API key decision",
    blockedCard: card({ id: "p1", title: "SSO setup", assignee_id: "someone-else", sprint_id: null }),
    ...over,
  });

  it("lists a blocker that names you under Today, with the card it holds up", () => {
    const m = myWeek(read([], { blockers: [blocker()] }), FRIDAY);
    expect(m.now).toHaveLength(1);
    expect(m.now[0]).toMatchObject({ id: "bl1", title: "Needs your API key decision", waitingOn: "SSO setup" });
    expect(m.counts.waiting).toBe(1);
  });

  it("keeps somebody else's card out of your boards, your sizes and your open count", () => {
    const m = myWeek(read([], { blockers: [blocker()] }), FRIDAY);
    expect(m.boards).toEqual([]);
    expect(m.counts.open).toBe(0);
    expect(m.openTokens).toBeNull();
  });
});

describe("the strip", () => {
  it("counts exactly what the sections list, and past days by what finished", () => {
    const cards = [
      card({ due_date: "2026-10-07" }),
      card({ due_date: FRIDAY }),
      card({ board_column_id: "b1-doing" }),
      card({ due_date: "2026-10-12" }),
      card({ due_date: "2026-10-13" }),
      card({ due_date: "2026-10-13" }),
      card({ status: "done", board_column_id: "b1-done", completed_at: "2026-10-08T03:00:00.000Z" }),
      card({ status: "done", board_column_id: "b1-done", completed_at: "2026-10-07T23:30:00.000Z" }),
      // 20:00 UTC on the 6th is 03:00 on Wednesday the 7th in Saigon: inside the sprint.
      card({ status: "done", board_column_id: "b1-done", completed_at: "2026-10-06T20:00:00.000Z" }),
      // 16:00 UTC on the 6th is 23:00 on Tuesday the 6th in Saigon: last sprint's.
      card({ status: "done", board_column_id: "b1-done", completed_at: "2026-10-06T16:00:00.000Z" }),
    ];
    const m = myWeek(read(cards), FRIDAY);
    expect(m.strip.late).toBe(1);
    const byDate = Object.fromEntries(m.strip.days.map((d) => [d.date, d]));
    expect(byDate["2026-10-09"]).toMatchObject({ isToday: true, open: 2 });
    expect(byDate["2026-10-12"]).toMatchObject({ open: 1 });
    expect(byDate["2026-10-13"]).toMatchObject({ open: 2 });
    // 23:30 UTC on the 7th is the 8th in Saigon, which is the business day.
    expect(byDate["2026-10-08"]).toMatchObject({ isPast: true, finished: 2 });
    expect(byDate["2026-10-07"]).toMatchObject({ isPast: true, finished: 1 });
    const stripTotal = m.strip.late + m.strip.days.reduce((s, d) => s + (d.open ?? 0), 0);
    expect(stripTotal).toBe(m.doing.length + m.now.length + m.days.reduce((s, d) => s + d.open.length, 0));
    expect(m.counts.finished).toBe(3);
  });

  it("carries today's finished work too, so the strip's done counts add up to the sprint's (W.171)", () => {
    const cards = [
      card({ status: "done", board_column_id: "b1-done", completed_at: "2026-10-08T03:00:00.000Z" }),
      // 03:00 UTC on Friday the 9th is 10:00 in Saigon: finished today.
      card({ status: "done", board_column_id: "b1-done", completed_at: "2026-10-09T03:00:00.000Z" }),
      card({ status: "done", board_column_id: "b1-done", completed_at: "2026-10-09T04:00:00.000Z" }),
    ];
    const m = myWeek(read(cards), FRIDAY);
    expect(m.strip.days.find((d) => d.isToday)).toMatchObject({ finished: 2 });
    expect(m.strip.days.reduce((s, d) => s + d.finished, 0)).toBe(m.counts.finished);
  });
});

describe("the sprint's last day (W.171)", () => {
  const TUESDAY = "2026-10-13";

  it("knows it is the last day, and names the week open work carries into", () => {
    const m = myWeek(read([card({ due_date: TUESDAY })]), TUESDAY);
    expect(m).toMatchObject({ isLastDay: true, week: WEEK, nextWeek: "2026-W42" });
    expect(myWeek(read([]), FRIDAY).isLastDay).toBe(false);
  });

  it("still lists every open card once on the last day, with the strip counting what the sections list", () => {
    const cards = [
      card({ board_column_id: "b1-doing", due_date: "2026-10-30" }),
      card({ board_column_id: "b1-doing", due_date: TUESDAY }),
      card({ due_date: TUESDAY }),
      card({ due_date: "2026-10-09" }),
      card({ due_date: "2026-10-20" }),
      card({ status: "done", board_column_id: "b1-done", completed_at: "2026-10-13T03:00:00.000Z" }),
    ];
    const m = myWeek(read(cards), TUESDAY);
    expect(m.doing).toHaveLength(2);
    expect(m.now).toHaveLength(2);
    expect(m.later).toHaveLength(1);
    expect(listed(m)).toHaveLength(5);
    const today = m.strip.days.find((d) => d.isToday);
    expect(today).toMatchObject({ open: 3, finished: 1 });
    expect(m.strip.late).toBe(1);
  });
});

describe("your boards", () => {
  it("counts each board's open, late, in-progress and done work, names the next card due, and puts late boards first", () => {
    const b2 = board("b2", { name: "Northwind rollout", client_name: "Northwind" });
    const cards = [
      card({ due_date: "2026-10-12", title: "Deck" }),
      card({ board_id: "b2", board_column_id: "b2-todo", sprint_id: "s41b", due_date: "2026-10-07" }),
      card({ board_id: "b2", board_column_id: "b2-doing", sprint_id: "s41b", due_date: "2026-10-13", title: "Rollout plan" }),
      card({ board_id: "b2", board_column_id: "b2-done", sprint_id: "s41b", status: "done", completed_at: "2026-10-08T03:00:00.000Z" }),
    ];
    const m = myWeek(
      read(cards, { boards: [board("b1"), b2], sprints: [sprint("s41", "b1", WEEK, "2026-10-07"), sprint("s41b", "b2", WEEK, "2026-10-07")] }),
      FRIDAY,
    );
    expect(m.boards.map((b) => b.id)).toEqual(["b2", "b1"]);
    expect(m.boards[0]).toMatchObject({ client: "Northwind", open: 2, late: 1, doing: 1, done: 1, next: { title: "Rollout plan", due: "2026-10-13" } });
    expect(m.boards[1]).toMatchObject({ open: 1, late: 0, next: { title: "Deck", due: "2026-10-12" } });
  });
});

describe("the size of what is left", () => {
  it("sums Human Tokens only when every open card is sized, and otherwise says how many are not", () => {
    expect(myWeek(read([card({ human_tokens: 0.3 }), card({ human_tokens: 1 })]), FRIDAY).openTokens).toBe(1.3);
    const m = myWeek(read([card({ human_tokens: 0.3 }), card({ human_tokens: null })]), FRIDAY);
    expect(m.openTokens).toBeNull();
    expect(m.unsized).toBe(1);
  });
});

describe("the summary sentence", () => {
  it("says what needs you today first and drops every zero, leaving what finished to the footer", () => {
    const m = myWeek(
      read([card({ due_date: FRIDAY }), card({ due_date: FRIDAY }), card({ due_date: "2026-10-07" }), card({ status: "done", completed_at: "2026-10-08T03:00:00.000Z" })]),
      FRIDAY,
    );
    expect(summaryLine(m)).toBe("2 due today and 1 late.");
  });

  it("counts a card that is late and in progress once, as in progress, with its lateness in brackets", () => {
    const m = myWeek(
      read([card({ board_column_id: "b1-doing", due_date: "2026-10-07" }), card({ board_column_id: "b1-doing" }), card({ due_date: "2026-10-08" })]),
      FRIDAY,
    );
    expect(summaryLine(m)).toBe("1 late and 2 in progress (1 late).");
  });

  it("says a clear day is clear", () => {
    expect(summaryLine(myWeek(read([card({ due_date: "2026-10-12" })]), FRIDAY))).toBe("Nothing due today and nothing late.");
  });
});
