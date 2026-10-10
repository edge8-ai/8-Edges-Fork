// My Week (W.61, reshaped in W.102, rebuilt as one reading column in W.169):
// the shape of one person's own sprint week, from the read that holds only
// their cards (my-week-read.ts).
//
// THE PAGE IS A SELF-VIEW AND THIS FILE IS WHERE THAT IS TRUE. Nothing here
// takes a person: the read was already narrowed to the reader, so every figure
// below is a total over the reader's own cards. The house rule bars a metric
// that describes a person TO SOMEBODY ELSE; the only reader here is its subject.
//
// ONE CARD, ONE SECTION. The page reads top to bottom (the 2026-10-06 design:
// variant A of the prototype on branch prototype/my-week-w169; In progress
// split out of Today in W.171, from round 2's variant B), and each open card is
// listed exactly once, in the first section that claims it:
//
//   1. In progress — open and past its board's first column, whatever its date.
//                    It keeps its own due date; it is not "today's" work just
//                    because it has started (2026-10-06 review: no tool in the
//                    research pinned started work into Today).
//   1b. Today     — late, then due today; then the blockers that wait on you.
//   2. New to you — assigned in the last seven days and with no day in this
//                   sprint yet (undated, or due after it), so it can be given
//                   one. A new card that already has a day this sprint stays
//                   on that day, marked new, so the strip's "N due" is exact.
//   3. Its day    — the sprint day it is due.
//   4. After this sprint — due beyond the window's last day, with its date.
//   5. No date.
//
// The strip counts the same buckets the sections list (late, the In progress
// and Today rows that are not late, each later day), so the strip and the page
// below it can never disagree about how much a day holds — the promise W.102
// made. Today's cell also carries what finished today, so the strip's done
// counts add up to the sprint's (W.171: it used to drop today's).
//
// The rules the page needs already exist and are reused rather than restated:
// which sprint a board is committing to (planningBoards), whether a card is in
// it (planningColumn), what carrying means (isCarried) and lateness
// (isOverdue). Finished work is counted by the Saigon business day it was done
// on, inside the sprint's window: the date it names, not the UTC instant. No rate, velocity, burn-down or ratio
// is computed here or can be (W.98), and the one sum is withheld unless every
// open card is sized: a partial sum reads as the whole and is wrong.
import { addDays, businessDate, dateMs, diffDays, isoWeekKey } from "@/kernel/config/dates";
import { cardSlug } from "@/kernel/config/slug";
import { weekWindow, type SprintWindow } from "./sprint-cadence";
import { isCarried, planningBoards, planningColumn, type PlanningBoard } from "./sprint-planning";
import { placeLabel, isOverdue } from "./card-facts";
import { totalTokens } from "./tokens";
import { TASK_PRIORITIES, type TaskPriority } from "./types";
import type { MyWeekBoard, MyWeekCard, MyWeekRead } from "./my-week-read";
import { boardSummaries, type MyWeekBoardSummary } from "./my-week-boards";
import { sprintRail, type SprintRail } from "./my-week-sprint";

export type { MyWeekBoardSummary, SprintRail };

/** One line on the page: a card of yours, or a blocker that waits on you. */
export type MyWeekRow = {
  id: string;
  title: string;
  priority: TaskPriority;
  /** The card's drawer on its board, or null when its board did not come back. */
  href: string | null;
  /** Where it lives: "Client · Board". */
  place: string;
  due: string | null;
  /** Days past due; 0 when it is not late. */
  lateDays: number;
  /** Still sitting in an earlier sprint: a word on the row, never a section. */
  carried: boolean;
  /** The week it was carried from ("W39"), when that sprint names one. */
  carriedFrom: string | null;
  doing: boolean;
  /** Assigned to you in the last seven days. */
  fresh: boolean;
  /** For a blocker: the title of the card it holds up. */
  waitingOn: string | null;
  ht: number | null;
};

export type MyWeekDay = { date: string; open: MyWeekRow[]; isToday: boolean; isPast: boolean };

