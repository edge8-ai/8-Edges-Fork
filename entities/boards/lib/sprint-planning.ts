import type { SprintRow } from "./types";
import { addDays } from "@/kernel/config/dates";
import { weekWindow, weeklySprintChat, type SprintChat } from "./sprint-cadence";
import { currentSprint } from "./current-sprint";
import { sprintLockHolds } from "./sprint-lock";
import type { WorkboardBoard, WorkboardCard, WorkboardData } from "./workboard";
import { isOverdue } from "./card-facts";
import { isOpen, isDone, isSetAside } from "./card-stage";

// Sprint planning (SP-01, 2026-09-16): the Monday-to-Tuesday view where the
// team looks at every card that is not done and either commits it to next
// week's sprint or closes it. Three columns, derived here from the workboard
// read so the page and its tests share one rule:
//   open  - not done and not in the board's next sprint (the backlog, plus
//           what the ending sprint did not finish, flagged as carried);
//   next  - committed to the board's next sprint;
//   done  - finished since the last planning (older done cards are hidden).
// Only boards that run weekly sprints take part; the routine opens their next
// sprint on Monday. A board's next sprint is its sprint in the week being
// planned (planningWeek in sprint-cadence.ts), never simply its newest active
// one: a board that opens its roadmap ahead has several active sprints, and on
// 2026-10-21 "newest" made a client board plan into W46 while its W43 had started
// that morning (W.202.1). A past week (SW-01) can be chosen from the sprints'
// company week keys, newest first: then "next" is each board's sprint in that
// week and "done" is what finished inside its Wednesday-to-Tuesday window, so
// a past planning can be read back the way it was.

export type PlanningColumn = "open" | "next" | "done";

// A planning column carries its stage as a flag, the way a board lane does
// (WorkboardLane.isDone), so the page asks the column whether it holds
// finished work rather than spelling a view's id (A.42).
export const PLANNING_COLUMNS: { id: PlanningColumn; label: string; isDone: boolean }[] = [
  { id: "open", label: "Not done", isDone: false },
  { id: "next", label: "Next sprint", isDone: false },
  { id: "done", label: "Done this week", isDone: true },
];

/** Whether a planning column holds the finished cards: the one a card is not dragged back out of (W.20). */
export function isDonePlanningColumn(id: string): boolean {
  return PLANNING_COLUMNS.some((c) => c.id === id && c.isDone);
}

// Generic over the board's shape because the rules below read only a board's
// id and its sprint cadence: My Week (W.169) plans with the slim boards of its
// person-scoped read rather than the workboard's full ones.
export type PlanningBoard<B extends Pick<WorkboardBoard, "id" | "metadata"> = WorkboardBoard> = {
  board: B;
  chat: SprintChat;
  // The sprint cards are committed to; null until the routine has opened one.
  next: SprintRow | null;
  // The older active sprints, closed by "Finish planning".
  ending: SprintRow[];
};

const startKey = (s: SprintRow) => s.starts_on ?? "";

/**
 * The weeks the picker offers, newest first: the week being planned, then
 * every earlier week a weekly board has a sprint in. A later week is a board's
 * roadmap, not a planning that happened, so it is not offered (W.202.1).
 */
export function planningWeeks(data: Pick<WorkboardData, "boards" | "sprints">, live: string): string[] {
  const weekly = new Set(data.boards.filter((b) => weeklySprintChat(b)).map((b) => b.id));
  const weeks = new Set<string>([live]);
  for (const s of data.sprints) if (s.week && s.week <= live && weekly.has(s.board_id)) weeks.add(s.week);
  return [...weeks].sort((a, b) => b.localeCompare(a));
}

/**
 * The boards in planning for a week. A board's next sprint is its sprint in
 * that week by key, or, for a sprint made without one, the active sprint that
 * holds the week's first day; null when it has neither. The active sprints
 * that started before it are the ones Finish planning closes, and a sprint
 * that starts later is never among them.
 */
export function planningBoards<B extends Pick<WorkboardBoard, "id" | "metadata"> = WorkboardBoard>(
  data: { boards: B[]; sprints: SprintRow[] },
  week: string,
): PlanningBoard<B>[] {
  const firstDay = weekWindow(week)?.startsOn ?? "";
  const out: PlanningBoard<B>[] = [];
  for (const board of data.boards) {
    const chat = weeklySprintChat(board);
    if (!chat) continue;
    const own = data.sprints.filter((s) => s.board_id === board.id);
    const active = own.filter((s) => s.status === "active").sort((a, b) => startKey(b).localeCompare(startKey(a)));
    // The fallback is for a sprint made without a week key: a keyed sprint
    // from another week that spans this one (no end date, or a long one) is
    // that week's sprint, not this one's (review of W.202).
    const next = own.find((s) => s.week === week) ?? currentSprint(active.filter((s) => !s.week), firstDay);
    const before = next ? startKey(next) : firstDay;
    out.push({ board, chat, next, ending: active.filter((s) => s.id !== next?.id && startKey(s) < before) });
  }
  return out;
}

