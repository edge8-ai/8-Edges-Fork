"use client";

import { reassign } from "@/entities/coaching/lib/stack-order";
import { useOptimistic } from "react";
import type { CoachProfileDetail } from "@/entities/coaching/lib/data/profile";
import type { CommitmentStatus } from "@/entities/coaching/lib/types";
import { dismissCardDone, pushCommitmentToBoard, retitleCommitment, setCommitmentPlan, reorderCommitments, updateCommitmentStatus } from "@/entities/coaching/lib/commitment-actions";
import { CommitmentBoard } from "@/entities/coaching/ui/CommitmentBoard";
import { type ActionResult } from "./shared";

// The coach's half of the same board the member sees (K.14). Mirrored: the
// coach moves and rewords their OWN promises, and the read-only fourth column
// holds what the member promised, with the "why is it stuck" note they wrote.
// Since K.80 it sits folded under the Promises card, which is what a coach
// reads before a session; the board is for dragging, rewording, planning and
// pushing a promise to the Workboard.

export function CommitmentBoardCard({
  detail,
  run,
  busy,
}: {
  detail: CoachProfileDetail;
  run: (label: string, fn: () => Promise<ActionResult>, onOk?: () => void) => void;
  busy: boolean;
}) {
  // The dropped card lands in its column at once and stays there unless the
  // write fails, when useOptimistic puts it back (same reason as MyCommitments).
  const [shown, showChange] = useOptimistic(
    detail.commitments,
    (list: CoachProfileDetail["commitments"], m: { id: string; status: CommitmentStatus } | { order: string[] }) => {
      // Same rule as the member's board: the drop lands where the write will.
      if ("order" in m) {
        const next = new Map(reassign(m.order, list.map((c) => ({ id: c.id, sortOrder: c.sortOrder }))).map((r) => [r.id, r.sortOrder]));
        return list.map((c) => (next.has(c.id) ? { ...c, sortOrder: next.get(c.id) as number } : c));
      }
      return list.map((c) => (c.id === m.id ? { ...c, status: m.status } : c));
    },
  );
  const byId = (id: string) => detail.commitments.find((c) => c.id === id) ?? null;

  return (
    <section className="coach-board-fold">
      <div className="admin-hint">
        What you both said you&apos;d get done before the next 1-1. Drag your own cards between
        columns or use the card&apos;s menu; they see the same board.
      </div>

      <CommitmentBoard
        commitments={shown}
        busy={busy}
        viewerOwner="coach"
        promisedLabel={`${detail.member.name} promised`}
        ownerLabel={(c) => (c.owner === "coach" ? "me" : "them")}
        canEdit={(c) => c.owner === "coach"}
        onMove={(id, status, note) =>
          run("Commitment", () => {
            showChange({ id, status });
            return updateCommitmentStatus(id, status, note);
          })
        }
        onReorder={(order) =>
          run("Commitment", () => {
            showChange({ order });
            return reorderCommitments(order);
          })
        }
        onNote={(id, note) => {
          const c = byId(id);
          if (c) run("Commitment", () => updateCommitmentStatus(id, c.status, note));
        }}
        onRetitle={(id, t) => run("Commitment", () => retitleCommitment(id, t))}
        // Same writer as a move: archiving is the "dropped" status, which is
        // off the board by definition (spec 8.1) and keeps the row.
        onArchive={(id) =>
          run("Commitment", () => {
            showChange({ id, status: "dropped" });
            return updateCommitmentStatus(id, "dropped", byId(id)?.statusNote ?? "");
          })
        }
        onCardDoneDismiss={(id) => run("Commitment", () => dismissCardDone(id, detail.profileId))}
        onPlan={(id, plan) => run("Commitment", () => setCommitmentPlan(id, plan))}
        boardPush={{
          boards: detail.boards,
          cardFor: (c) => detail.commitmentCards[c.id] ?? null,
          onPush: (id, boardId) => run("Push to board", () => pushCommitmentToBoard(id, boardId, detail.profileId)),
        }}
      />

    </section>
  );
}
