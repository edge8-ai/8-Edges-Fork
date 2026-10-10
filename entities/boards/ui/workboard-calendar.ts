import { addDays, dateMs, isoWeekKey, shiftMonth, type Month } from "@/kernel/config/dates";
import { isOverdue as overdueOn } from "@/entities/boards/lib/card-facts";

// The Calendar view (W.109) — the Workboard's one date view: a month of due
// dates and, beside it, the agenda that lists every card the month shows.
//
// W.175 (Khoa, 2026-10-07, designed by Fable from his "keep the calendar"):
// the mini month became a real one. Each day carries its cards (`cells[].cards`)
// so the grid can show them, and the summary beside it went — "this week",
// "next week" and "overdue" each repeated something the grid's rows or the
// board's pulse strip already say. Undated stays: no day can show it.
//
// IT REPLACES THE SCHEDULE. The Schedule (W.92.2, rebuilt by W.97.3) drew a
// Gantt bar from a START date this data does not have: a card carries only a
// due date, so the start was synthesised from the sprint's `starts_on` and
// failing that from `created_at`, which put almost every bar on the same
// Monday. The CEO's read on production was "bad and weird", and he chose the
// prototype's agenda variant instead. The Schedule is removed rather than left
// half-wired; git keeps it, and the last commit carrying it is b736475c, which
// is where a future Timeline view should start from.
//
// WHAT THIS DRAWS, and why it can draw it honestly: a card has ONE real date,
// the due date, so that is the only thing on screen. Nothing is synthesised.
//
// The rules the view inherits rather than invents:
//  - DONE CARDS ARE NOT ROWS unless the reader's lane filter names a done lane
//    (the `includeDone` rule the Schedule set in W.97.3, copied exactly, and
//    fed from the same place in WorkboardViewBody). An agenda is a statement
//    about what is still ahead.
//  - OVERDUE IS THE ERROR TOKEN and nothing else is coloured by urgency.
//    Priority never gets a hue (W.48); a done card is struck and muted.
//  - EVERY FIGURE DESCRIBES CARDS AND DAYS, never the person holding them,
//    which is the house rule in CLAUDE.md.
//  - THE UNDATED CARDS ARE A COUNT AND A LINK (W.105), not a list: the view
//    says how many have no day and hands over to the filter that shows them.

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * The card as the calendar reads it. Deliberately the four fields the MODEL
 * needs — everything a row prints (client, HT, assignee, lane) is the view's
 * business, so `buildCalendar` is generic and hands the caller's own card back
 * untouched rather than narrowing it to a shape the renderer would have to
 * look the rest of up from.
 */
export type CalendarCard = {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
};

/** One section of the agenda: the overdue pile, or one day that has cards. */
export type CalendarGroup<T> = {
  /** React key and the group's identity: "overdue", or the ISO date. */
  key: string;
  kind: "overdue" | "day";
  /** The day this group stands for; null for the overdue pile, which spans many. */
  iso: string | null;
  cards: T[];
  open: number;
  done: number;
  /** Open and past its due date. A done card is never late. */
  overdue: number;
  today: boolean;
  /** Before today, so the view renders it quieter — it is context, not plan. */
  past: boolean;
};

/** One day of the month grid. */
export type CalendarCell<T> = {
  iso: string;
  dayOfMonth: number;
  /** A leading or trailing day borrowed from the neighbouring month. */
  outOfMonth: boolean;
  today: boolean;
  /**
   * The cards due on this day, by title, under the same scope rule as the
   * agenda (done cards only when asked for). An overdue card stays on the day
   * it was due, as well as in the agenda's overdue pile: the grid is a map of
   * dates, the pile is the list of what to do about them.
   */
  cards: T[];
  /** Before today with an open card still on it, which the grid says in the error ink. */
  late: boolean;
};

/** What the month's head says beside the period: the open cards no day can show. */
export type CalendarSummary = {
  undated: number;
};

export type Calendar<T> = {
  groups: CalendarGroup<T>[];
  cells: CalendarCell<T>[];
  summary: CalendarSummary;
  /** "September 2026" — what the mini month's heading says. */
  period: string;
};

/** The month an ISO date falls in, 0-based like Date.getMonth() so `shiftMonth` takes it. */
export function monthOf(iso: string): Month {
  return { y: Number(iso.slice(0, 4)), m: Number(iso.slice(5, 7)) - 1 };
}

/** The first day of a month, as YYYY-MM-DD. */
export function monthStart({ y, m }: Month): string {
  return `${String(y).padStart(4, "0")}-${String(m + 1).padStart(2, "0")}-01`;
}

/** The last day of a month, as YYYY-MM-DD: the day before the next month begins. */
export function monthEnd(month: Month): string {
  return addDays(monthStart(shiftMonth(month, 1)), -1);
}

/** "September 2026". */
export function monthLabel({ y, m }: Month): string {
  return `${MONTHS[m]} ${y}`;
}

/**
 * The Monday of the week `iso` falls in.
 *
 * Monday-first everywhere in this file, because the sprint calendar keys on
 * the ISO week (`isoWeekKey`) and a week that started on Sunday here would
 * report a different "this week" from the one the sprint filter means.
 */
export function weekStartOf(iso: string): string {
  return addDays(iso, -((new Date(dateMs(iso)).getUTCDay() + 6) % 7));
}

/**
 * "W41": the ISO week a grid row is, the same week key the sprint calendar
 * uses (`isoWeekKey`), so a row of the month and a sprint's week name agree.
 */
