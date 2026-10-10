import { addDays, businessDate, isWeekend, previousWorkday } from "@/kernel/config/dates";

// What the board SHOWS in its first and last columns (W.94).
//
// This replaces W.55's Done fold, and the reason it replaces it rather than
// tuning it is the CEO's, twice: a fold is hard to navigate. "Show 445 older"
// is a door with an unknown room behind it, and a reader who has to open a
// door to be sure a card is not there has been given work, not an answer.
//
// So neither column folds. Done gets shorter by what the board READS — a
// finished card outside the current sprint is simply not drawn on the board —
// and To do gets readable by being ORDERED, with a plain label between the
// groups and nothing collapsed.
//
// The two rules are here together because they are the same kind of decision
// (what a column is FOR, expressed as which cards belong in it) and because a
// reader comparing them should not have to open two files.
//
// NOTHING HERE IS A FILTER ON THE DATA. A done card outside the window is
// still read, still in the List view, still in a search, still on the sprint
// page and still in Flow — the board view alone declines to draw it, and only
// while the board is showing everything. A narrowed board draws every match
// regardless of age, because a card a search did not find is the failure this
// whole card exists to avoid.

/**
 * The start of the sprint the reader is in: the latest start date among the
 * active sprints in scope that have ALREADY STARTED, or null when none has.
 *
 * The LATEST rather than the earliest, because across boards each has its own
 * sprint and "this sprint" is the week everybody is in now. Not a future one:
 * on 2026-09-21 the planning page had opened next week's sprint (starts 09-23)
 * as active, the window moved ahead of today, and every card finished this
 * week dropped out of Done. A sprint that has not begun cannot be the one we
 * are in.
 */
export function activeSprintStart(sprints: { status: string; starts_on: string | null }[], today: string): string | null {
  const starts = sprints
    .filter((s) => s.status === "active")
    .map((s) => s.starts_on)
    .filter((d): d is string => !!d && d <= today);
  if (starts.length === 0) return null;
  return starts.reduce((latest, d) => (d > latest ? d : latest));
}

/** The active sprints that have started — the ones a card can be committed to. */
export function activeSprintIds(sprints: { id: string; status: string; starts_on: string | null }[], today: string): Set<string> {
  return new Set(sprints.filter((s) => s.status === "active" && (!s.starts_on || s.starts_on <= today)).map((s) => s.id));
}

/**
 * A board with no active sprint still has a Done column that grows, so it
 * falls back to a week of working days. Seven rather than fourteen because
 * fourteen is the CROSS-BOARD READ's window (DONE_VISIBLE_DAYS): the read
 * decides what the page may know about, and the board decides what is worth
 * looking at, and the second is always the tighter of the two.
 */
export const DONE_WINDOW_FALLBACK_DAYS = 7;

/**
 * The `days`-th most recent working day, counting back from `iso` and
 * COUNTING `iso` ITSELF as the first. "The last 7 business days" includes
 * today, so seven days on a Monday reaches back to the Friday of the week
 * before and not a day further.
 */
export function businessDaysBack(iso: string, days: number): string {
  let d = previousWorkday(iso);
  for (let i = 1; i < days; i++) {
    d = addDays(d, -1);
    while (isWeekend(d)) d = addDays(d, -1);
  }
  return d;
}

/**
 * How many boards the reader is looking at, which is the one thing that
 * decides how far back Done reaches (W.103.7).
 *
 * A single board's Done is one team's week and reads fine at a sprint's
 * length. The cross-board Workboard is not that: it held 417 finished cards
 * for the sprint window, 324 of them from one board, because 64 to 105 cards
 * a day finish here and most of that is agent work. A lane that long is not a
 * record anybody reads — it is a wall in front of the columns that matter.
 */
export type DoneScope = "single" | "many";

/**
 * How many CALENDAR days of finished work a many-board Workboard draws,
 * counting today as the first: today and yesterday.
 *
 * Calendar days rather than working ones, deliberately, and that is the whole
 * reason `businessDaysBack` is not used here: agents ship at the weekend (38
 * cards finished on a Saturday, 60 on the Sunday), so a Monday board whose
 * "yesterday" was the Friday would leave off two days of real work and tell
 * the reader that nothing had happened.
 */
export const DONE_RECENT_DAYS = 2;

/**
 * The first day a finished card is still drawn on the board.
 *
 * On a single board this is the sprint the reader is in, unchanged. On a
 * many-board scope it is yesterday, whatever the sprints say — the decision
 * above is about VOLUME, and the sprint has nothing to do with how many
 * boards are feeding one lane.
 */
export function doneWindowStart(
  sprints: { status: string; starts_on: string | null }[],
  today: string,
  scope: DoneScope = "single",
): string {
  if (scope === "many") return addDays(today, -(DONE_RECENT_DAYS - 1));
  return activeSprintStart(sprints, today) ?? businessDaysBack(today, DONE_WINDOW_FALLBACK_DAYS);
}

/**
 * What the Done head says it is showing, beside the count. A column that is
 * not drawing everything says so, in words, with the way to the rest of it
 * ("All done →") next to it.
 */
export function doneWindowNote(
  sprints: { status: string; starts_on: string | null }[],
  today: string,
  scope: DoneScope = "single",
): string {
  if (scope === "many") return "today & yesterday";
  return activeSprintStart(sprints, today) ? "this sprint" : `last ${DONE_WINDOW_FALLBACK_DAYS} days`;
}

/**
 * The cards the board draws, with finished work older than the window left
 * off the done columns.
 *
 * `windowStart` is null on a narrowed board and nothing is dropped.
 *
 * A card with no completion time is ALWAYS drawn. It is an oddity, and
 * dropping the odd ones is how a board loses a card for good — the same
 * fallback W.55 had, and the one part of it worth keeping.
 */
