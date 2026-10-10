import type { TaskPriority } from "@/entities/boards/lib/types";
import type { ActionResult } from "./board-view-types";
import { NO_GROUP, UNASSIGNED, groupDropField } from "./workboard-grouping";
import type { GroupingId } from "./workboard-filter-params";

// What a drop into a grouped column WRITES. The read path for grouping is a
// remap of two lines; this is the expensive half, and it is kept as a pure
// function over the entity's own actions so a test can prove, without a
// browser, that dropping into the "Commerce & Billing" column writes the epic
// and not the lane, the sprint or nothing at all.

export type GroupDropActions = {
  setEpic: (cardId: string, epicId: string | null, boardSlug: string) => Promise<ActionResult>;
  setSprint: (cardId: string, sprintId: string | null, boardSlug: string) => Promise<ActionResult>;
  update: (
    cardId: string,
    patch: { priority?: string; assigneeId?: string | null },
    boardSlug: string,
  ) => Promise<ActionResult>;
};

/**
 * The write a drop into `toGroupId` performs, or null when this grouping's
 * columns are not drop targets at all (the lanes, which go through the board's
 * own cross-lane move, and the client, which a card inherits from its board).
 *
 * The synthetic column ids clear the field rather than failing: dropping onto
 * "No epic" or "Backlog" or "Unassigned" is a legitimate thing to mean, and it
 * is the only way to take a card back out of a group by dragging.
 */
export function groupDropWrite(
  grouping: GroupingId,
  cardId: string,
  toGroupId: string,
  boardSlug: string,
  a: GroupDropActions,
): (() => Promise<ActionResult>) | null {
  switch (groupDropField(grouping)) {
    case "epic":
      return () => a.setEpic(cardId, toGroupId === NO_GROUP ? null : toGroupId, boardSlug);
    case "sprint":
      return () => a.setSprint(cardId, toGroupId === NO_GROUP ? null : toGroupId, boardSlug);
    case "assignee":
      return () => a.update(cardId, { assigneeId: toGroupId === UNASSIGNED ? null : toGroupId }, boardSlug);
    case "priority":
      return () => a.update(cardId, { priority: toGroupId as TaskPriority }, boardSlug);
    default:
      return null;
  }
}