export type MyWeekStripDay = {
  date: string;
  isToday: boolean;
  isPast: boolean;
  /** Rows the page lists for this day; null on a past day, which shows what finished. */
  open: number | null;
  /** What finished that day; today's too, so the strip adds up to the sprint. */
  finished: number;
};

export type MyWeekModel = {
  week: string;
  /** The week that starts the day after this one ends: where open work carries. */
  nextWeek: string;
  window: SprintWindow;
  today: string;
  /** Today is the window's last day: the page says so (W.171). */
  isLastDay: boolean;
  /** Started and not finished, whatever its date. */
  doing: MyWeekRow[];
  /** Today: late, due today, then waiting on you. In progress is its own list. */
  now: MyWeekRow[];
  fresh: MyWeekRow[];
  /** Every day of the window; past days and today list nothing (that work is in Today). */
  days: MyWeekDay[];
  /** Due after the window's last day: listed with their dates, never folded into Tuesday. */
  later: MyWeekRow[];
  undated: MyWeekRow[];
  strip: { late: number; days: MyWeekStripDay[] };
  boards: MyWeekBoardSummary[];
  counts: {
    /** Your open cards this sprint holds — every one listed, waiting rows aside. */
    open: number;
    doing: number;
    /** In progress and late: counted in both `doing` and `late`, said once in the sentence. */
    doingLate: number;
    late: number;
    dueToday: number;
    waiting: number;
    finished: number;
    /** Open cards of yours this sprint does not hold: a count, never a list. */
    otherOpen: number;
  };
  /** Human Tokens still open, or null when any open card is unsized (W.98). */
  openTokens: number | null;
  unsized: number;
  /** Your sprint (W.173): the ring, Next up, the plant and its badges, the garden. */
  rail: SprintRail;
};

// A sprint runs Wednesday to Tuesday (sprint-cadence.ts), so the Monday and
// Tuesday a person opens this page on belong to the week that began on the
// previous Wednesday. Every other weekday is inside its own ISO week.
const MONDAY = 1;
const TUESDAY = 2;
const NEW_FOR_DAYS = 7;

/** "W39" from "2026-W39": the week as the page prints it. */
export function weekLabel(key: string): string {
  return key.slice(key.indexOf("W"));
}

/** The company sprint week a calendar date falls inside. */
export function sprintWeekOf(today: string): string {
  const weekday = new Date(dateMs(today)).getUTCDay();
  return isoWeekKey(weekday === MONDAY || weekday === TUESDAY ? addDays(today, -7) : today);
}

/** The seven dates of a Wednesday-to-Tuesday window, in order. */
export function windowDays(span: SprintWindow): string[] {
  const out: string[] = [];
  for (let d = span.startsOn; d <= span.endsOn; d = addDays(d, 1)) out.push(d);
  return out;
}

/** The first day of the sprint the date belongs to: the read's done window opens here. */
export function sprintStartOf(today: string): string {
  return weekWindow(sprintWeekOf(today))?.startsOn ?? today;
}

// Highest priority first, then the earlier due date, then the title: one order
// so a section reads the same way twice.
function byUrgency(a: MyWeekRow, b: MyWeekRow): number {
  const p = TASK_PRIORITIES.indexOf(a.priority) - TASK_PRIORITIES.indexOf(b.priority);
  if (p !== 0) return p;
  const d = (a.due ?? "9999").localeCompare(b.due ?? "9999");
  return d !== 0 ? d : a.title.localeCompare(b.title);
}

/**
 * Open and past its board's first column: started. Boards spell this lane
 * differently ("Doing", "In progress", "Review") and no column carries a flag
 * for it, so its place is the rule (decided 2026-10-06).
 */
function pastFirstColumn(card: MyWeekCard, board: MyWeekBoard | undefined): boolean {
  if (!board || !card.board_column_id) return false;
  const live = board.columns.filter((c) => !c.is_done && !c.is_not_doing).sort((a, b) => a.position - b.position);
  return live.length > 1 && live.some((c) => c.id === card.board_column_id) && live[0]?.id !== card.board_column_id;
}

