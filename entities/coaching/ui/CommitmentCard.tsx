"use client";

import { useEffect, useState } from "react";
import { columnFor, type BoardColumnId } from "@/entities/coaching/lib/types";
import type { Commitment } from "@/entities/coaching/lib/data/rows";
import { STUCK_WHY_PLACEHOLDER } from "@/entities/coaching/lib/stuck-copy";
import { ConfirmDialog } from "@/kernel/ui/ConfirmDialog";
import { AskNow } from "./AskNow";
import { CardDone } from "./CardDone";
import { CommitmentCardMenu } from "./CommitmentCardMenu";
import { CommitmentMenuItems } from "./CommitmentMenuItems";
import { CommitmentPlan } from "./CommitmentPlan";
import { CommitmentTitle } from "./CommitmentTitle";
import { formatDate } from "@/kernel/ui/format";

// One card on the commitment board (K.14, spec 2.2). Split out of
// CommitmentBoard.tsx for the file-size gate.
//
// The card carries what the board itself cannot: the title you can open and
// reword (CommitmentTitle), the "why is it stuck" note that Blocked reveals,
// and the ⋯ menu holding every move the drag offers plus the two ways a card
// leaves the board.

// Supplied only on the coach page: push a commitment onto a task board and show
// its card's lane once pushed.
export type CommitmentBoardPush = {
  boards: { id: string; slug: string; name: string }[];
  cardFor: (c: Commitment) => { boardSlug: string; boardName: string; columnName: string; done: boolean } | null;
  onPush: (commitmentId: string, boardId: string) => void;
};

export function CommitmentCard({
  c,
  busy,
  ownerLabel,
  readOnly,
  canEdit,
  onMove,
  onRetitle,
  onNote,
  onArchive,
  onDelete,
  onAskNow,
  onCardDoneDismiss,
  onPlan,
  boardPush,
  coachName,
}: {
  c: Commitment;
  busy: boolean;
  ownerLabel: string;
  // The other side's promises: shown, never moved or reworded from here.
  readOnly: boolean;
  canEdit: boolean;
  onMove: (column: BoardColumnId) => void;
  onRetitle: (title: string) => void;
  onNote: (note: string) => void;
  // Take the card off this board without touching the row. Offered for any card
  // the viewer may move, which is the point: the profile's owner may retire a
  // card their COACH wrote for them, where deleting it was never theirs to do.
  onArchive?: () => void;
  onDelete?: () => Promise<{ ok: true } | { ok: false; error: string }>;
  // Supplied on the member's own board only: reach the coach today about a card
  // that is stuck (K.22).
  onAskNow?: () => void;
  // Supplied for the rows this viewer owns: answer the "your board card is
  // done" suggestion (2026-09-18). Absent on the other side's promises, so the
  // question only ever reaches the person who made the promise.
  onCardDoneDismiss?: () => void;
  // Supplied for the rows this viewer owns: write "when will you do it?" (L.1).
  onPlan?: (plan: string) => void;
  boardPush?: CommitmentBoardPush;
  // Who to ask, when the page knows (K.45).
  coachName?: string | null;
}) {
  const [note, setNote] = useState(c.statusNote ?? "");
  const [pushBoardId, setPushBoardId] = useState("");
  // Which question the card is asking, if any. It is held HERE rather than in
  // the menu because the menu shuts on the click that raises the dialog, and a
  // dialog owned by something that has just unmounted goes with it.
  const [confirming, setConfirming] = useState<"archive" | "delete" | null>(null);

  // The server is the tiebreaker: a refresh after someone else's edit replaces
  // what this card is showing.
  useEffect(() => setNote(c.statusNote ?? ""), [c.statusNote]);

  const column = columnFor(c.status);

  return (
    <div className="admin-cboard-card-body">
      <div className="admin-cboard-card-top">
        <CommitmentTitle title={c.title} canEdit={canEdit} busy={busy} onRetitle={onRetitle} />
        {!readOnly && (
          <CommitmentCardMenu busy={busy}>
            {(close) => (
              <CommitmentMenuItems
                column={column}
                busy={busy}
                coachName={coachName}
                onMove={(id) => {
                  close();
                  onMove(id);
                }}
                onArchive={
                  onArchive
                    ? () => {
                        close();
                        setConfirming("archive");
                      }
                    : undefined
                }
                onDelete={
                  canEdit && onDelete
                    ? () => {
                        close();
                        setConfirming("delete");
                      }
                    : undefined
                }
              />
            )}
          </CommitmentCardMenu>
        )}
      </div>

      <div className="admin-cboard-card-meta">
        {ownerLabel}
        {c.dueOn ? ` · due ${formatDate(c.dueOn)}` : ""}
        {c.historyCount > 0 ? ` · changed ${c.historyCount}×` : ""}
      </div>

      {/* The plan the owner made for this card (L.1). Under the facts because
          it is the owner's own note about them, and above the stuck note
          because a plan that did not survive contact is what "stuck" is. */}
      <CommitmentPlan plan={c.planMd} canEdit={!readOnly && Boolean(onPlan)} busy={busy} onSave={(p) => onPlan?.(p)} />

      {c.status === "blocked" && !readOnly && (
        <input
          className="admin-input admin-cboard-why"
          placeholder={STUCK_WHY_PLACEHOLDER}
          value={note}
          disabled={busy}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => {
            if ((c.statusNote ?? "") !== note) onNote(note);
          }}
          aria-label="What's in the way?"
        />
      )}
      {c.status === "blocked" && readOnly && c.statusNote && (
        <div className="admin-cboard-why-read">{c.statusNote}</div>
      )}
      {c.status === "blocked" && !readOnly && onAskNow && (
        <AskNow sentAt={c.askNowSentAt} busy={busy} onAsk={onAskNow} />
      )}
      {/* The board noticed a linked card finish; its owner decides what that
          means. "Mark it kept" is the ordinary move to Done, so their answer
          lands in the same history as any other move (2026-09-18). */}
      <CardDone c={c} busy={busy} onKept={() => onMove("done")} onDismiss={onCardDoneDismiss} />

      {confirming === "archive" && onArchive && (
        <ConfirmDialog
          title={`Archive "${c.title}"?`}
          body="It leaves the board. The card and everything that happened to it stay in the history you both read, and nothing is deleted."
          confirmLabel="Archive"
          onConfirm={async () => {
            onArchive();
            return { ok: true as const };
          }}
          onClose={() => setConfirming(null)}
        />
      )}
      {confirming === "delete" && onDelete && (
        <ConfirmDialog
          title={`Delete "${c.title}"?`}
          body="The commitment is removed from both your board and your coach's view."
          confirmLabel="Delete"
          onConfirm={onDelete}
          onClose={() => setConfirming(null)}
        />
      )}

      {boardPush &&
        (boardPush.cardFor(c) ? (
          <div className="admin-cboard-card-meta">
            On {boardPush.cardFor(c)?.boardName}:{" "}
            {boardPush.cardFor(c)?.done ? "Done" : boardPush.cardFor(c)?.columnName || "—"}
          </div>
        ) : (
          <div className="admin-cboard-card-foot">
            <select
              className="admin-input"
              value={pushBoardId}
              onChange={(e) => setPushBoardId(e.target.value)}
              disabled={busy}
              aria-label="Board"
            >
              <option value="">Push to board…</option>
              {boardPush.boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="admin-btn"
              disabled={busy || !pushBoardId}
              onClick={() => boardPush.onPush(c.id, pushBoardId)}
            >
              Push
            </button>
          </div>
        ))}
    </div>
  );
}
