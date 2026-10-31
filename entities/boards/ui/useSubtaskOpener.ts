"use client";

import { useState } from "react";

/**
 * Whether "+ Subtask" has opened the card's Subtasks section, and the subtask
 * typed into it but not yet added (W.159, kept since W.163 F12).
 *
 * Both used to live inside the Details panel, which the drawer's History tab
 * unmounts: a look at the card's history and back closed the section the
 * person had just opened and threw away what they had typed in it. The drawer
 * itself stays mounted across the tab switch, so it holds them here instead.
 *
 * They belong to one card. Another card, a closed drawer (no id) or a new card
 * receiving its id starts again closed and empty, as the drawer's sections do
 * (useSectionKey), so card B never opens with card A's half-typed subtask.
 */
export type SubtaskOpener = {
  opened: boolean;
  open: () => void;
  draft: string;
  setDraft: (draft: string) => void;
};

type Held = { cardId: string | null; opened: boolean; draft: string };

export function useSubtaskOpener(cardId: string | null): SubtaskOpener {
  const [held, setHeld] = useState<Held>({ cardId, opened: false, draft: "" });
  // Adjusted during render, as React has state follow a prop, so the next
  // card never paints with the last one's section open.
  let current = held;
  if (held.cardId !== cardId) {
    current = { cardId, opened: false, draft: "" };
    setHeld(current);
  }
  // Each change names the card it was made on, so one that lands after the
  // drawer has moved on is dropped rather than opening the next card.
  const forThisCard = (change: Partial<Held>) => setHeld((h) => (h.cardId === cardId ? { ...h, ...change } : h));
  return {
    opened: current.opened,
    draft: current.draft,
    open: () => forThisCard({ opened: true }),
    setDraft: (draft) => forThisCard({ draft }),
  };
}