export function weekNumber(iso: string): string {
  return `W${Number(isoWeekKey(iso).split("-W")[1])}`;
}

/**
 * The month grid's cells: whole weeks, Monday first, with the leading and
 * trailing days of the neighbouring months marked rather than left blank —
 * a blank cell makes the grid ragged and says nothing, while a greyed 31st
 * says which week the month begins in.
 */
export function monthCells<T extends CalendarCard>(month: Month, todayIso: string, cardsByDay: Map<string, T[]>): CalendarCell<T>[] {
  const first = monthStart(month);
  const last = monthEnd(month);
  const gridStart = weekStartOf(first);
  // Through the end of the week the last day falls in, so the grid is always
  // whole weeks and never ends mid-row.
  const gridEnd = addDays(weekStartOf(last), 6);
  const cells: CalendarCell<T>[] = [];
  for (let iso = gridStart; iso <= gridEnd; iso = addDays(iso, 1)) {
    const cards = cardsByDay.get(iso) ?? [];
    cells.push({
      iso,
      dayOfMonth: Number(iso.slice(8, 10)),
      outOfMonth: iso < first || iso > last,
      today: iso === todayIso,
      cards,
      late: iso < todayIso && cards.some((c) => c.status === "open"),
    });
  }
  return cells;
}

/**
 * The whole view's model.
 *
 * `monthShift` moves the displayed month, exactly as the Schedule's week shift
 * moved its window (W.97.3) and through the same URL codec, so "the calendar
 * for November" is a link somebody can send.
 *
 * THE OVERDUE PILE IS ONLY ON THE CURRENT MONTH. Overdue is a fact about now
 * rather than about a month: lifting it to the top of November, which nobody
 * is working in yet, would put the same cards in two places depending on which
 * arrow was last pressed. On any other month the agenda is simply that month's
 * days, and a card that is late still shows on the day it was due.
 */
export function buildCalendar<T extends CalendarCard>({
  cards,
  todayIso,
  monthShift = 0,
  includeDone = false,
}: {
  cards: T[];
  /** Today as a Saigon business date (kernel/config/dates), never the browser's. */
  todayIso: string;
  monthShift?: number;
  /** The reader's lane filter names a done lane, so finished work is wanted here. */
  includeDone?: boolean;
}): Calendar<T> {
  const month = shiftMonth(monthOf(todayIso), monthShift);
  const first = monthStart(month);
  const last = monthEnd(month);
  const current = monthShift === 0;

  // The one narrowing this view does on its own, and the reason it reads as a
  // plan rather than an archive (the W.97.3 rule, carried over).
  const inScope = includeDone ? cards : cards.filter((c) => c.status === "open");
  // The board's one rule (card-facts.ts, A.29.1), so the pile, the figure
  // beside the mini month, the card's amber and the Attention filter agree.
  const isOverdue = (c: T) => overdueOn(c, todayIso);

  // Every card's due day, for the grid. Gathered over the whole scope rather
  // than the month, because a cell borrowed from the neighbouring month must
  // show its own day honestly.
  const cardsByDay = new Map<string, T[]>();
  for (const c of inScope) {
    if (!c.due_date) continue;
    const iso = c.due_date.slice(0, 10);
    cardsByDay.set(iso, [...(cardsByDay.get(iso) ?? []), c]);
  }
  for (const rows of cardsByDay.values()) rows.sort((a, b) => a.title.localeCompare(b.title));

  const overdue: T[] = [];
  const byDay = new Map<string, T[]>();
  for (const c of inScope) {
    if (!c.due_date) continue;
    const iso = c.due_date.slice(0, 10);
    if (current && isOverdue(c)) {
      overdue.push(c);
      continue;
    }
    if (iso < first || iso > last) continue;
    byDay.set(iso, [...(byDay.get(iso) ?? []), c]);
  }

  const tally = (rows: T[]) => ({
    open: rows.filter((c) => c.status === "open").length,
    done: rows.filter((c) => c.status === "done").length,
    overdue: rows.filter(isOverdue).length,
  });
  const byTitle = (a: T, b: T) => a.title.localeCompare(b.title);

  const groups: CalendarGroup<T>[] = [];
  // A day with no cards is not a heading over nothing, so it is never listed.
  for (const iso of [...byDay.keys()].sort()) {
    const rows = byDay.get(iso)!.slice().sort(byTitle);
    groups.push({
      key: iso,
      kind: "day",
      iso,
      cards: rows,
      ...tally(rows),
      today: iso === todayIso,
      past: iso < todayIso,
    });
  }

  // The overdue pile sits AFTER today, not above it (Khoa, 2026-09-23). On the
  // live board the pile held 24 cards, and first in the list it pushed today
  // below the fold: the view opened on what slipped rather than on what is due
  // now. So today leads, the pile follows it, and the days ahead come after.
  // With nothing due today the pile takes today's place, ahead of the first
  // future day. Oldest first inside it: what slipped furthest is what to look at.
  if (overdue.length > 0) {
    const rows = overdue
      .slice()
      .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? "") || byTitle(a, b));
    const pile: CalendarGroup<T> = { key: "overdue", kind: "overdue", iso: null, cards: rows, ...tally(rows), today: false, past: true };
    const ahead = groups.findIndex((g) => g.iso !== null && g.iso > todayIso);
    groups.splice(ahead === -1 ? groups.length : ahead, 0, pile);
  }

  return {
    groups,
    cells: monthCells(month, todayIso, cardsByDay),
    summary: { undated: inScope.filter((c) => c.status === "open" && !c.due_date).length },
    period: monthLabel(month),
  };
}
