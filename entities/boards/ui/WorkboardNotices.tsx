"use client";

import type { WorkboardData } from "@/entities/boards/lib/workboard";
import type { BoardAttention } from "./useBoardAttention";
import type { Card } from "./board-view-types";
import { WorkboardChangedLine } from "./WorkboardChangedLine";
import { WorkboardBulkBar } from "./WorkboardBulkBar";

// The lines between the toolbar and the board, in the order they earn: what
// moved while you were away (W.63), and — only once something is ticked —
// what you can do to the selection (W.70).
//
// "N cards need a hand" (W.62) was the first of them until W.177. It folded
// its cards behind Show / Hide, which no Workboard surface may do, and the
// drawer button that raised an ask went in the 2026-10-05 redesign, so the
// band could only ever show what was left over. The ask still shows where it
// belongs: as the "Needs a hand" badge on its card (WorkboardCardChips), and
// in the Flow view's count.
//
// They are grouped here rather than inlined in Workboard because they share
// one property the board's other chrome does not: each is absent most of the
// time. Nothing moved, nothing is selected — and then the board looks exactly
// as it did before any of this shipped.
export function WorkboardNotices({
  data,
  cards,
  attention,
  saving,
  onBanner,
}: {
  data: WorkboardData;
  /** The cards the filters are drawing. */
  cards: Card[];
  attention: BoardAttention;
  saving: boolean;
  onBanner: (message: string | null) => void;
}) {
  const { changes } = attention;
  // A selection bar on a surface that cannot edit would lead nowhere.
  const selection = attention.canSelect ? attention.selection : null;
  return (
    <>
      {changes.since && (
        <WorkboardChangedLine
          count={changes.count}
          since={changes.since}
          highlighting={changes.highlighting}
          onToggleHighlight={changes.toggleHighlight}
          onMarkSeen={changes.markSeen}
        />
      )}
      {selection && selection.ids.length > 0 && (
        <WorkboardBulkBar
          cards={cards}
          ids={selection.ids}
          data={data}
          disabled={saving}
          onClear={selection.clear}
          onBanner={onBanner}
        />
      )}
    </>
  );
}
