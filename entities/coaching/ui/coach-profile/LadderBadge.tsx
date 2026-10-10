"use client";

import type { EdgesLadder } from "@/entities/coaching/lib/types";

export function LadderBadge({ ladder }: { ladder: EdgesLadder | null }) {
  if (!ladder) return <span className="admin-cell-muted">no ladder</span>;
  return <span className="admin-cell-muted">⇗ {ladder.label}</span>;
}
