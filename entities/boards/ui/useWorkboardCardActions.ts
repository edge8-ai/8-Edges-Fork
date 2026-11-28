"use client";

import { useMemo } from "react";
import { toggleSubtask, updateCard } from "@/entities/boards/lib/actions";
import type { BoardPerson } from "@/entities/boards/lib/data";
import type { WorkboardBoard, WorkboardData } from "@/entities/boards/lib/workboard";
import type { Card, RunAction } from "./board-view-types";
import type { GroupingId } from "./workboard-filter-params";
import { useWorkboardKeys } from "./useWorkboardKeys";
import { useWorkboardQuickAdd, type QuickAdd } from "./useWorkboardQuickAdd";

/** The two edits a card offers in place, when the viewer may make them (W.30). */
export type CardQuickActions = {
  people: BoardPerson[];
  saving: boolean;
  onAssignee: (cardId: string, personId: string | null) => void;
  onDueDate: (cardId: string, date: string | null) => void;
  /**
   * Tick a subtask from the card's inline expander (W.92.7) — the same
   * toggleSubtask the card drawer calls, so a box ticked on the board and the
   * same box ticked in the drawer cannot write different things.
   */
  onToggleSubtask: (cardId: string, subtaskId: string, done: boolean, onFail?: () => void) => void;
};

/**
 * What the board lets you do to a card WITHOUT opening it: the two in-place
 * edits (W.30), the work-in-progress limits the columns are showing (W.31),
 * the keyboard (W.32), the subtask boxes on the card itself (W.92.7) and
 * writing a new card at the foot of a column (W.92.8).
 *
 * They came in over five cards and are one idea — reaching a card, or making
 * one, takes fewer steps than it did — so they are derived in one place
 * rather than five blocks in Workboard.tsx, which is what pushed that file
 * past its cap.
 * Workboard still owns the state; this owns the shape the board is handed.
 */
export function useWorkboardCardActions({
  data,
  boardById,
  cards,
  grouping,
  single,
  sprintFilter,
  epicFilter,
  canEdit,
  canAdd,
  canMove,
  viewerPersonId,
  keysEnabled,
  saving,
  run,
  onNewCard,
  onOpenCard,
}: {
  data: WorkboardData;
  boardById: Map<string, WorkboardBoard>;
  /** The cards on screen, in the order they are drawn. */
  cards: Card[];
  grouping: GroupingId;
  /** The one board in scope, or null across boards. */
  single: WorkboardBoard | null;
  /** The sprint and the epics the board is filtered to, which a new card inherits (W.92.8). */
  sprintFilter: string;
  epicFilter: string[];
  canEdit: boolean;
  canAdd: boolean;
  /** Drag between lanes: every card, only the viewer's own, or none. */
  canMove: boolean | "own";
  viewerPersonId: string | null;
  /** Off while a drawer is open — those own their own keys, Esc included. */
  keysEnabled: boolean;
  saving: boolean;
  run: RunAction;
  onNewCard: () => void;
  onOpenCard: (card: Card) => void;
}): {
  quick: CardQuickActions | undefined;
  /** Writing a card straight into a column, with no drawer (W.92.8). */
  quickAdd: QuickAdd | undefined;
  wipLimits: Map<string, number>;
  selectedCardId: string | null;
  mayMove: (card: Card) => boolean;
} {
  // Adding a card without opening anything belongs to the same idea as the
  // two in-place edits: reaching a card, or making one, takes fewer steps
  // than it did. Offered under the lanes only, for the same reason the add
  // button is — a create that landed in the "P1" column without setting P1
  // would be a lie.
  const quickAdd = useWorkboardQuickAdd({ single, canAdd: canAdd && grouping === "lane", sprintFilter, epicFilter, run });
  // The same updateCard the List view's cells call, so a change made on the
  // board and the same change made in the list cannot mean different things.
  const quick = useMemo<CardQuickActions | undefined>(() => {
    if (!canEdit) return undefined;
    const slugOf = (cardId: string) => boardById.get(data.cards.find((c) => c.id === cardId)?.board_id ?? "")?.slug ?? "";
    return {
      people: data.people,
      saving,
      onAssignee: (cardId, personId) => run(() => updateCard(cardId, { assigneeId: personId }, slugOf(cardId))),
      onDueDate: (cardId, date) => run(() => updateCard(cardId, { dueDate: date }, slugOf(cardId))),
      onToggleSubtask: (cardId, subtaskId, done, onFail) => run(() => toggleSubtask(subtaskId, done, slugOf(cardId)), undefined, onFail),
    };
  }, [canEdit, data.people, data.cards, boardById, saving, run]);

  // A limit belongs to one real column on one real board, so it is shown only
  // with one board in scope and only while the columns ARE the lanes: under
  // "group by epic" a column is an epic, and a column limit means nothing
  // about it (W.31, WorkboardLane.wipLimit).
  const wipLimits = useMemo(() => {
    const m = new Map<string, number>();
    if (single === null || grouping !== "lane") return m;
    for (const l of data.lanes) if (l.wipLimit != null) m.set(l.id, l.wipLimit);
    return m;
  }, [single, grouping, data.lanes]);

  const cardIds = useMemo(() => cards.map((c) => c.id), [cards]);
  const selectedCardId = useWorkboardKeys({
    cardIds,
    enabled: keysEnabled,
    canAdd,
    onNewCard,
    // From the cards on screen, not from data.cards: those carry the lane the
    // board is drawing them in, which is what the drawer's Column select
    // shows while a move is still being written.
    onOpenCard: (cardId) => {
      const card = cards.find((c) => c.id === cardId);
      if (card) onOpenCard(card);
    },
  });

  // A board member on the client hub may drag their own cards and nobody
  // else's, which is a per-card question rather than a board-wide switch.
  const mayMove = (card: Card) => (canMove === "own" ? card.assignee_id === viewerPersonId : canMove);

  return { quick, quickAdd, wipLimits, selectedCardId, mayMove };
}
