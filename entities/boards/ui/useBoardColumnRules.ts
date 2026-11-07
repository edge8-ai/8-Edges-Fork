"use client";

import { useCallback, useMemo } from "react";
import { cardsDrawnOnBoard } from "@/entities/boards/lib/workboard-columns-window";
import type { WorkboardData } from "@/entities/boards/lib/workboard";
import type { Card } from "./board-view-types";
import type { BoardAttention } from "./useBoardAttention";
import type { WorkboardFilters } from "./useWorkboardFilters";
import { closedLaneIds, doneLaneIds } from "./workboard-column-state";

// The two lanes with a rule of their own (W.94), and what those rules do to
// the cards the board draws.
//
// It is a hook rather than four lines in WorkboardStories because all four
// answers are the same decision seen from different sides — which lane is
// Done, which is To do, what Done leaves off, and where the rest of Done
// is — and because WorkboardStories is the page, not the policy.
//
// EVERY RULE HERE IS OFF UNDER ANY GROUPING BUT THE LANES. "This sprint's
// finished work" and "committed, due soon, backlog" are statements about a
// done column and a to do column; the "P1" column is neither.

export type BoardColumnRules = {
  doneColumnIds: ReadonlySet<string>;
  /** Done and Not Doing: the lanes the board draws by a window (W.139). */
  closedColumnIds: ReadonlySet<string>;
  /** The to do lane, whose cards read in three groups; null under any other grouping. */
  todoColumnId: string | null;
  /** The cards the BOARD draws — every view but the kanban keeps the full set. */
  boardCards: Card[];
  /** Take the reader to every card of a windowed lane, in the List view. */
  showAllIn: (columnId: string) => void;
};

export function useBoardColumnRules({
  data,
  cards,
  grouping,
  attention,
  f,
}: {
  data: WorkboardData;
  /** The cards the filters and the grouping have already settled. */
  cards: Card[];
  grouping: string;
  attention: BoardAttention;
  f: WorkboardFilters;
}): BoardColumnRules {
  const laneGrouping = grouping === "lane";

  const doneColumnIds = useMemo(() => doneLaneIds(grouping, data.lanes), [grouping, data.lanes]);
  const closedColumnIds = useMemo(() => closedLaneIds(grouping, data.lanes), [grouping, data.lanes]);

  // The FIRST lane that is not a done one. Every board seeds the same four
  // columns in the same order, so this is "To do" — and naming it by position
  // rather than by the string "To do" keeps a board that renamed its first
  // column working.
  const todoColumnId = useMemo(
    () => (laneGrouping ? data.lanes.find((l) => !l.isDone && !l.isNotDoing)?.id ?? null : null),
    [laneGrouping, data.lanes],
  );

  // What the BOARD draws, as opposed to what the page knows. Only the kanban
  // takes this: the List view and the Calendar keep every card the filters
  // left, which is what makes "All done → List" an answer
  // rather than another dead end.
  const boardCards = useMemo(
    () => cardsDrawnOnBoard(cards, { doneColumnIds: closedColumnIds, windowStart: attention.doneWindowStart }),
    [cards, closedColumnIds, attention.doneWindowStart],
  );

  // ONE commit, because two in a row would each start from the state this
  // render closed over and the second would undo the first.
  // A done lane opens every done lane, as it always has; a Not Doing lane
  // opens itself, since "All done" would be the wrong list.
  const showAllIn = useCallback(
    (columnId: string) => f.apply({ view: "list", lane: doneColumnIds.has(columnId) ? [...doneColumnIds] : [columnId] }),
    [f, doneColumnIds],
  );

  return { doneColumnIds, closedColumnIds, todoColumnId, boardCards, showAllIn };
}
