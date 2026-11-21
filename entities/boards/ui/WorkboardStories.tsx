"use client";

import { useMemo } from "react";
import type { BoardPerson } from "@/entities/boards/lib/data";
import type { EpicRow } from "@/entities/boards/lib/types";
import type { WorkboardBoard, WorkboardData } from "@/entities/boards/lib/workboard";
import type { Card, RunAction } from "./board-view-types";
import type { CardQuickActions } from "./useWorkboardCardActions";
import type { WorkboardFilters } from "./useWorkboardFilters";
import type { WorkboardMoveState } from "./useWorkboardDrag";
import type { useWorkboardGrouping } from "./useWorkboardGrouping";
import type { BoardAttention } from "./useBoardAttention";
import type { CardTemplate } from "@/entities/boards/lib/card-templates";
import { WorkboardToolbar } from "./WorkboardToolbar";
import { WorkboardPageNotes } from "./WorkboardPageNotes";
import { WorkboardViewBody } from "./WorkboardViewBody";
import { filterControlDefs } from "./workboard-filter-controls";
import type { GroupingId, ViewId } from "./workboard-filter-params";
import type { QuickAdd } from "./useWorkboardQuickAdd";

// The stories tab's PAGE: the page class the whole skin hangs off, the one
// toolbar, and what the board is showing in words. Which renderer the view
// names is WorkboardViewBody.tsx, and Workboard.tsx above keeps the state,
// the mutations and the drawers.
//
// It holds no layout of its own since W.89 removed the filter rail: the board
// is the width of the page on every surface, and the filters are controls in
// the toolbar rather than a column beside it.
export function WorkboardStories({
  data,
  f,
  grouped,
  attention,
  views,
  groupings,
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
  canManage,
  extras,
  boardBase,
  saving,
  run,
  wipLimits,
  selectedCardId,
  quick,
  quickAdd,
  mayMove,
  onNewCard,
  onBanner,
  onOpenDrawer,
  onOpenCard,
  onMoveLane,
  onAddCard,
  onNewCardDue,
}: {
  data: WorkboardData;
  f: WorkboardFilters;
  grouped: ReturnType<typeof useWorkboardGrouping>;
  /**
   * What moved since this reader last looked (W.63), what they have ticked
   * (W.70) and how far back the Done column reaches (W.94).
   */
  attention: BoardAttention;
  views: ViewId[];
  groupings: GroupingId[];
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
  canManage: boolean;
  extras: boolean;
  boardBase: string;
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
  onNewCard: (template?: CardTemplate) => void;
  onBanner: (message: string | null) => void;
  onOpenDrawer: (drawer: "sprints" | "archived" | "settings") => void;
  onOpenCard: (card: Card) => void;
  onMoveLane: (cardId: string, laneId: string) => void;
  /** Open the full card drawer in this lane, optionally prefilled with a title (W.92.8). */
  onAddCard: (laneId: string, title?: string) => void;
  /** Open the card drawer for a new card already due on this day (the Calendar, W.175). */
  onNewCardDue: (dueDate: string) => void;
}) {
  const defs = useMemo(() => filterControlDefs(data, f), [data, f]);
  return (
    // The Workboard's page class (W.33). Every rule of the skin is scoped
    // under it, so the eight other surfaces that render the same kanban
    // primitive — Deals, Inquiries, Applications, JobReq, the marketing
    // calendar, coaching commitments, onboarding cycles, sprint planning —
    // are untouched, exactly as the coaching board's .coach-page did it in
    // PR #1403. kernel/ui/KanbanBoard.tsx is not changed by any of it.
    // Opting in is exactly this: a class only this file writes.
    //
    // It used to carry a density too — `is-comfortable` / `is-compact`, from
    // W.92.3. Compact was removed in W.103.13 (Khoa: "that compact thing is
    // completely useless"), and it had stopped earning its place anyway: it
    // saved 14% of a card's height by tightening whitespace, and after
    // W.103.12 the whitespace is the point.
    <div className="wb-page">
      <WorkboardToolbar
        data={data}
        f={f}
        defs={defs}
        groupings={groupings}
        views={views}
        canAdd={canAdd}
        extras={extras}
        canManage={canManage}
        boardBase={boardBase}
        selection={attention.canSelect ? attention.selection : null}
        onNewCard={onNewCard}
        onOpen={onOpenDrawer}
      />
      {/* What the board is showing, what changed and what the sprint is
          for — each absent unless it has something to say. */}
      <WorkboardPageNotes
        data={data}
        f={f}
        cards={grouped.cards}
        attention={attention}
        canAdd={canAdd}
        saving={saving}
        onNewCard={onNewCard}
        onBanner={onBanner}
      />
      <WorkboardViewBody
        data={data}
        f={f}
        grouped={grouped}
        attention={attention}
        boardById={boardById}
        single={single}
        sprintName={sprintName}
        epicById={epicById}
        viewerPersonId={viewerPersonId}
        hideInternal={hideInternal}
        hideClient={hideClient}
        inFlight={inFlight}
        moveState={moveState}
        canMove={canMove}
        canAdd={canAdd}
        canEdit={canEdit}
        saving={saving}
        run={run}
        wipLimits={wipLimits}
        selectedCardId={selectedCardId}
        quick={quick}
        quickAdd={quickAdd}
        mayMove={mayMove}
        onOpenCard={onOpenCard}
        onMoveLane={onMoveLane}
        onAddCard={onAddCard}
        onNewCardDue={onNewCardDue}
      />
    </div>
  );
}
