import { describe, expect, it } from "vitest";
import { buildCalendar, monthLabel, monthOf, weekNumber, type CalendarCard } from "./workboard-calendar";

// W.109. What the agenda promises: today first, then the overdue pile, then forward day
// by day; a day with no cards is never a heading over nothing; finished work
// stays out unless the reader asked for it; and every figure describes cards
// and days rather than the person holding them (CLAUDE.md).
//
// The names are invented. A real colleague's name in a fixture fails
// check:fork-safe, because the public fork receives the test files too.

const TODAY = "2026-09-22"; // a Tuesday

const card = (over: Partial<CalendarCard> & { id: string }): CalendarCard => ({
  title: `Card ${over.id}`,
  status: "open",
  due_date: null,
  ...over,
});

const build = (cards: CalendarCard[], over: { monthShift?: number; includeDone?: boolean } = {}) =>
  buildCalendar({ cards, todayIso: TODAY, ...over });

describe("buildCalendar grouping", () => {
  it("puts today first, then the overdue pile, then the days ahead", () => {
    const cal = build([
      card({ id: "ahead", due_date: "2026-09-25" }),
      card({ id: "late", due_date: "2026-09-18" }),
      card({ id: "now", due_date: TODAY }),
    ]);
    expect(cal.groups.map((g) => g.key)).toEqual([TODAY, "overdue", "2026-09-25"]);
    expect(cal.groups[0].today).toBe(true);
    expect(cal.groups[1].cards.map((c) => c.id)).toEqual(["late"]);
  });

  it("puts the overdue pile where today would be when nothing is due today", () => {
    const cal = build([
      card({ id: "ahead", due_date: "2026-09-25" }),
      card({ id: "late", due_date: "2026-09-18" }),
    ]);
    expect(cal.groups.map((g) => g.key)).toEqual(["overdue", "2026-09-25"]);
  });

  it("lists no day that has no card", () => {
    const cal = build([card({ id: "a", due_date: "2026-09-24" })]);
    expect(cal.groups.map((g) => g.iso)).toEqual(["2026-09-24"]);
  });

  it("counts open, done and overdue per group, and never counts a person", () => {
    // Two cards on one past day, one of them finished: the day reports one
    // open, one done and one overdue, and says nothing about who holds either.
    const cal = build(
      [
        card({ id: "a", due_date: "2026-09-19" }),
        card({ id: "b", due_date: "2026-09-19", status: "done" }),
      ],
      { includeDone: true },
    );
    const overdue = cal.groups.find((g) => g.kind === "overdue")!;
    expect({ open: overdue.open, overdue: overdue.overdue }).toEqual({ open: 1, overdue: 1 });
    const day = cal.groups.find((g) => g.iso === "2026-09-19")!;
    expect({ open: day.open, done: day.done }).toEqual({ open: 0, done: 1 });
  });

  it("leaves finished work out unless the reader asked for it", () => {
    const cards = [card({ id: "d", due_date: "2026-09-24", status: "done" })];
    expect(build(cards).groups).toEqual([]);
    expect(build(cards, { includeDone: true }).groups[0].done).toBe(1);
  });

  it("holds the overdue pile to the month today sits in", () => {
    // Overdue is a fact about NOW, not about October: lifting it to the top of
    // a month nobody is working in yet would put one card in two places
    // depending on which arrow was last pressed.
    const cal = build([card({ id: "late", due_date: "2026-09-18" })], { monthShift: 1 });
    expect(cal.groups).toEqual([]);
    expect(cal.period).toBe("October 2026");
  });
});

describe("the mini month", () => {
  it("runs whole weeks from a Monday and marks the borrowed days", () => {
    const cal = build([]);
    expect(cal.cells.length % 7).toBe(0);
    expect(cal.cells[0].iso).toBe("2026-08-31");
    expect(cal.cells[0].outOfMonth).toBe(true);
    expect(cal.cells.find((c) => c.iso === TODAY)?.today).toBe(true);
  });

  // W.175: the grid shows the cards themselves, so a day carries them.
  it("puts each card on the day it is due, by title, and keeps a late card on its own day", () => {
    const cal = build([
      card({ id: "b", title: "Bravo", due_date: "2026-09-24" }),
      card({ id: "a", title: "Alpha", due_date: "2026-09-24" }),
      card({ id: "late", due_date: "2026-09-15" }),
    ]);
    expect(cal.cells.find((c) => c.iso === "2026-09-24")!.cards.map((c) => c.title)).toEqual(["Alpha", "Bravo"]);
    // Late on the grid as well as in the overdue pile: the grid maps dates.
    expect(cal.cells.find((c) => c.iso === "2026-09-15")!.cards.map((c) => c.id)).toEqual(["late"]);
    expect(cal.groups.find((g) => g.kind === "overdue")!.cards.map((c) => c.id)).toEqual(["late"]);
  });

  it("calls a past day late only while an open card is still on it", () => {
    const cal = build(
      [card({ id: "late", due_date: "2026-09-15" }), card({ id: "shipped", due_date: "2026-09-16", status: "done" }), card({ id: "ahead", due_date: "2026-09-24" })],
      { includeDone: true },
    );
    const cell = (iso: string) => cal.cells.find((c) => c.iso === iso)!;
    expect(cell("2026-09-15").late).toBe(true);
    expect(cell("2026-09-16").late).toBe(false);
    expect(cell("2026-09-24").late).toBe(false);
  });

  it("leaves finished work off the grid unless the reader asked for it, as the agenda does", () => {
    const done = [card({ id: "shipped", due_date: "2026-09-24", status: "done" })];
    expect(build(done).cells.find((c) => c.iso === "2026-09-24")!.cards).toEqual([]);
    expect(build(done, { includeDone: true }).cells.find((c) => c.iso === "2026-09-24")!.cards).toHaveLength(1);
  });

  it("names a row by the ISO week the sprint calendar uses", () => {
    expect(weekNumber("2026-09-21")).toBe("W39");
    expect(weekNumber("2026-10-05")).toBe("W41");
  });
});

describe("the summary", () => {
  // This week, next week and overdue went in W.175: the grid's rows are the
  // weeks and the board's pulse strip already counts what is overdue.
  it("counts only the open cards no day can show", () => {
    const cal = build([
      card({ id: "dated", due_date: "2026-09-25" }),
      card({ id: "none" }),
      card({ id: "finished", status: "done" }),
    ]);
    expect(cal.summary).toEqual({ undated: 1 });
  });
});

describe("the period label", () => {
  it("names the month the agenda is showing", () => {
    expect(monthLabel(monthOf(TODAY))).toBe("September 2026");
    expect(build([], { monthShift: -1 }).period).toBe("August 2026");
  });
});