export function cardsDrawnOnBoard<T extends { columnId: string; completed_at: string | null; last_column_move_at?: string | null }>(
  cards: T[],
  { doneColumnIds, windowStart }: { doneColumnIds: ReadonlySet<string>; windowStart: string | null },
): T[] {
  if (!windowStart || doneColumnIds.size === 0) return cards;
  return cards.filter((c) => {
    if (!doneColumnIds.has(c.columnId)) return true;
    // A card in Not Doing was never finished, so it has no completion date;
    // it is dated by when it entered the lane instead (W.139).
    const at = c.completed_at ?? c.last_column_move_at ?? null;
    // The day is read in the business timezone, like the window; slicing the
    // ISO string would take the UTC day, which is yesterday for anything
    // finished after 17:00 in Saigon.
    return at === null || businessDate(at) >= windowStart;
  });
}

// ─── To do: ordered, never hidden ─────────────────────────────────────────

/** How far ahead a due date still counts as "soon". Calendar days, not working ones: a deadline does not move because a weekend is in front of it. */
export const TODO_DUE_SOON_DAYS = 14;

export type TodoGroupKey = "sprint" | "soon" | "backlog";

/**
 * What the thin label between the groups says. Plain text and nothing else:
 * these are signposts inside one list, not sections to open and close.
 */
export const TODO_GROUP_LABEL: Record<TodoGroupKey, string> = {
  sprint: "This sprint",
  soon: "Due soon",
  backlog: "Backlog",
};

/**
 * The To do column in three groups: what is committed to a sprint that has
 * started, then what is due inside the next fortnight soonest first, then
 * everything else in the order the board already had.
 *
 * A card in an active sprint is in the first group whatever its due date, so
 * the groups never double-count and the first one answers "what did we say we
 * would do this week".
 *
 * Groups with no cards are dropped, so a column whose cards all fall in one
 * group comes back as a single unlabelled group — nothing to read and nothing
 * to explain.
 */
export function orderTodoCards<T extends { sprint_id: string | null; due_date: string | null }>(
  cards: T[],
  { sprintIds, today }: { sprintIds: ReadonlySet<string>; today: string },
): { key: TodoGroupKey; cards: T[] }[] {
  const soonBy = addDays(today, TODO_DUE_SOON_DAYS);
  const sprint: T[] = [];
  const soon: T[] = [];
  const backlog: T[] = [];
  for (const c of cards) {
    if (c.sprint_id && sprintIds.has(c.sprint_id)) sprint.push(c);
    else if (c.due_date && c.due_date <= soonBy) soon.push(c);
    else backlog.push(c);
  }
  // Only the middle group is re-ordered, and by the one fact that put a card
  // in it. The other two keep the board's own placement, which is a manual
  // rank in the backlog and the sprint's own order above it.
  soon.sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));
  return ([
    { key: "sprint" as const, cards: sprint },
    { key: "soon" as const, cards: soon },
    { key: "backlog" as const, cards: backlog },
  ]).filter((g) => g.cards.length > 0);
}

// ─── Done: two days, signposted ───────────────────────────────────────────

export type DoneGroupKey = "today" | "yesterday" | "undated";

/**
 * The thin label between the groups of a many-board Done lane — the same
 * mechanism To do already uses, and for the same reason: plain text inside
 * one list, nothing to open, nothing withheld. Done STAYS A LANE, because
 * Dave and Operations finish work by dragging a card into it.
 *
 * "No completion date" exists because a finished card with no completion time
 * is ALWAYS drawn (see `cardsDrawnOnBoard`), so it has to land in some group,
 * and putting it under "Today" would make the label claim something the card
 * cannot support. A group with no cards is dropped, so that label only ever
 * appears when such an oddity is actually there.
 */
export const DONE_GROUP_LABEL: Record<DoneGroupKey, string> = {
  today: "Today",
  yesterday: "Yesterday",
  undated: "No completion date",
};

/**
 * A many-board Done lane in two days: what finished today, then what finished
 * yesterday, then the undated oddities.
 *
 * The completion day is read in the business timezone, like the window
 * itself; slicing the ISO string would take the UTC day, which is yesterday
 * for anything finished after 17:00 in Saigon.
 *
 * There is no "older" group, because there can be no older card: everything
 * reaching this function has already been through `cardsDrawnOnBoard` with
 * the same day as its window start, so anything finished before yesterday was
 * never drawn. The last branch is therefore "yesterday" rather than
 * "yesterday or older" — and keeping the grouping TOTAL is what stops a card
 * falling out of the column, because the kanban draws the sections and
 * nothing besides them.
 *
 * Groups with no cards are dropped, exactly as To do's are, so a lane whose
 * cards all finished today comes back as a single unlabelled group.
 */
export function groupDoneCards<T extends { completed_at: string | null }>(
  cards: T[],
  { today }: { today: string },
): { key: DoneGroupKey; cards: T[] }[] {
  const finishedToday: T[] = [];
  const finishedYesterday: T[] = [];
  const undated: T[] = [];
  for (const c of cards) {
    if (c.completed_at === null) undated.push(c);
    else if (businessDate(c.completed_at) >= today) finishedToday.push(c);
    else finishedYesterday.push(c);
  }
  return ([
    { key: "today" as const, cards: finishedToday },
    { key: "yesterday" as const, cards: finishedYesterday },
    { key: "undated" as const, cards: undated },
  ]).filter((g) => g.cards.length > 0);
}
