"use client";

import { memo } from "react";

import type { BoardPerson } from "@/entities/boards/lib/data";
import type { EpicRow } from "@/entities/boards/lib/types";
import type { WorkboardBoard } from "@/entities/boards/lib/workboard";
import { WorkboardCard } from "./WorkboardCard";
import { WorkboardSubtasksList, WorkboardSubtasksToggle, useWorkboardCardSubtasks } from "./WorkboardCardSubtasks";
import type { Card } from "./board-view-types";
import type { CardQuickActions } from "./useWorkboardCardActions";
import type { WorkboardMoveState } from "./useWorkboardDrag";
import type { BoardSelection } from "./useBoardSelection";
import { WorkboardCardTick } from "./WorkboardCardTick";

/**
 * What one draggable on the Workboard holds: the tick box, the card, and the
 * refusal when a move of it failed.
 *
 * All three are THIS BOARD'S, which is why they are wrapped around
 * WorkboardCard rather than put inside it. WorkboardCard is the one card
 * design every surface renders (WB-01) — sprint planning, My Week, the
 * portal — and none of those has a selection bar or an optimistic move to
 * refuse. Keeping them out here is what stops the shared card growing props
 * that only one surface ever passes.
 *
 * Split out of WorkboardKanban.tsx for the size gate: that file decides what
 * the BOARD does (columns, counts, limits, the drag contract) and this one
 * what a card on it looks like.
 */
function WorkboardKanbanCardInner({
  card,
  board,
  showBoard,
  viewerPersonId,
  sprintFilter,
  sprintName,
  epicById,
  hideInternal,
  hideClient,
  quick,
  selection,
  moveState,
}: {
  card: Card;
  board: WorkboardBoard | undefined;
  showBoard: boolean;
  viewerPersonId: string | null;
  sprintFilter: string;
  sprintName: Map<string, string>;
  epicById: Map<string, EpicRow>;
  hideInternal: boolean;
  hideClient: boolean;
  /** Assignee and due date, editable on the card itself (W.30). */
  quick?: CardQuickActions;
  /** The selection bar's ticked set (W.70); null when the bar is not offered. */
  selection: BoardSelection | null;
  moveState: WorkboardMoveState;
}) {
  const failure = moveState.failures[card.id];
  const subtasks = useWorkboardCardSubtasks(
    card.id,
    card.subtasks,
    quick ? (subtaskId, done, onFail) => quick.onToggleSubtask(card.id, subtaskId, done, onFail) : undefined,
  );
  return (
    <>
      {/* The board's selection checkbox (W.70), the same control the planning
          page has carried since W.22 and in the same place — but revealed by
          hover, focus, a tick anywhere or a long press rather than drawn on
          every card at rest (W.93). WorkboardCardTick says why. */}
      {selection && <WorkboardCardTick cardId={card.id} title={card.title} selection={selection} />}
      <WorkboardCard
        card={card}
        board={board}
        showBoard={showBoard}
        viewerPersonId={viewerPersonId}
        sprintFilter={sprintFilter}
        sprintName={sprintName}
        epicById={epicById}
        hideInternal={hideInternal}
        hideClient={hideClient}
        // The progress is this board's own control, in the facts row where
        // the plain count sits elsewhere, so the card does not print `☑ 3/9`
        // twice (W.92.7) and a parent is no taller than its neighbours (W.114).
        // The count and the tally both come from the subtasks hook, which
        // leaves set-aside rows out of each (bug hunt F15).
        subtaskControl={card.subtasks.length > 0 ? <WorkboardSubtasksToggle state={subtasks} cardTitle={card.title} /> : undefined}
        quick={quick}
      />
      {/* The subtasks, inline and collapsed (W.92.7). The list lives out here
          for the same reason the tick box and the refusal do: WorkboardCard is
          the one card design every surface renders (WB-01), and sprint
          planning, My Week and the portal have nowhere to expand into. */}
      <WorkboardSubtasksList state={subtasks} subtasks={card.subtasks} saving={quick?.saving ?? false} />
      {/* The refusal belongs on the card that was refused. A banner at the top
          of a tall board is off-screen from the card that jumped back, which
          is how a failed move came to look like the card moving itself
          (W.49). The clicks stop here so neither button opens the drawer. */}
      {failure && (
        <div className="wb-card-error" role="alert" onClick={(e) => e.stopPropagation()}>
          <span className="wb-card-error-text">Couldn&apos;t move: {failure.message}</span>
          <button type="button" className="wb-card-error-btn" onClick={() => moveState.retry(card.id)}>
            Retry
          </button>
          <button type="button" className="wb-card-error-btn" onClick={() => moveState.dismiss(card.id)}>
            Dismiss
          </button>
        </div>
      )}
    </>
  );
}

/**
 * MEMOISED (W.103.6).
 *
 * The board draws up to 435 of these at once, and nothing about it was
 * memoised: any state change anywhere on the surface re-rendered every card.
 * Measured on the real board at 1728x1000 — flipping the density toggle, whose
 * only DOM effect is one class on `.wb-page`, cost 543ms, of which the
 * browser's own layout and paint of that class was 33ms. The other ~510ms was
 * React walking 435 cards to produce identical output.
 *
 * WHY THE DEFAULT COMPARISON IS ENOUGH. Every prop here is already stable
 * across a render that does not concern this card: `card` and `board` are rows
 * out of the loader, `sprintName`, `epicById` and `boardById` are memoised in
 * useWorkboardLookups, `quick` in useWorkboardCardActions, `moveState` in
 * useWorkboardDrag, and `selection` — the last one that was not — in
 * useBoardSelection as of this change. Miss any one of them and this memo
 * silently does nothing, which is why they are listed rather than assumed.
 *
 * WHAT THIS IS NOT. It is not virtualisation. The DOM still holds every card,
 * so the board is still ~1,900 focusable elements and ~539 tab stops before
 * the second column; only a windowed list fixes that, and it needs the drag
 * library's virtual mode and a dependency, across a contract nine surfaces
 * share. That is its own card and its own decision.
 */
export const WorkboardKanbanCard = memo(WorkboardKanbanCardInner);
