"use client";

import { useMemo, useState } from "react";
import { cardsMovedSince, type ChangeableCard } from "./board-changes";
import { useLastVisit } from "./useLastVisit";

// "What changed since you last looked" (W.63), as the board holds it: the
// previous visit, the cards that moved after it, and whether the reader has
// asked to see which ones.
//
// It is asked of every card IN SCOPE rather than of the filtered set, and
// that is the point: "what moved while I was away" is a question about the
// board, and a filter narrowing the view does not narrow what happened.
//
// The answer is card ids. task_stage_log records `moved_by` and nothing here
// asks for it — which cards moved, never who moved them.

export type WorkboardChanges = {
  /** The previous visit's ISO timestamp, or null on a first-ever visit. */
  since: string | null;
  /** How many cards moved since then. */
  count: number;
  /** The cards to draw as changed right now — empty unless highlighting. */
  changed: ReadonlySet<string>;
  highlighting: boolean;
  toggleHighlight: () => void;
  /** Stop highlighting and mark the surface seen as of now. */
  markSeen: () => void;
};

export function useWorkboardChanges(cards: ChangeableCard[]): WorkboardChanges {
  const { since, markSeen } = useLastVisit();
  const [highlighting, setHighlighting] = useState(false);
  const movedIds = useMemo(() => cardsMovedSince(cards, since), [cards, since]);
  const changed = useMemo(() => new Set(highlighting ? movedIds : []), [highlighting, movedIds]);

  return {
    since,
    count: movedIds.length,
    changed,
    highlighting,
    toggleHighlight: () => setHighlighting((v) => !v),
    markSeen: () => {
      setHighlighting(false);
      markSeen();
    },
  };
}
