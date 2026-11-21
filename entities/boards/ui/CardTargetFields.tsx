"use client";

import { formatDate } from "@/kernel/ui/format";

// When a done card was finished. Where a card lives (its client and brand)
// moved to the top of the drawer with W.168 (CardWhereRows), because the
// client decides the sprint and epic and has to be chosen before them. The
// COLUMN is no longer here either: it moved into the drawer's header bar with
// W.92.6, so a move is one control away from the title instead of one scroll
// down a form (WB-01).
export function CardTargetFields({
  completedAt,
}: {
  /** When the card is done: the moment it reached its done column. */
  completedAt?: string | null;
}) {
  if (!completedAt) return null;
  return (
    <div className="admin-field">
      <label className="admin-label">Completed</label>
      <div>{formatDate(completedAt)}</div>
    </div>
  );
}
