"use client";

import type { ReactNode } from "react";
import { orderTodoCards, TODO_GROUP_LABEL } from "@/entities/boards/lib/workboard-columns-window";
import type { KanbanColumn } from "@/kernel/ui/KanbanBoard";
import type { Card } from "./board-view-types";

/**
 * The To do column, ordered and signposted (W.94).
 *
 * NOTHING IS HIDDEN. Every card the filters drew is still in the column, in
 * one of three groups, and the label between them is a line of text — not a
 * button, not a chevron, nothing to open. That is the whole difference from
 * the fold this card removed: a reader can see the bottom of the column by
 * scrolling to it, and never has to wonder what is behind a door.
 *
 * Returning null leaves the column as one plain list, which is what every
 * other column gets and what a To do column whose cards all fall in one
 * group gets too — one group needs no label to tell it from the others.
 *
 * The order is the SECTIONS' order, so it survives the board's own ordering
 * without touching it. What it costs is the within-column drag: the drag
 * library numbers a column's children top to bottom, and those numbers no
 * longer match the manual rank the drop would write. WorkboardKanban refuses
 * a reorder in a sectioned column for that reason, and the column says it is
 * sorted, exactly as it does under a sort or a grouping (W.27).
 */
export function todoCardSections({
  column,
  columnCards,
  todoColumnId,
  sprintIds,
  today,
}: {
  column: KanbanColumn;
  columnCards: Card[];
  /** The column the sections belong to; null under any grouping but the lanes. */
  todoColumnId: string | null;
  sprintIds: ReadonlySet<string>;
  today: string;
}): { key: string; heading: ReactNode; cards: Card[] }[] | null {
  if (todoColumnId === null || column.id !== todoColumnId) return null;
  const groups = orderTodoCards(columnCards, { sprintIds, today });
  if (groups.length < 2) return null;
  return groups.map((g) => ({
    key: g.key,
    heading: <span className="admin-kanban-col-section-label">{TODO_GROUP_LABEL[g.key]}</span>,
    cards: g.cards,
  }));
}
