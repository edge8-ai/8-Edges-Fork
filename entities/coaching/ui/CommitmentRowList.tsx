"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDate } from "@/kernel/ui/format";
import { askNowOnMyCommitment, pushMyCommitmentToBoard, updateMyCommitment } from "@/entities/coaching/lib/my-actions";
import { pushCommitmentToBoard, updateCommitmentStatus } from "@/entities/coaching/lib/commitment-actions";
import { isOpen, type CommitmentRow } from "@/entities/coaching/lib/commitment-groups";
import type { Result } from "@/kernel/data/result";
import type { MayProp } from "@/kernel/identity/may-prop";
import { askedToday } from "./AskNow";

// One list of commitments with the three outcomes Dave asked for (L.18.3):
// Done, Not doing with a reason, Add to Workboard. Shared by the Commitments
// tab, Home, My Week and a coached person's page so they cannot drift. A row
// the viewer answers for carries the buttons: their own promises and, on a
// coached person's page, that person's too (L.18.4, both sides). My coach's
// promise to me is read-only. Rows a member sees on their own pages go
// through the member's writers; every row on a coach page goes through the
// coach's; both re-check ownership on the server.
//
// `may` hides what the viewer's role cannot do (ADR 0014): the member's
// writers sit behind coaching.mine, the coach's behind surface.team. The
// actions' own guards still refuse; hiding is courtesy.

export type CommitmentBoardOption = { id: string; name: string };

const STATUS_WORD: Record<string, string> = { completed: "Done", dropped: "Not doing" };

function ownerWord(r: CommitmentRow): string {
  if (r.side === "mine") return "You";
  if (r.side === "theirs") return "Your coach";
  if (r.side === "coachee") return r.personName ?? "Them";
  return r.personName ? `You, to ${r.personName}` : "You";
}

// The coach's writers serve both sides of a coached person's page; the
// member's serve only their own.
const asCoach = (r: CommitmentRow) => r.side === "coach" || r.side === "coachee";

export function CommitmentRowList({
  rows,
  may,
  boards = [],
  actions = "all",
  empty,
}: {
  rows: CommitmentRow[];
  may: MayProp;
  boards?: CommitmentBoardOption[];
  // Home offers Done alone; the tab and My Week offer all three.
  actions?: "all" | "done";
  empty?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notDoing, setNotDoing] = useState<{ id: string; reason: string } | null>(null);
  const [picking, setPicking] = useState<string | null>(null);

  const run = (fn: () => Promise<Result & { note?: string | null }>) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) setError(res.error);
      else if (res.note) setError(res.note);
      setNotDoing(null);
      setPicking(null);
      router.refresh();
    });

  const close = (r: CommitmentRow, status: "completed" | "dropped", note: string) =>
    run(() => (asCoach(r) ? updateCommitmentStatus(r.id, status, note) : updateMyCommitment(r.id, status, note)));

  const push = (r: CommitmentRow, boardId: string) =>
    run(() => (asCoach(r) ? pushCommitmentToBoard(r.id, boardId, r.profileId) : pushMyCommitmentToBoard(r.id, boardId)));

  if (rows.length === 0) return empty ? <p className="admin-myweek-empty">{empty}</p> : null;

  return (
    <>
      {error && (
        <p className="admin-cell-muted" role="status">
          {error}
        </p>
      )}
      <ul className="admin-myweek-list">
        {rows.map((r) => {
          const open = isOpen(r.status);
          // Owned, and the viewer's role may run the writer for this side.
          const owned = r.side !== "theirs" && Boolean(may[asCoach(r) ? "surface.team" : "coaching.mine"]);
          const meta = [
            r.heldOn ? `from your 1-1 on ${formatDate(r.heldOn)}` : null,
            r.dueOn ? `due ${formatDate(r.dueOn)}` : null,
          ].filter(Boolean);
          return (
            <li key={r.id} className="admin-commit-row">
              <div className="admin-commit-main">
                <span className="admin-commit-title">{r.title}</span>
                <span className="admin-commit-meta">
                  <span className="admin-myweek-tag">{ownerWord(r)}</span>
                  {meta.length > 0 && <span>{meta.join(" · ")}</span>}
                  {r.status === "blocked" && <span className="admin-myweek-late">Blocked</span>}
                  {!open && <span className="admin-myweek-tag">{STATUS_WORD[r.status] ?? r.status}</span>}
                  {r.card && (
                    <Link href={`/team/boards/${r.card.boardSlug}`}>
                      on the Workboard · {r.card.columnName || r.card.boardName}
                    </Link>
                  )}
                </span>
                {r.planMd && open && <span className="admin-commit-note">{r.planMd}</span>}
                {r.status === "dropped" && r.statusNote && <span className="admin-commit-note">Why: {r.statusNote}</span>}
              </div>

              {open && owned && notDoing?.id !== r.id && picking !== r.id && (
                <span className="admin-commit-actions">
                  <button type="button" className="admin-btn admin-btn--sm admin-btn--primary" disabled={pending} onClick={() => close(r, "completed", "")}>
                    Done
                  </button>
                  {actions === "all" && (
                    <>
                      <button type="button" className="admin-btn admin-btn--sm" disabled={pending} onClick={() => setNotDoing({ id: r.id, reason: "" })}>
                        Not doing
                      </button>
                      {!r.card && boards.length > 0 && (
                        <button
                          type="button"
                          className="admin-btn admin-btn--sm"
                          disabled={pending}
                          onClick={() => (boards.length === 1 ? push(r, boards[0].id) : setPicking(r.id))}
                        >
                          Add to Workboard
                        </button>
                      )}
                    </>
                  )}
                </span>
              )}

              {open && r.status === "blocked" && r.side === "mine" && actions === "all" && may["coaching.mine"] && (
                <span className="admin-commit-actions">
                  {askedToday(r.askNowSentAt) ? (
                    <span className="admin-cell-muted">Asked today · your coach has it.</span>
                  ) : (
                    <button type="button" className="admin-btn admin-btn--sm" disabled={pending} onClick={() => run(() => askNowOnMyCommitment(r.id))}>
                      Ask now
                    </button>
                  )}
                </span>
              )}

              {notDoing?.id === r.id && (
                <form
                  className="admin-commit-actions"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!notDoing.reason.trim()) {
                      setError("Say in one line why you are not doing it.");
                      return;
                    }
                    close(r, "dropped", notDoing.reason);
                  }}
                >
                  <input
                    className="admin-input"
                    aria-label="Why not"
                    placeholder="Why not, in one line"
                    maxLength={500}
                    required
                    autoFocus
                    value={notDoing.reason}
                    onChange={(e) => setNotDoing({ id: r.id, reason: e.target.value })}
                  />
                  <button type="submit" className="admin-btn admin-btn--sm admin-btn--primary" disabled={pending}>
                    Not doing
                  </button>
                  <button type="button" className="admin-btn admin-btn--sm" onClick={() => setNotDoing(null)}>
                    Cancel
                  </button>
                </form>
              )}

              {picking === r.id && (
                <span className="admin-commit-actions">
                  <select className="admin-select" aria-label="Which board" defaultValue="" disabled={pending} onChange={(e) => e.target.value && push(r, e.target.value)}>
                    <option value="">Add to which board…</option>
                    {boards.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="admin-btn admin-btn--sm" onClick={() => setPicking(null)}>
                    Cancel
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
