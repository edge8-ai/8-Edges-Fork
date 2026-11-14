"use client";

import { sinceLabel } from "./board-changes";

// One line above the board: "9 cards moved since Friday" (W.63).
//
// It is a sentence, not a panel — the same shape the sprint goal line (W.51)
// and the filter sentence (W.46) already have — because what it says is one
// fact and boxing it would give it more weight than the board it sits over.
//
// It says WHICH cards, never who moved them. The count is of cards and the
// highlight lands on cards; task_stage_log records `moved_by` and this line
// never asks for it.
export function WorkboardChangedLine({
  count,
  since,
  highlighting,
  onToggleHighlight,
  onMarkSeen,
}: {
  count: number;
  /** The previous visit's ISO timestamp. */
  since: string;
  highlighting: boolean;
  onToggleHighlight: () => void;
  onMarkSeen: () => void;
}) {
  if (count === 0) return null;
  return (
    <p className="admin-board-changed u-mb-3">
      <span className="admin-board-changed-count">
        {count} card{count === 1 ? "" : "s"} moved since {sinceLabel(since)}
      </span>
      <button type="button" className="admin-btn admin-btn--sm" onClick={onToggleHighlight} aria-pressed={highlighting}>
        {highlighting ? "Stop highlighting" : "Show me"}
      </button>
      <button type="button" className="admin-btn admin-btn--sm" onClick={onMarkSeen}>
        Caught up
      </button>
    </p>
  );
}
