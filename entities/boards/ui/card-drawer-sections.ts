"use client";

import { createContext, useContext, useEffect, useState, type RefObject } from "react";

// Two facts about the card drawer's sections that the drawer itself has to
// know (W.141), kept apart from the sections so neither is re-derived.

/**
 * What the sections hold that Save does not: an unsent comment, a subtask or
 * a blocker typed but not added. Each section flags its own draft here, and
 * the drawer's one "Discard your changes?" question counts them with the
 * form's edits, so closing (or following a blocker's card link) never throws
 * a half-written sentence away without asking.
 */
export type Drafts = RefObject<Set<string>>;
export const DraftsContext = createContext<Drafts | null>(null);

export function useDraftFlag(key: string, has: boolean): void {
  const drafts = useContext(DraftsContext);
  useEffect(() => {
    const held = drafts?.current;
    if (!held) return;
    if (has) held.add(key);
    else held.delete(key);
    return () => {
      held.delete(key);
    };
  }, [drafts, key, has]);
}

/**
 * The key the drawer's sections mount under. It changes when the drawer
 * switches in place to ANOTHER existing card — a blocker's card link — so card
 * B never opens with card A's drafts. It does NOT change when a new card gets
 * its id half-way through Create: remounting there destroyed the Save button
 * that had focus while the rest of the save was still running.
 */
export function useSectionKey(cardId: string | null): number {
  const [shown, setShown] = useState(cardId);
  const [generation, setGeneration] = useState(0);
  if (shown !== cardId) {
    setShown(cardId);
    if (shown !== null && cardId !== null) setGeneration((g) => g + 1);
  }
  return generation;
}
