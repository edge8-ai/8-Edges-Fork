"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

// The board's one selection model (W.70, decided 2026-09-21).
//
// It is the pattern W.22 established on the planning page — a checkbox per
// card, an action bar when something is ticked — lifted out of
// SprintPlanningPanel so the board and the planning page cannot drift into two
// ways of picking several cards. W.70 asked whether bulk editing belongs on
// the board as well as in planning; the answer is yes for exactly four verbs
// (snooze, epic, assignee, archive) and the reasoning is in the plan doc,
// section 4g. Any future grouped view (W.25) selects through this hook rather
// than growing a second one.
//
// One rule worth stating: a selection is over the cards ON SCREEN. When the
// filters change and a selected card is no longer drawn, it leaves the
// selection — otherwise a person narrows the board, presses Archive, and
// archives something they cannot see.

export type BoardSelection = {
  selected: ReadonlySet<string>;
  ids: string[];
  toggle: (id: string) => void;
  clear: () => void;
  /**
   * Whether the tick boxes are being shown on every card (W.93). A tick box
   * drawn on every card at rest is a control with no label and no context —
   * "what are these ticks for?" — so at rest it is revealed by the pointer or
   * the keyboard on the card it belongs to. This flag is the other two ways
   * in: something is already ticked (so a person who ticked one can see where
   * the others are), or picking was turned on deliberately, which is how a
   * touch screen — which has no hover at all — ever sees a tick box.
   */
  picking: boolean;
  startPicking: () => void;
  togglePicking: () => void;
};

export function useBoardSelection(visibleIds: string[]): BoardSelection {
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  // Picking asked for, rather than inferred from a tick. It is what a touch
  // device turns on by long-pressing a card or pressing Select in the toolbar.
  const [mode, setMode] = useState(false);
  // Joined and compared as a string so the effect below fires on a genuine
  // change of what is on screen rather than on every render's new array.
  const visibleKey = visibleIds.join(",");

  useEffect(() => {
    const visible = new Set(visibleKey ? visibleKey.split(",") : []);
    setSelected((s) => {
      if ([...s].every((id) => visible.has(id))) return s;
      return new Set([...s].filter((id) => visible.has(id)));
    });
  }, [visibleKey]);

  const toggle = useCallback((id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setSelected(new Set());
    setMode(false);
  }, []);
  const ids = useMemo(() => [...selected], [selected]);

  // Turning picking off while cards are still ticked would hide the ticks
  // that the selection bar is about to act on, so the mode is only ever half
  // of the answer: anything ticked shows the boxes regardless.
  const picking = mode || selected.size > 0;
  const startPicking = useCallback(() => setMode(true), []);
  const togglePicking = useCallback(() => setMode((m) => !m), []);

  // MEMOISED, and it matters far more than it looks (W.103.6). This object is
  // handed to every card on the board. Returned as a fresh literal it changed
  // identity on every render of the surface, which defeated React.memo on the
  // card for ALL of them — so flipping the density toggle, whose only DOM
  // effect is one class on .wb-page, re-rendered 435 cards. Measured: 543ms
  // through React against 33ms for the browser's own layout and paint of the
  // same change.
  return useMemo(
    () => ({ selected, ids, toggle, clear, picking, startPicking, togglePicking }),
    [selected, ids, toggle, clear, picking, startPicking, togglePicking],
  );
}
