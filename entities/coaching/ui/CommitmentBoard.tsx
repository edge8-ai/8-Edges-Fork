"use client";

import { useMemo, useState } from "react";
import {
  BOARD_COLUMN_LABELS,
  STATUS_FOR_COLUMN,
  columnFor,
  type BoardColumnId,
  type CommitmentStatus,
} from "@/entities/coaching/lib/types";
import type { Commitment } from "@/entities/coaching/lib/data/rows";
import { EMPTY_COLUMN, MOVE_TOAST } from "@/entities/coaching/lib/board-copy";
import { moveWithin, sortCards } from "@/entities/coaching/lib/stack-order";
import { DONE_SHOWN, PROMISED, PROMISED_SHOWN, foldBoard } from "@/entities/coaching/lib/board-fold";
import { BoardSort } from "./BoardSort";
import { useBoardSort } from "./useBoardSort";
import { KanbanBoard, type KanbanColumn } from "@/kernel/ui/KanbanBoard";
import { CommitmentCard, type CommitmentBoardPush } from "./CommitmentCard";

// The commitment board (K.14, spec 2.2), shared by /team/my-coaching and the
// coach's profile page. Three columns the viewer drives — On it, Blocked, Done —
// and a fourth, read-only, holding what the OTHER side promised. Each page
// passes its own side: the member drives member-owned cards and reads the
// coach's, the coach the reverse.
//
// Drag comes from kernel/ui/KanbanBoard, the same component the Workboard uses,
// so a move here behaves exactly like a move there. The card's ⋯ menu is the
// path for phones and keyboards, and every move it offers the drag offers too.
//
// Done folds to the three most recent: the collapsed cards stay mounted and
// hidden by CSS rather than being dropped from the list, so the column's header
// count is the real number of kept commitments, not the number on screen.

type BoardCard = Commitment & { columnId: string };

