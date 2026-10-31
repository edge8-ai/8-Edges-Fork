"use client";

import { useCallback, useMemo } from "react";
import type { KanbanColumn } from "@/kernel/ui/KanbanBoard";
import type { Card } from "./board-view-types";
import type { WorkboardMoveState } from "./useWorkboardDrag";
import { columnClasses, columnCounter, foldedColumns } from "./workboard-column-state";
import { todoCardSections } from "./WorkboardTodoSections";
import { doneCardSections } from "./WorkboardDoneSections";
import { laneLabelSlot } from "./lane-label-slot";
import { emptyColumnLabel } from "./workboard-empty";
import { WorkboardColumnHead } from "./WorkboardColumnHead";
import { WorkboardColumnFoot } from "./WorkboardColumnFoot";
import type { SortId } from "./workboard-filter-params";
import type { QuickAdd } from "./useWorkboardQuickAdd";

// Everything the Workboard hands kernel/ui/KanbanBoard about its COLUMNS:
// what each head says, what each foot says, what classes a column wears,
// what it calls its emptiness, how its cards are grouped, and which drops it
// will take.
//
// WorkboardKanban keeps the CARDS — the one WorkboardCard every surface
// draws, its six states, and the drag it is wrapped in. Splitting on that
// line rather than on length is what makes each file readable on its own: a
// question about a column is answered here, and a question about a card is
// answered there.
//
// Every slot below is an OPT-IN prop of the kernel component. Nothing here
// is returned to the kernel's own defaults, so the eight other boards that
// render the same primitive — Deals, Inquiries, Applications, JobReq, the
// marketing calendar, coaching commitments, onboarding cycles, sprint
// planning — draw exactly the columns they drew before.

