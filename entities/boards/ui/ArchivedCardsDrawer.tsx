"use client";

import { DetailDrawer } from "@/kernel/ui/DetailDrawer";
import { timeAgo } from "@/kernel/ui/format";
import type { BoardDetail } from "@/entities/boards/lib/data";
import { restoreCard } from "@/entities/boards/lib/actions";
import type { RunAction } from "./board-view-types";

// The board's archived cards, each with a Restore. Split out of BoardView (Q3).
export function ArchivedCardsDrawer({
  open,
  onClose,
  slug,
  archivedCards,
  saving,
  run,
}: {
  open: boolean;
  onClose: () => void;
  slug: string;
  archivedCards: BoardDetail["archivedCards"];
  saving: boolean;
  run: RunAction;
}) {
  function restore(taskId: string) {
    run(() => restoreCard(taskId, slug));
  }

  return (
    <DetailDrawer open={open} onClose={onClose} eyebrow="Board" title="Archived cards">
      <div className="admin-form">
        {archivedCards.length === 0 ? (
          <span className="admin-cell-muted">Nothing archived.</span>
        ) : (
          archivedCards.map((a) => (
            <div key={a.id} className="admin-row-divided">
              <div className="u-grow">
                <div className="admin-cell-strong">{a.title}</div>
                <div className="admin-cell-muted u-xs">
                  {a.columnName ? `${a.columnName} · ` : ""}archived {timeAgo(a.archivedAt)}
                  {a.archivedBy ? ` by ${a.archivedBy}` : ""}
                </div>
              </div>
              <button className="admin-btn admin-btn--sm" onClick={() => restore(a.id)} disabled={saving}>
                Restore
              </button>
            </div>
          ))
        )}
      </div>
    </DetailDrawer>
  );
}
