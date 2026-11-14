import { isCarried, type PlanningBoard } from "./sprint-planning";
import { orderTodoCards } from "./workboard-columns-window";
import type { TaskPriority } from "./types";
import type { WorkboardCard } from "./workboard";

// W.18: the Not done column holds two different things. planningColumn puts
// every open uncommitted card into "open" — the cards the ending sprint did
// not finish, which are what the meeting is about, and the whole backlog
// behind them — and the page sorted them by client, board and creation date,
// so a P1 carried out of last week sat below a P3 filed in June.
//
// The split is here rather than in sprint-planning.ts because it is a reading
// order, not the column rule: planningColumn still answers "open" for both,
// and the column is still called Not done.

const PRIORITY_RANK: Record<TaskPriority, number> = { p1: 0, p2: 1, p3: 2 };

type OpenCard = Pick<WorkboardCard, "status" | "sprint_id" | "priority" | "created_at" | "due_date">;

/**
 * The Not done column in two sections: the carried cards first, P1 before P3
 * and the longest-waiting first inside a priority, then the backlog.
 *
 * The backlog reads the way the board's To do does (W.112): what is due in
 * the next fortnight first, soonest first, then the rest in the order it
 * arrived. It is the board's own rule, not a copy of it, so the two cannot
 * drift. Nothing is dropped: the section used to fold away behind Show (W.18)
 * and Khoa ruled out folds on every Workboard surface; the largest live
 * backlog was 22 cards when that was decided.
 */
export function splitNotDone<T extends OpenCard>(open: T[], pb: PlanningBoard, today: string): { carried: T[]; backlog: T[] } {
  const carried: T[] = [];
  const unordered: T[] = [];
  for (const card of open) (isCarried(card, pb) ? carried : unordered).push(card);
  carried.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.created_at.localeCompare(b.created_at));
  // No sprint ids: a backlog card is in no sprint that has started, so only
  // the Due soon and Backlog groups can come back.
  const backlog = orderTodoCards(unordered, { sprintIds: new Set(), today }).flatMap((g) => g.cards);
  return { carried, backlog };
}
