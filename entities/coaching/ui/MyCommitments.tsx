"use client";

import { useOptimistic, useState, useTransition } from "react";
import type { Commitment } from "@/entities/coaching/lib/data/rows";
import { reassign } from "@/entities/coaching/lib/stack-order";
import type { CommitmentStatus } from "@/entities/coaching/lib/types";
import { CommitmentBoard } from "@/entities/coaching/ui/CommitmentBoard";
import {
  addMyCommitment,
  askNowOnMyCommitment,
  deleteMyCommitment,
  dismissMyCardDone,
  setMyCommitmentPlan,
  editMyCommitment,
  reorderMyCommitments,
  updateMyCommitment,
} from "@/entities/coaching/lib/my-actions";

// The member's commitment board on /team/my-coaching (K.14). They move their own
// cards between On it, Blocked and Done, reword what they wrote, and read what
// their coach promised in the fourth column. Moving a card also answers the
// latest mid-cycle check-in (handled server-side).
//
// teamMemberId is the viewer's own id, used only to decide which cards can be
// reworded and deleted. The server re-derives authorship on every write, so a
// forged id here buys nothing.

export function MyCommitments({
  commitments,
  teamMemberId,
  coachName,
}: {
  commitments: Commitment[];
  teamMemberId: string;
  // Named in the Stuck move hint, so asking for a hand has someone to ask (K.45).
  coachName?: string | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [dueOn, setDueOn] = useState("");

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      else after?.();
    });
  };

  // A dropped card shows in its new column at once. Without this the board
  // drew the card back where it came from until the write and the page's
  // revalidation came round, then jumped it — the lag Khoa felt on 2026-09-17.
  // useOptimistic reverts on its own when the transition ends, so a failed
  // write puts the card back without a second code path.
  const [shown, showChange] = useOptimistic(
    commitments,
    (list: Commitment[], m: { id: string; status: CommitmentStatus } | { order: string[] }) => {
      // A reorder is applied with the same pure rule the server writes, so the
      // card the member dropped is already where the write will put it.
      if ("order" in m) {
        const next = new Map(reassign(m.order, list.map((c) => ({ id: c.id, sortOrder: c.sortOrder }))).map((r) => [r.id, r.sortOrder]));
        return list.map((c) => (next.has(c.id) ? { ...c, sortOrder: next.get(c.id) as number } : c));
      }
      return list.map((c) => (c.id === m.id ? { ...c, status: m.status } : c));
    },
  );

  const byId = (id: string) => commitments.find((c) => c.id === id) ?? null;

  return (
    <>
      {error && <div className="admin-alert admin-alert--err">{error}</div>}

      <CommitmentBoard
        commitments={shown}
        busy={busy}
        viewerOwner="member"
        promisedLabel="Your coach is on"
        ownerLabel={(c) => (c.owner === "coach" ? "your coach owns this" : "yours")}
        canEdit={(c) => c.createdBy === teamMemberId}
        onMove={(id, status, note) =>
          run(() => {
            showChange({ id, status });
            return updateMyCommitment(id, status, note);
          })
        }
        onReorder={(order) =>
          run(() => {
            showChange({ order });
            return reorderMyCommitments(order);
          })
        }
        onNote={(id, note) => {
          const c = byId(id);
          if (c) run(() => updateMyCommitment(id, c.status, note));
        }}
        // Archiving is a status change, so it goes through the same writer as a
        // move — which is also why it works on a card the coach wrote: being
        // the profile's owner grants status on any card on it, where rewording
        // and deleting need authorship.
        onArchive={(id) =>
          run(() => {
            showChange({ id, status: "dropped" });
            return updateMyCommitment(id, "dropped", byId(id)?.statusNote ?? "");
          })
        }
        onCardDoneDismiss={(id) => run(() => dismissMyCardDone(id))}
        onPlan={(id, plan) => run(() => setMyCommitmentPlan(id, plan))}
        onRetitle={(id, t) => {
          const c = byId(id);
          if (c) run(() => editMyCommitment(id, t, c.dueOn));
        }}
        onDelete={(id) => deleteMyCommitment(id)}
        onAskNow={(id) => run(() => askNowOnMyCommitment(id))}
        coachName={coachName}
      />

      <div className="admin-coach-add-row">
        <input
          className="admin-input"
          placeholder="Commit to something…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="New commitment"
        />
        <input
          className="admin-input"
          type="date"
          value={dueOn}
          onChange={(e) => setDueOn(e.target.value)}
          aria-label="Due date"
        />
        <button
          type="button"
          className="admin-btn"
          disabled={busy || !title.trim()}
          onClick={() =>
            run(
              () => addMyCommitment(title, dueOn || null),
              () => {
                setTitle("");
                setDueOn("");
              },
            )
          }
        >
          Add
        </button>
      </div>
    </>
  );
}
