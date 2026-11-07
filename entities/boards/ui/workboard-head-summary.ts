import type { WorkboardData } from "@/entities/boards/lib/workboard";
import { currentSprintByBoard } from "@/entities/boards/lib/current-sprint";
import { saigonToday } from "@/kernel/config/dates";

/**
 * The Workboard page's one quiet line (W.92.5).
 *
 * It replaces a subtitle that had grown into a paragraph — "N cards across M
 * boards. Filter by client or person, drag to move, add a card to any board."
 * The second sentence was a tutorial printed on every load for people who
 * open this page every day, and the controls it described are all visible in
 * the toolbar three inches below it. What is left is the scope: what am I
 * looking at, how wide is it, and which week is this.
 *
 * Every part has to earn its place (the playbook's rule of the same name):
 *
 *  - the CARD COUNT and the BOARD COUNT answer "is this the whole company or
 *    a corner of it", which is the question a person arriving at a page
 *    called Workboard is actually asking, and it is the number the filters
 *    then move;
 *  - the SPRINT WEEK is the one piece of time the rest of the company talks
 *    in, so it says which week's board this is without opening a sprint.
 *
 * Nothing here is sliced by a person, and nothing is a total that describes
 * how much anybody did.
 */
export function workboardHeadSummary(data: WorkboardData, today: string = saigonToday()): string {
  const cards = data.cards.length;
  const boards = data.boards.length;
  const parts = [
    `${cards} ${cards === 1 ? "card" : "cards"}`,
    `${boards} ${boards === 1 ? "board" : "boards"}`,
  ];
  const week = currentSprintWeek(data, today);
  if (week) parts.push(week);
  return parts.join(" · ");
}

/**
 * The week the company is in, as the boards in scope see it: the week of each
 * board's current sprint (current-sprint.ts, which records the 2026-10-07 "W45
 * in week 41" incident), the newest of them winning. Sprints made before SW-01
 * carry no week and simply do not vote.
 */
function currentSprintWeek(data: WorkboardData, today: string): string | null {
  const weeks = [...currentSprintByBoard(data.sprints, today).values()].map((s) => s.week).filter((w): w is string => !!w);
  return weeks.length === 0 ? null : weeks.sort((a, b) => b.localeCompare(a))[0];
}
