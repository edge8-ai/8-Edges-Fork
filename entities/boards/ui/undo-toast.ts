"use client";

// The board's one undo message (W.50), so the kanban drag, the list's Status
// cell and the list's Sprint cell cannot word it differently or wire a
// different inverse. The toast carries no memory of where the card came from:
// the server action reads that off task_stage_log, which is the only record
// that is true after someone else has also touched the card.
import { showToast } from "@/kernel/ui/Toast";
import { undoCardMove, undoCardSprint } from "@/entities/boards/lib/undo-move";

export type UndoKind = "column" | "sprint";

export function showMoveUndo({
  cardId,
  title,
  destination,
  slug,
  kind,
  onUndone,
}: {
  cardId: string;
  title: string;
  /** Where the card just went, named as the person named it: a lane or a sprint. */
  destination: string;
  slug: string;
  kind: UndoKind;
  /**
   * Local state to let go of once the undo landed. Not a refresh: the undo
   * action revalidates, so it comes back with the board re-rendered (W.196).
   */
  onUndone?: () => void;
}) {
  showToast({
    message: `Moved “${title}” to ${destination}`,
    action: { label: "Undo", run: () => (kind === "sprint" ? undoCardSprint(cardId, slug) : undoCardMove(cardId, slug)) },
    onActionDone: onUndone,
  });
}
