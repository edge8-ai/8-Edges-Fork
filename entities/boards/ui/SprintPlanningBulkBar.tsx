"use client";

import type { PlanningMoves } from "@/entities/boards/lib/sprint-planning";

// The selection bar on sprint planning (W.202.4, approved on the canvas on
// 2026-10-21). Before it, a panel could only "Commit N selected" from Not
// done, and the button sat above the panel, off screen once a long lane was
// scrolled. Now the whole page has one selection and one bar, kept at the
// bottom of the screen, with the three things a planning meeting decides about
// a card: next sprint, done, or back to Not done.
//
// It is the Workboard's bulk bar (.admin-board-bulk, W.70) rather than a new
// component. Each verb says how many of the ticked cards it applies to when
// that is not all of them, so a press never surprises: a Done card ticked
// along with Not done ones is not committed, and a locked board's cards are
// closed but not moved between lanes (planningMoves).
export function SprintPlanningBulkBar({
  count,
  moves,
  busy,
  onMove,
  onClear,
}: {
  count: number;
  moves: PlanningMoves;
  busy: boolean;
  onMove: (ids: string[], to: string) => void;
  onClear: () => void;
}) {
  const of = (n: number) => (n > 0 && n !== count ? ` (${n})` : "");
  return (
    <div className="admin-board-bulk sp-bulk-bar" role="toolbar" aria-label="Selected cards">
      <span className="admin-cell-strong">{count} selected</span>
      <span className="admin-cell-muted u-sm">— each card moves within its own board</span>
      <button type="button" className="admin-btn admin-btn--primary admin-btn--sm" disabled={busy || moves.toNext.length === 0} onClick={() => onMove(moves.toNext, "next")}>
        Move to next sprint{of(moves.toNext.length)}
      </button>
      <button type="button" className="admin-btn admin-btn--sm" disabled={busy || moves.toDone.length === 0} onClick={() => onMove(moves.toDone, "done")}>
        Mark done{of(moves.toDone.length)}
      </button>
      {moves.toOpen.length > 0 && (
        <button type="button" className="admin-btn admin-btn--sm" disabled={busy} onClick={() => onMove(moves.toOpen, "open")}>
          Back to Not done{of(moves.toOpen.length)}
        </button>
      )}
      <button type="button" className="admin-btn admin-btn--sm admin-btn--ghost" onClick={onClear}>
        Clear
      </button>
    </div>
  );
}