function isFresh(card: MyWeekCard, today: string): boolean {
  const at = card.metadata?.assigned_at;
  return typeof at === "string" && businessDate(at) > addDays(today, -NEW_FOR_DAYS);
}

/** The reader's week. `read` must already be the reader's own (readMyWeek). */
export function myWeek(read: MyWeekRead, today: string): MyWeekModel {
  const week = sprintWeekOf(today);
  // weekWindow only returns null for a malformed key, which isoWeekKey cannot
  // produce; the fallback keeps the page rendering rather than throwing.
  const span = weekWindow(week) ?? { startsOn: today, endsOn: addDays(today, 6) };
  const boardById = new Map(read.boards.map((b) => [b.id, b]));
  const sprintWeek = new Map(read.sprints.map((s) => [s.id, s.week]));
  const planning = new Map<string, PlanningBoard<MyWeekBoard>>();
  for (const pb of planningBoards(read, week)) planning.set(pb.board.id, pb);

  const rowOf = (card: MyWeekCard, carried: boolean): MyWeekRow => {
    const board = card.board_id ? boardById.get(card.board_id) : undefined;
    return {
      id: card.id,
      title: card.title,
      priority: card.priority,
      href: board ? `/team/boards/${board.slug}?card=${cardSlug(card.title, card.id)}` : null,
      place: placeLabel(board),
      due: card.due_date,
      lateDays: isOverdue(card, today) && card.due_date ? diffDays(card.due_date, today) : 0,
      carried,
      carriedFrom: carried && card.sprint_id ? weekOrNull(sprintWeek.get(card.sprint_id)) : null,
      doing: pastFirstColumn(card, board),
      fresh: isFresh(card, today),
      waitingOn: null,
      ht: card.human_tokens,
    };
  };

  const open: { card: MyWeekCard; row: MyWeekRow }[] = [];
  const done: MyWeekCard[] = [];
  // Finished before this window: only the garden reads these (W.173).
  const pastDone: MyWeekCard[] = [];
  let otherOpen = 0;
  for (const card of read.cards) {
    const pb = card.board_id ? planning.get(card.board_id) : undefined;
    // A board that does not run weekly sprints takes no part in planning, so
    // its cards are counted, never placed in a day of this week.
    if (!pb) {
      if (card.status === "open") otherOpen += 1;
      continue;
    }
    if (card.status === "done") {
      // By the business day it was finished on (the read fetches a day early
      // so a card closed before 07:00 Saigon on the first Wednesday is here).
      const on = card.completed_at ? businessDate(card.completed_at) : null;
      if (on && on >= span.startsOn && on <= span.endsOn) done.push(card);
      else if (on && on < span.startsOn) pastDone.push(card);
      continue;
    }
    const column = planningColumn(card, pb, span.startsOn);
    if (column === "next") open.push({ card, row: rowOf(card, false) });
    else if (isCarried(card, pb)) open.push({ card, row: rowOf(card, true) });
    else if (card.status === "open") otherOpen += 1;
  }

  const doing: MyWeekRow[] = [];
  const late: MyWeekRow[] = [];
  const dueToday: MyWeekRow[] = [];
  const fresh: MyWeekRow[] = [];
  const later: MyWeekRow[] = [];
  const undated: MyWeekRow[] = [];
  const dated = new Map<string, MyWeekRow[]>();
  for (const { row } of open) {
    if (row.doing) doing.push(row);
    else if (row.lateDays > 0) late.push(row);
    else if (row.due === today) dueToday.push(row);
    else if (row.fresh && (!row.due || row.due > span.endsOn)) fresh.push(row);
    else if (!row.due) undated.push(row);
    // Pinning these to the window's last day hid their real dates, and on that
    // last day it hid the cards themselves (found on real data, 2026-10-06).
    else if (row.due > span.endsOn) later.push(row);
    else dated.set(row.due, [...(dated.get(row.due) ?? []), row]);
  }

  const waiting: MyWeekRow[] = read.blockers.map((b) => ({
    ...rowOf(b.blockedCard, false),
    id: b.id,
    title: b.title,
    // The blocker is the reader's to answer, not the card's to finish: its
    // card's lateness and progress belong to whoever owns that card.
    lateDays: 0,
    doing: false,
    fresh: false,
    ht: null,
    waitingOn: b.blockedCard.title,
  }));

  doing.sort(byUrgency);
  const now = [...late.sort(byUrgency), ...dueToday.sort(byUrgency), ...waiting.sort(byUrgency)];
  const finishedOn = new Map<string, number>();
  for (const card of done) {
    const day = card.completed_at ? businessDate(card.completed_at) : today;
    finishedOn.set(day, (finishedOn.get(day) ?? 0) + 1);
  }
  const days: MyWeekDay[] = windowDays(span).map((date) => ({
    date,
    // Only a day still ahead lists anything: today's work is in Today, and a
    // past day's unfinished work is late.
    open: date > today ? (dated.get(date) ?? []).sort(byUrgency) : [],
    isToday: date === today,
    isPast: date < today,
  }));

  const doingLate = doing.filter((r) => r.lateDays > 0).length;
  const lateCount = doingLate + late.length;
  const strip = {
    late: lateCount,
    days: days.map((d) => ({
      date: d.date,
      isToday: d.isToday,
      isPast: d.isPast,
      // Today's cell holds In progress and Today, less what the Late cell holds.
      open: d.isPast ? null : d.isToday ? doing.length + now.length - lateCount : d.open.length,
      finished: finishedOn.get(d.date) ?? 0,
    })),
  };

  const mine = open.map((o) => o.row);
  const openCards = open.map((o) => o.card);
  const unsized = openCards.filter((c) => c.human_tokens === null).length;

  return {
    week,
    nextWeek: sprintWeekOf(addDays(span.endsOn, 1)),
    window: span,
    today,
    isLastDay: today === span.endsOn,
    doing,
    now,
    fresh: fresh.sort(byUrgency),
    days,
    later: later.sort(byUrgency),
    undated: undated.sort(byUrgency),
    strip,
    boards: boardSummaries(open, done, boardById, today),
    counts: {
      open: mine.length,
      doing: doing.length,
      doingLate,
      late: lateCount,
      dueToday: dueToday.length,
      waiting: waiting.length,
      finished: done.length,
      otherOpen,
    },
    openTokens: openCards.length > 0 && unsized === 0 ? totalTokens(openCards) : null,
    unsized,
    rail: sprintRail({ open: mine, done, pastDone, span, today, weekOf: sprintWeekOf }),
  };
}

/**
 * "2 due today, 1 late and 3 in progress (1 late)." Zero clauses drop out, and
 * every card is counted once: a card both late and in progress is in progress,
 * with its lateness in brackets (W.171; it used to be counted in both clauses).
 * What finished is not here: the footer's link says it, and one figure said
 * twice on one screen is noise (2026-10-06 review).
 */
export function summaryLine(m: MyWeekModel): string {
  const parts: string[] = [];
  const lateNotDoing = m.counts.late - m.counts.doingLate;
  if (m.counts.dueToday) parts.push(`${m.counts.dueToday} due today`);
  if (lateNotDoing) parts.push(`${lateNotDoing} late`);
  if (m.counts.waiting) parts.push(`${m.counts.waiting} waiting on you`);
  if (m.counts.doing) parts.push(`${m.counts.doing} in progress${m.counts.doingLate ? ` (${m.counts.doingLate} late)` : ""}`);
  return `${parts.length === 0 ? "Nothing due today and nothing late" : joinClauses(parts)}.`;
}

function weekOrNull(key: string | null | undefined): string | null {
  return key ? weekLabel(key) : null;
}

function joinClauses(parts: string[]): string {
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