/**
 * Whether the board's commitment is locked today: Finish planning locked its
 * next sprint and that sprint has not started. The server's own rule
 * (sprint-lock.ts), so the page offers exactly what setCardSprint accepts; it
 * used to read locked_at alone and refused all week what the server allowed
 * from Wednesday (W.202.2).
 */
export function commitmentLocked(pb: Pick<PlanningBoard, "next">, today: string): boolean {
  return !!pb.next && sprintLockHolds(pb.next, today);
}

/**
 * Whether the board can take a change to its commitment today: it has a next
 * sprint that is still open, and the lock does not hold. The one answer the
 * panel's arrows, the drop targets and the selection bar all read, so a
 * control is never offered whose press can only end in "has no next sprint
 * yet", "is locked" or "is closed" (landInSprint refuses a closed sprint, so a
 * closed one is no next sprint to commit to, W.203).
 */
export function mayChangeCommitment(pb: Pick<PlanningBoard, "next">, today: string): boolean {
  return !!pb.next && pb.next.status !== "closed" && !commitmentLocked(pb, today);
}

/**
 * The cards that may be ticked (W.202.4): those in Not done and Next sprint,
 * and none at all on a week read back. It is also the list the selection is
 * pruned against, so a card that leaves the screen leaves the selection.
 */
export function pickableIds(cards: { id: string; columnId: string }[], editable: boolean): string[] {
  return editable ? cards.filter((c) => c.columnId === "open" || c.columnId === "next").map((c) => c.id) : [];
}

/**
 * The run a Shift-click picks: every card from the last one ticked to this
 * one, in the order the lane shows them. Null when there is no last tick in
 * this lane, and the click is then a plain toggle.
 */
export function pickRun(laneIds: string[], anchor: string | null, id: string): string[] | null {
  const from = anchor ? laneIds.indexOf(anchor) : -1;
  const to = laneIds.indexOf(id);
  if (from < 0 || to < 0) return null;
  return laneIds.slice(Math.min(from, to), Math.max(from, to) + 1);
}

export type PlanningMoves = { toNext: string[]; toOpen: string[]; toDone: string[] };

/**
 * What each verb of the selection bar applies to (W.202.4). Commit takes the
 * selected Not done cards and Back to Not done the selected Next sprint ones,
 * each only on a board that may change its commitment; Mark done takes both,
 * because finishing work is not changing the commitment. Ids no longer on
 * screen are dropped, in screen order.
 */
export function planningMoves(
  selected: Iterable<string>,
  cards: { id: string; board_id: string | null; columnId: string }[],
  canCommit: (boardId: string) => boolean,
): PlanningMoves {
  const picked = new Set(selected);
  const out: PlanningMoves = { toNext: [], toOpen: [], toDone: [] };
  for (const c of cards) {
    if (!picked.has(c.id) || isDonePlanningColumn(c.columnId)) continue;
    out.toDone.push(c.id);
    if (!canCommit(c.board_id ?? "")) continue;
    if (c.columnId === "open") out.toNext.push(c.id);
    else if (c.columnId === "next") out.toOpen.push(c.id);
  }
  return out;
}

/** The done column's window: the seven days before planning, or the chosen week itself. */
export function doneWindow(week: string | null, today: string): { since: string; until: string | null } {
  const w = week ? weekWindow(week) : null;
  return w ? { since: w.startsOn, until: addDays(w.endsOn, 1) } : { since: addDays(today, -7), until: null };
}

/** Which column a card sits in, or null when the view does not show it. */
export function planningColumn(
  card: Pick<WorkboardCard, "status" | "sprint_id" | "completed_at">,
  pb: Pick<PlanningBoard, "next">,
  since: string,
  until: string | null = null,
): PlanningColumn | null {
  // Not Doing is a decision already taken: it has no place in a planning meeting.
  if (isSetAside(card)) return null;
  if (isDone(card)) {
    const at = card.completed_at ?? "";
    return at >= since && (!until || at < until) ? "done" : null;
  }
  return pb.next && card.sprint_id === pb.next.id ? "next" : "open";
}

/** An open card the ending sprint did not finish: the one planning is about. */
export function isCarried(card: Pick<WorkboardCard, "status" | "sprint_id">, pb: Pick<PlanningBoard, "next">): boolean {
  return isOpen(card) && !!card.sprint_id && card.sprint_id !== pb.next?.id;
}

/**
 * Committed cards that would start the sprint already late (W.112): still
 * open, with a due date before the sprint's first day. Committing one as it
 * is puts a date on the week that is red from the first morning, so the page
 * offers to move it into the sprint — an offer, never a rewrite, as the
 * weekend note offers Friday or Monday (W.68).
 */
export function dueBeforeSprint<T extends Pick<WorkboardCard, "status" | "due_date">>(
  cards: T[],
  sprint: { starts_on: string | null } | null,
): T[] {
  const start = sprint?.starts_on;
  if (!start) return [];
  // Overdue as of the sprint's first day, by the board's one rule (A.29.1).
  return cards.filter((c) => isOverdue(c, start));
}