export function CommitmentBoard({
  commitments,
  busy,
  viewerOwner,
  promisedLabel,
  ownerLabel,
  canEdit,
  onMove,
  onNote,
  onRetitle,
  onArchive,
  onDelete,
  onAskNow,
  onCardDoneDismiss,
  onPlan,
  boardPush,
  coachName,
  onReorder,
}: {
  commitments: Commitment[];
  busy: boolean;
  // Whose cards this viewer moves. The other owner's fill the read-only column.
  viewerOwner: "member" | "coach";
  promisedLabel: string;
  ownerLabel: (c: Commitment) => string;
  // Rewording is narrower than moving: on the member page only what the member
  // wrote themselves, so a coach's wording is never silently changed.
  canEdit: (c: Commitment) => boolean;
  onMove: (id: string, status: CommitmentStatus, note: string) => void;
  onNote: (id: string, note: string) => void;
  onRetitle: (id: string, title: string) => void;
  // Retire a card from the board without deleting it (2026-09-22). Wider than
  // onDelete on purpose: rewording and deleting belong to whoever WROTE the
  // card, but taking one off your own board is yours whoever wrote it, which is
  // the only way a member gets rid of a stale card their coach set them.
  onArchive?: (id: string) => void;
  onDelete?: (id: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  // The member's board passes this; the coach's does not — "Ask now" is the
  // member asking their coach for help on a stuck card (K.22).
  onAskNow?: (id: string) => void;
  // Decline the "your board card is done" suggestion (2026-09-18). Both boards
  // pass it, each for the rows its viewer owns; the read-only column never gets
  // it, so nobody answers a question about someone else's promise.
  onCardDoneDismiss?: (id: string) => void;
  // "When will you do it?" (L.1), for the rows this viewer owns. Like the
  // dismiss above, the read-only column never gets it: a plan is the owner's
  // note to themselves, and nobody plans somebody else's promise.
  onPlan?: (id: string, plan: string) => void;
  boardPush?: CommitmentBoardPush;
  // The member's coach, when the page knows one, so the move menu can name the
  // person to ask rather than offering help from nobody in particular (K.45).
  coachName?: string | null;
  // The member's own stack, after a drag inside a column (K.66). Absent on a
  // board whose owner cannot rank, and ignored in every sort but "My order".
  onReorder?: (orderedIds: string[]) => void;
}) {
  const [mode, chooseSort] = useBoardSort();
  const [toast, setToast] = useState<string | null>(null);
  const [showAllDone, setShowAllDone] = useState(false);
  const [showAllPromised, setShowAllPromised] = useState(false);
  // The card that just changed column. It gets an arrival class for one render
  // cycle of the new column, which is what plays the short slide and fade
  // (K.29); the move itself is the server's, this is only how it lands.
  const [arrivedId, setArrivedId] = useState<string | null>(null);
  // The column a card just landed in, so its header can pop once (K.37).
  const [landedIn, setLandedIn] = useState<string | null>(null);

  const columns: KanbanColumn[] = useMemo(
    () => [
      { id: "on_it", label: BOARD_COLUMN_LABELS.on_it },
      { id: "blocked", label: BOARD_COLUMN_LABELS.blocked },
      { id: "done", label: BOARD_COLUMN_LABELS.done },
      { id: PROMISED, label: promisedLabel },
    ],
    [promisedLabel],
  );

  // dropped commitments are off the board entirely (spec 8.1).
  const cards: BoardCard[] = useMemo(
    () =>
      sortCards(commitments, mode).flatMap((c) => {
        const col = columnFor(c.status);
        if (!col) return [];
        return [{ ...c, columnId: c.owner === viewerOwner ? col : PROMISED }];
      }),
    [commitments, viewerOwner, mode],
  );

  const fold = useMemo(
    () => foldBoard(cards, { done: showAllDone, promised: showAllPromised }),
    [cards, showAllDone, showAllPromised],
  );

  // The column's cards in the order the drop leaves them, which is what the
  // stack is written from.
  function reorder(cardId: string, columnId: string, toIndex: number) {
    if (!onReorder || columnId === PROMISED) return;
    const next = moveWithin(cards.filter((c) => c.columnId === columnId).map((c) => c.id), cardId, toIndex);
    if (next) onReorder(next);
  }

  function move(cardId: string, toColumnId: string) {
    // The read-only column is a display, not a destination: a card dropped there
    // is left where it was.
    if (toColumnId === PROMISED) return;
    const card = cards.find((c) => c.id === cardId);
    if (!card || card.columnId === PROMISED) return;
    const column = toColumnId as BoardColumnId;
    setArrivedId(cardId);
    setLandedIn(column);
    setToast(MOVE_TOAST[column]);
    onMove(cardId, STATUS_FOR_COLUMN[column], card.statusNote ?? "");
  }

  return (
    <>
      {/* The kanban scrolls sideways inside this box; without a constrained
          parent it grows to its four columns and drags the whole page with it
          on a phone. */}
      <BoardSort mode={mode} onChange={chooseSort} />
      <div className="admin-cboard">
      <KanbanBoard<BoardCard>
        columns={columns}
        cards={cards}
        onMove={move}
        // Ranking by hand is what "My order" means; under a sort the stack is
        // not what the eye sees, so a drop inside a column would be a lie. A
        // drag to another column still moves the card in every mode.
        onReorder={onReorder && mode === "manual" ? reorder : undefined}
        disabled={busy}
        isDragDisabled={(c) => c.columnId === PROMISED}
        dragHandle
        cardClassName={(c) =>
          `admin-cboard-card is-${c.columnId}${fold.hidden.has(c.id) ? " is-folded" : ""}${c.id === arrivedId ? " is-arriving" : ""}`
        }
        // Stuck carries a warm skin of its own (K.45); the class is what the
        // stylesheet hangs the amber header, dot and count on.
        columnClassName={(col) =>
          [
            col.id === landedIn ? "is-landed" : null,
            col.id === "blocked" ? "is-stuck" : null,
            // The read-only column is somebody else's work: it keeps its place
            // on the board and gives up the weight (review, 2026-09-18).
            col.id === PROMISED ? "is-theirs" : null,
          ]
            .filter(Boolean)
            .join(" ") || undefined
        }
        emptyLabel={(col) => EMPTY_COLUMN[col.id] ?? "Nothing here."}
        columnFooter={(col) => {
          const more =
            col.id === "done" && fold.doneTotal > DONE_SHOWN
              ? { open: showAllDone, n: fold.doneTotal - DONE_SHOWN, toggle: () => setShowAllDone((v) => !v) }
              : col.id === PROMISED && fold.promisedTotal > PROMISED_SHOWN
                ? { open: showAllPromised, n: fold.promisedTotal - PROMISED_SHOWN, toggle: () => setShowAllPromised((v) => !v) }
                : null;
          return more ? (
            <button type="button" className="admin-cboard-fold" onClick={more.toggle}>
              {more.open ? "Show fewer" : `Show ${more.n} older`}
            </button>
          ) : null;
        }}
        renderCard={(c) => (
          <CommitmentCard
            c={c}
            busy={busy}
            ownerLabel={ownerLabel(c)}
            readOnly={c.columnId === PROMISED}
            canEdit={c.columnId !== PROMISED && canEdit(c)}
            onMove={(column) => move(c.id, column)}
            onRetitle={(title) => {
              setToast("Reworded.");
              onRetitle(c.id, title);
            }}
            onNote={(note) => onNote(c.id, note)}
            onArchive={onArchive && c.columnId !== PROMISED ? () => onArchive(c.id) : undefined}
            onDelete={onDelete ? () => onDelete(c.id) : undefined}
            onAskNow={onAskNow ? () => onAskNow(c.id) : undefined}
            onCardDoneDismiss={
              onCardDoneDismiss && c.columnId !== PROMISED ? () => onCardDoneDismiss(c.id) : undefined
            }
            onPlan={onPlan && c.columnId !== PROMISED ? (plan) => onPlan(c.id, plan) : undefined}
            boardPush={boardPush}
            coachName={coachName}
          />
        )}
      />
      </div>
      {/* The live region exists before the first message does: a region added
          to the document at the same moment as its text is not announced. */}
      <div className="admin-cboard-toast" role="status" aria-live="polite">
        {toast}
      </div>
    </>
  );
}
