"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cardNodeSelector } from "./focus-card";

/**
 * The board's keyboard (W.32).
 *
 * There were zero shortcuts here. The only global key handlers in the repo
 * are Esc-to-close in DetailDrawer and ConfirmButton and the sidebar
 * toggles, so there is no command palette to be consistent with and this
 * does not invent one.
 *
 * A minimal honest set, all of it non-destructive:
 *
 *   n        a new card
 *   /        focus the search box
 *   j / k    move the selection down and up the cards on screen
 *   Enter    open the selected card
 *   Esc      drop the selection (the drawer's own Esc already closes it)
 *
 * Nothing here moves, archives or deletes anything: ClickUp ships its
 * shortcuts off by default, and the reason is that a stray keystroke that
 * changes data is a different kind of mistake from one that changes what you
 * are looking at. Moving a card by keyboard is the drag library's own
 * pattern and lives on the card (W.65), where the person has already said
 * which card they mean.
 *
 * THE CLASSIC BUG is a global handler that fires while a text field has
 * focus — typing "n" into the search box creating a card. `fromAField` is
 * the guard, and it covers the three cases that matter: a form control, a
 * contenteditable, and any modifier chord, which belongs to the browser.
 */
export function useWorkboardKeys({
  cardIds,
  enabled,
  canAdd,
  onNewCard,
  onOpenCard,
}: {
  /** Every card on screen, in the order it is drawn; the selection walks this. */
  cardIds: string[];
  /** Off while a drawer is open — those have their own keys, and Esc is theirs. */
  enabled: boolean;
  canAdd: boolean;
  onNewCard: () => void;
  onOpenCard: (cardId: string) => void;
}) {
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

  // The handler is registered once and reads the current values through a
  // ref: re-binding a window listener on every render of a board that
  // re-renders on every keystroke of its search box is how a handler comes
  // to fire twice.
  const latest = useRef({ cardIds, enabled, canAdd, onNewCard, onOpenCard, selectedCardId });
  latest.current = { cardIds, enabled, canAdd, onNewCard, onOpenCard, selectedCardId };

  // A selection that survived the card leaving the board (a filter, a search,
  // someone else's move) would leave Enter opening nothing.
  useEffect(() => {
    setSelectedCardId((id) => (id !== null && cardIds.includes(id) ? id : null));
  }, [cardIds]);

  const step = useCallback((by: number) => {
    const { cardIds: ids } = latest.current;
    if (ids.length === 0) return;
    setSelectedCardId((current) => {
      if (current === null) return by > 0 ? ids[0] : ids[ids.length - 1];
      const at = ids.indexOf(current);
      if (at === -1) return ids[0];
      // Stops at the ends rather than wrapping: a list that jumps from the
      // last card to the first reads as a bug, not as a loop.
      return ids[Math.min(ids.length - 1, Math.max(0, at + by))];
    });
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const now = latest.current;
      if (!now.enabled || fromAField(e)) return;
      switch (e.key) {
        case "n":
          if (!now.canAdd) return;
          e.preventDefault();
          now.onNewCard();
          return;
        case "/": {
          const search = document.querySelector<HTMLInputElement>('input[aria-label="Search cards"]');
          if (!search) return;
          // preventDefault or the "/" lands in the box we just focused — and
          // in Firefox it also opens quick-find.
          e.preventDefault();
          search.focus();
          search.select();
          return;
        }
        case "j":
          e.preventDefault();
          step(1);
          return;
        case "k":
          e.preventDefault();
          step(-1);
          return;
        case "Enter":
          if (now.selectedCardId === null) return;
          e.preventDefault();
          now.onOpenCard(now.selectedCardId);
          return;
        case "Escape":
          if (now.selectedCardId === null) return;
          setSelectedCardId(null);
          return;
        default:
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [step]);

  // Keep the selected card on screen. The column body scrolls independently
  // of the page, so walking j past the fold otherwise moves a selection
  // nobody can see.
  useEffect(() => {
    if (selectedCardId === null) return;
    document.querySelector(cardNodeSelector(selectedCardId))?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedCardId]);

  return selectedCardId;
}

/**
 * Whether this keystroke belongs to something the person is typing in, or to
 * the browser. Either way the board does not get it.
 */
export function fromAField(e: Pick<KeyboardEvent, "metaKey" | "ctrlKey" | "altKey" | "target">): boolean {
  if (e.metaKey || e.ctrlKey || e.altKey) return true;
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  if (t.isContentEditable) return true;
  const tag = t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON";
}