export function useWorkboardColumnSlots({
  columns,
  cards,
  moveState,
  collapsedColumns,
  phoneColumnId,
  doneColumnIds,
  todoColumnId,
  doneWindowLabel,
  doneGrouped,
  sprintIds,
  today,
  wipLimits,
  manualOrder,
  sort,
  canAdd,
  filtersActive,
  saving,
  quickAdd,
  onReorder,
  onToggleColumn,
  closedColumnIds,
  onShowAllIn,
  onAddCard,
}: {
  columns: KanbanColumn[];
  cards: Card[];
  moveState: WorkboardMoveState;
  collapsedColumns: readonly string[];
  phoneColumnId: string;
  doneColumnIds: ReadonlySet<string>;
  todoColumnId: string | null;
  doneWindowLabel: string | null;
  /** Whether the Done lane draws its "Today" / "Yesterday" groups (W.103.7). */
  doneGrouped: boolean;
  sprintIds: ReadonlySet<string>;
  today: string;
  wipLimits: Map<string, number>;
  manualOrder: boolean;
  sort: SortId;
  canAdd: boolean;
  filtersActive: boolean;
  saving: boolean;
  quickAdd?: QuickAdd;
  onReorder?: (cardId: string, columnId: string, toIndex: number) => void;
  onToggleColumn: (columnId: string) => void;
  /** Done and Not Doing, the lanes drawn by a window (W.139). */
  closedColumnIds: ReadonlySet<string>;
  onShowAllIn: (columnId: string) => void;
  onAddCard: (laneId: string, title?: string) => void;
}) {
  // A column's count, held still while a move is being written (W.49), and
  // which columns the reader has folded to a strip (W.92.4).
  const countFor = useMemo(() => columnCounter(cards, moveState), [cards, moveState]);
  const folded = useMemo(() => foldedColumns(collapsedColumns, columns), [collapsedColumns, columns]);

  // The two columns that read in groups: To do's three (W.94) and, across
  // many boards, Done's two days (W.103.7). One function answers for both, so
  // the render and the drag gate below cannot disagree — a second copy of the
  // rule is how a column comes to say "drag is off" while the drag still
  // works. A column is only sectioned when the builder actually returns
  // groups, which it declines to do when every card falls in one of them, so
  // a small board keeps its within-column drag.
  const sectionsFor = useCallback(
    (col: KanbanColumn, colCards: Card[]) =>
      todoCardSections({ column: col, columnCards: colCards, todoColumnId, sprintIds, today }) ??
      doneCardSections({ column: col, columnCards: colCards, doneColumnIds, grouped: doneGrouped, today }),
    [todoColumnId, doneColumnIds, doneGrouped, sprintIds, today],
  );
  const sectionedColumnIds = useMemo(
    () =>
      new Set(
        columns
          .filter((col) => sectionsFor(col, cards.filter((c) => c.columnId === col.id)) !== null)
          .map((col) => col.id),
      ),
    [columns, cards, sectionsFor],
  );
  const isSectioned = (columnId: string) => sectionedColumnIds.has(columnId);

  return {
    countFor,
    columnCount: (col: KanbanColumn, colCards: Card[]) => countFor(col.id, colCards.length),

    // EVERY column draws the Workboard's own head since W.92.4, because the
    // fold chevron belongs to every column and not only to the ones that
    // claim a WIP limit (W.31). The head still reads "7 / 5" and turns amber
    // where there is a limit, and a bare count where there is not — which is
    // what the kernel's default drew.
    renderColumnHead: (col: KanbanColumn, colCards: Card[]) => (
      <WorkboardColumnHead
        column={col}
        count={countFor(col.id, colCards.length)}
        limit={wipLimits.get(col.id)}
        collapsed={folded.has(col.id)}
        // The done lane alone, and only while the window is actually
        // narrowing it: a narrowed board draws every finished card, so there
        // is nothing for the head to qualify.
        window={closedColumnIds.has(col.id) ? doneWindowLabel ?? undefined : undefined}
        onShowAll={() => onShowAllIn(col.id)}
        showAllLabel={doneColumnIds.has(col.id) ? undefined : "All set aside →"}
        onToggle={() => onToggleColumn(col.id)}
      />
    ),

    // Four states that compose; workboard-column-state.ts says what each one
    // means and why a folded column is only ever a class. A sectioned To do
    // column is in an order of its own, so it says it is sorted, exactly as a
    // column under a sort or a grouping does (W.27).
    columnClassName: (col: KanbanColumn) =>
      columnClasses(col, {
        landedLane: moveState.landedLane,
        manualOrder: manualOrder && !isSectioned(col.id),
        folded,
        phoneColumnId,
      }),

    // Three kinds of nothing read differently (W.47). The kernel keeps its
    // bare default for every other board; the Workboard names the column,
    // because "Nothing in Review" says what the column is for.
    emptyLabel: (col: KanbanColumn) => emptyColumnLabel(col.label, filtersActive),

    // The To do column's three groups (W.94) and Done's two days (W.103.7).
    // Signposts inside one list: nothing here withholds a card, and no column
    // on this board folds.
    //
    // A lane with no labels of its own keeps an empty label's worth of space
    // at its top while any other lane draws one (W.114), so To do's "This
    // sprint" no longer pushes that lane's first card below its neighbours'.
    // `isSectioned` still reads the real groups, so the lane keeps its
    // drag-to-reorder.
    cardSections: (col: KanbanColumn, colCards: Card[]) =>
      sectionsFor(col, colCards) ?? (sectionedColumnIds.size > 0 && colCards.length > 0 ? laneLabelSlot(col.id, colCards) : null),

    // The sorted note and the way to add a card; WorkboardColumnFoot says why
    // each of the three reasons a column cannot be reordered reads
    // differently, and why the two figures that used to sit here were cut.
    columnFooter:
      canAdd || !manualOrder || sectionedColumnIds.size > 0
        ? (col: KanbanColumn, colCards: Card[]) => (
            <WorkboardColumnFoot
              laneId={col.id}
              cardCount={colCards.length}
              canAdd={canAdd}
              manualOrder={manualOrder}
              sectioned={isSectioned(col.id)}
              sort={sort}
              saving={saving}
              quickAdd={quickAdd}
              onAddCard={onAddCard}
            />
          )
        : undefined,

    // A drop inside the sectioned To do column would write the index the drag
    // library counted down the sections, which is not the manual rank the
    // server keeps — so that one column takes no reorder, and every other
    // column is untouched.
    onReorder:
      onReorder &&
      ((cardId: string, columnId: string, toIndex: number) => {
        if (isSectioned(columnId)) return;
        onReorder(cardId, columnId, toIndex);
      }),
  };
}
