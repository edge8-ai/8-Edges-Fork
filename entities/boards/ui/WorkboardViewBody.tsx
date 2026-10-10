"use client";

import type { EpicRow } from "@/entities/boards/lib/types";
import type { WorkboardBoard, WorkboardData } from "@/entities/boards/lib/workboard";
import type { Card, RunAction } from "./board-view-types";
import type { CardQuickActions } from "./useWorkboardCardActions";
import type { WorkboardFilters } from "./useWorkboardFilters";
import type { WorkboardMoveState } from "./useWorkboardDrag";
import type { useWorkboardGrouping } from "./useWorkboardGrouping";
import type { BoardAttention } from "./useBoardAttention";
import type { QuickAdd } from "./useWorkboardQuickAdd";
import { WorkboardKanban } from "./WorkboardKanban";
import { WorkboardList } from "./WorkboardList";
import { WorkboardCalendar } from "./WorkboardCalendar";
import { useBoardColumnRules } from "./useBoardColumnRules";

// Whichever of the three renderers the view names, and what each one needs.
//
// Split out of WorkboardStories.tsx, which had grown past the file-size cap
// holding two different jobs: the PAGE (its class, its toolbar, the notes
// above the board) and the CHOICE OF RENDERER. This file is the second. The
// lane rules live here rather than one level up because only the renderers
// read them — the toolbar and the notes have no use for which column is Done.
//
// There are three since W.97.5, not five: Calendar, Timeline and Schedule
// answered the same question three ways and none of them well. W.109 settled
// which one survives — the Schedule's bars were drawn from a start date the
// data does not have, so it went and the Calendar came back as an agenda of
// the one real date a card carries.
export function WorkboardViewBody({
  data,
  f,
  grouped,
  attention,
  boardById,
  single,
  sprintName,
  epicById,
  viewerPersonId,
  hideInternal,
  hideClient,
  inFlight,
  moveState,
  canMove,
  canAdd,
  canEdit,
  saving,
  run,
  wipLimits,
  selectedCardId,
  quick,
  quickAdd,
  mayMove,
  onOpenCard,
  onMoveLane,
  onAddCard,
  onNewCardDue,
}: {
  data: WorkboardData;
  f: WorkboardFilters;
  grouped: ReturnType<typeof useWorkboardGrouping>;
  /** What moved since this reader last looked (W.63) and how far Done reaches (W.94). */
  attention: BoardAttention;
  boardById: Map<string, WorkboardBoard>;
  single: WorkboardBoard | null;
  sprintName: Map<string, string>;
  epicById: Map<string, EpicRow>;
  viewerPersonId: string | null;
  hideInternal: boolean;
  hideClient: boolean;
  inFlight: number;
  /** Which lane moves are in flight or failed, for the card treatment (W.49). */
  moveState: WorkboardMoveState;
  canMove: boolean | "own";
  canAdd: boolean;
  canEdit: boolean;
  saving: boolean;
  run: RunAction;
  /** Column id → the cards that column aims to hold at once (W.31). */
  wipLimits: Map<string, number>;
  /** The card the keyboard is on (W.32). */
  selectedCardId: string | null;
  /** Assignee and due date, editable on the card itself (W.30). */
  quick?: CardQuickActions;
  /** A card written at the foot of a column, with no drawer (W.92.8). */
  quickAdd?: QuickAdd;
  mayMove: (card: Card) => boolean;
  onOpenCard: (card: Card) => void;
  onMoveLane: (cardId: string, laneId: string) => void;
  /** Open the full card drawer in this lane, optionally prefilled with a title (W.92.8). */
  onAddCard: (laneId: string, title?: string) => void;
  /** Open the card drawer for a new card already due on this day (the Calendar, W.175). */
  onNewCardDue: (dueDate: string) => void;
}) {
  // Which lane is Done, which is To do, what Done leaves off the board and
  // where the rest of it is (W.94). useBoardColumnRules says why each.
  const { doneColumnIds, closedColumnIds, todoColumnId, boardCards, showAllIn } = useBoardColumnRules({
    data,
    cards: grouped.cards,
    grouping: grouped.grouping,
    attention,
    f,
  });

  if (f.view === "calendar") {
    // The one date view (W.109). It reads the cards the filters left, and it
    // keeps them all: the Done window is a statement about a COLUMN (W.94),
    // and the calendar drops finished work by its own rule instead — unless
    // the reader's lane filter names a done lane, which is them asking for it.
    // That is the rule the Schedule set in W.97.3, and it is set from the same
    // place here so the two views could never have disagreed.
    //
    // It offers no edit. The Schedule let a bar be dragged to a new due date;
    // an agenda row has no track to drag along, and clicking a row opens the
    // card, where the date field already is.
    return (
      <WorkboardCalendar
        data={data}
        cards={grouped.cards}
        monthShift={f.monthShift}
        includeDone={f.laneFilter.some((id) => closedColumnIds.has(id))}
        onShiftMonths={f.setMonthShift}
        onCardClick={onOpenCard}
        // The undated line (W.105). One commit, like the Done head's
        // "All done → List" (W.94) and for the same reason: two calls would
        // each start from the state this render closed over and the second
        // would undo the first.
        //
        // It moves to the List, because the question the line raises —
        // "these have no date" — is answered by editing them, and the List is
        // where a set of cards is worked through. It narrows by nothing else:
        // the Calendar groups by DAY rather than by board or epic, so an
        // undated card belongs to no group it could be scoped to, and adding
        // a filter nobody asked for would hide cards that were counted.
        onShowUndated={() => f.apply({ undated: true, view: "list" })}
        onNewCardDue={canAdd ? onNewCardDue : undefined}
      />
    );
  }

  if (f.view === "list") {
    return (
      <WorkboardList
        data={data}
        cards={grouped.cards}
        canEdit={canEdit}
        filtersActive={f.filtersActive}
        saving={saving}
        run={run}
        onOpen={onOpenCard}
      />
    );
  }

  return (
    <WorkboardKanban
      columns={grouped.columns}
      cards={boardCards}
      boardById={boardById}
      single={single}
      viewerPersonId={viewerPersonId}
      sprintFilter={f.sprintFilter}
      sprintName={sprintName}
      epicById={epicById}
      hideInternal={hideInternal}
      hideClient={hideClient}
      disabled={inFlight > 0 || canMove === false}
      moveState={moveState}
      // The per-column add button creates a card IN that column, which only
      // means a lane; under any other grouping the New card button in the
      // toolbar is the way in.
      canAdd={canAdd && grouped.grouping === "lane"}
      filtersActive={f.filtersActive}
      attention={attention}
      // Both columns' rules are statements about a LANE (W.94), so both are
      // offered only when the columns ARE the lanes. Under a grouping by
      // priority or person the "P1" column is not a done column and "this
      // sprint's finished work" would mean nothing there.
      doneColumnIds={doneColumnIds}
      todoColumnId={todoColumnId}
      closedColumnIds={closedColumnIds}
      onShowAllIn={showAllIn}
      sort={f.sort}
      manualOrder={grouped.manualOrder}
      wipLimits={wipLimits}
      // Which columns the reader folded, and the one way to fold one (W.92.4).
      // Both come from the filter hook, so the fold is in the address bar with
      // the view, the grouping and the sort — one codec.
      collapsedColumns={f.collapsed}
      onToggleColumn={f.toggleCollapsed}
      selectedCardId={selectedCardId}
      saving={saving}
      quick={quick}
      quickAdd={quickAdd}
      mayMove={mayMove}
      onMove={grouped.onMove}
      onReorder={grouped.onReorder}
      onCardClick={onOpenCard}
      onAddCard={onAddCard}
    />
  );
}
