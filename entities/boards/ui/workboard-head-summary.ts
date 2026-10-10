import type { WorkboardData } from "@/entities/boards/lib/workboard";
import { activeSprintStart } from "@/entities/boards/lib/workboard-columns-window";
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
 * The week the company is in, as the boards in scope see it: the week of the
 * sprint we are IN, by the rule the Done window already uses
 * (`activeSprintStart`) — the latest active sprint that has already begun.
 *
 * It used to be the newest week among ALL active sprints, and on 2026-10-07
 * the header said "2026-W45" in week 41. Nothing closes a finished sprint, so
 * 43 were "active", and one client's board had planned its sprints ahead,
 * through a W45 go-live, each marked active from the start. The newest of those
 * is the furthest in the future, never the week anybody is working in. A
 * sprint that has not begun cannot be the one we are in; sprints made before
 * SW-01 carry no week and simply do not vote.
 */
function currentSprintWeek(data: WorkboardData, today: string): string | null {
  const start = activeSprintStart(data.sprints, today);
  if (!start) return null;
  const weeks = data.sprints
    .filter((s) => s.status === "active" && s.starts_on === start)
    .map((s) => s.week)
    .filter((w): w is string => !!w);
  return weeks.length === 0 ? null : weeks.sort((a, b) => b.localeCompare(a))[0];
}
