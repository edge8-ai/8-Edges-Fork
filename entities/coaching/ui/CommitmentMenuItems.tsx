"use client";

import { BOARD_COLUMN_LABELS, type BoardColumnId } from "@/entities/coaching/lib/types";
import { stuckMoveHint } from "@/entities/coaching/lib/stuck-copy";

// What is inside the card's ⋯ menu: every move the drag offers, and the two
// ways a card leaves the board.
//
// The moves are here because drag-and-drop is unusable on a phone and with a
// keyboard, so this is the accessible path rather than a convenience — a move
// available only by drag is a move some people cannot make.
//
// Archive and Delete are here because they were not anywhere a reader would
// look: Delete sat at the foot of the card, below the plan and the stuck note,
// and Archive did not exist at all, so a card somebody else wrote on your board
// could never be got rid of (2026-09-22). They are different acts and the menu
// says so — archiving takes the card off YOUR board and keeps the history both
// of you can read, deleting takes the row away from both of you — which is why
// the menu offers both rather than picking one and calling it "Remove".
//
// CommitmentCardMenu owns the box these sit in, and its `close`; each item says
// for itself whether choosing it should shut the menu.

export function CommitmentMenuItems({
  column,
  busy,
  coachName,
  onMove,
  onArchive,
  onDelete,
}: {
  /** The column the card is in now, which is the one move not offered. */
  column: BoardColumnId | null;
  busy: boolean;
  /** Who to ask, when the page knows, so Stuck names a person (K.45). */
  coachName?: string | null;
  onMove: (column: BoardColumnId) => void;
  /** Take the card off this board, keeping the row and its history. */
  onArchive?: () => void;
  /** Remove the row outright. Only ever offered to whoever wrote it. */
  onDelete?: () => void;
}) {
  return (
    <>
      {(Object.keys(BOARD_COLUMN_LABELS) as BoardColumnId[])
        .filter((id) => id !== column)
        .map((id) => (
          <button
            key={id}
            type="button"
            role="menuitem"
            className="admin-cboard-menu-item"
            disabled={busy}
            onClick={() => onMove(id)}
          >
            Move to {BOARD_COLUMN_LABELS[id]}
            {/* Stuck is the one move that is also a request, so the menu says
                what moving there actually does for you (K.45). */}
            {id === "blocked" && <span className="admin-cboard-menu-hint">{stuckMoveHint(coachName)}</span>}
          </button>
        ))}

      {(onArchive || onDelete) && <div className="admin-cboard-menu-sep" role="separator" />}

      {onArchive && (
        <button
          type="button"
          role="menuitem"
          className="admin-cboard-menu-item"
          disabled={busy}
          onClick={onArchive}
        >
          Archive
          <span className="admin-cboard-menu-note">Off the board. The history stays.</span>
        </button>
      )}

      {onDelete && (
        <button
          type="button"
          role="menuitem"
          className="admin-cboard-menu-item is-danger"
          disabled={busy}
          onClick={onDelete}
        >
          Delete
          <span className="admin-cboard-menu-note">Gone for both of you.</span>
        </button>
      )}
    </>
  );
}
