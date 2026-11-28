"use client";

import type { ReactNode } from "react";
import { DONE_GROUP_LABEL, groupDoneCards } from "@/entities/boards/lib/workboard-columns-window";
import type { KanbanColumn } from "@/kernel/ui/KanbanBoard";
import type { Card } from "./board-view-types";

/**
 * The Done lane on a many-board Workboard, in two days (W.103.7).
 *
 * DONE STAYS A LANE. It is not folded, there is no accordion and there is no
 * "show N older" — Dave and Operations finish work by dragging a card into
 * this column, and a column you cannot drop into is not a column. What
 * changed is only how far back the lane is DRAWN: today and yesterday, with a
 * plain label over each day, exactly the mechanism To do uses for "This
 * sprint / Due soon / Backlog".
 *
 * Returning null leaves the lane as one plain list — which is what a single
 * board gets, what a narrowed board gets, and what a day's-worth lane gets
 * when everything in it finished on the same day.
 *
 * Like To do's sections, an ordered column costs the within-column drag: the
 * drag library numbers a column's children top to bottom and those numbers no
 * longer match the manual rank a drop would write, so the lane refuses a
 * reorder and says it is sorted (W.27). Dropping a card IN from another
 * column is untouched, which is the move that matters here.
 */
export function doneCardSections({
  column,
  columnCards,
  doneColumnIds,
  grouped,
  today,
}: {
  column: KanbanColumn;
  columnCards: Card[];
  doneColumnIds: ReadonlySet<string>;
  /** Whether the day groups apply at all on this board, in this view. */
  grouped: boolean;
  today: string;
}): { key: string; heading: ReactNode; cards: Card[] }[] | null {
  if (!grouped || !doneColumnIds.has(column.id)) return null;
  const groups = groupDoneCards(columnCards, { today });
  if (groups.length < 2) return null;
  return groups.map((g) => ({
    key: g.key,
    heading: <span className="admin-kanban-col-section-label">{DONE_GROUP_LABEL[g.key]}</span>,
    cards: g.cards,
  }));
}
