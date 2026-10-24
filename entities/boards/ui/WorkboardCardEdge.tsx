"use client";

import { BADGE_PALETTE_SIZE } from "@/kernel/ui/Badge";
import { epicColorIndex, type EpicRow } from "@/entities/boards/lib/types";
import type { WorkboardBoard } from "@/entities/boards/lib/workboard";

/**
 * The card's one categorical edge (playbook, colour hierarchy rule 2). Epics
 * are board-scoped (W.41), so across boards two boards' epic colours mean
 * different things and the edge follows the client instead; on a single board
 * it follows the epic. Never both, and nothing when neither is known — an edge
 * with no label anywhere would be colour carrying meaning on its own.
 */
export function CardEdge({ epic, board, showBoard }: { epic: EpicRow | undefined; board: WorkboardBoard | undefined; showBoard: boolean }) {
  if (showBoard) {
    return board?.client_color == null ? null : (
      <span className="admin-kanban-card-edge" data-client-color={board.client_color % BADGE_PALETTE_SIZE} />
    );
  }
  return epic ? <span className="admin-kanban-card-edge" data-epic-color={epicColorIndex(epic.color)} /> : null;
}
