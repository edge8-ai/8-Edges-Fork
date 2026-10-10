/**
 * The board node for a card, by the attribute the drag library actually writes.
 *
 * `data-rfd-…`, not `data-rbd-…`. This repo uses @hello-pangea/dnd, the
 * maintained fork of react-beautiful-dnd, and the fork renamed every data
 * attribute from `rbd` to `rfd`. Both call sites here were written against the
 * old name, so `document.querySelector` matched nothing, every call returned
 * false, and two features that look implemented never ran once: the card
 * drawer never handed focus back to the card it opened from, and walking the
 * board with j/k never scrolled the selection into view past the fold.
 *
 * Nothing failed loudly, which is why it lasted: a selector that matches
 * nothing is indistinguishable from a card that is not on screen — and "not on
 * screen" is a case both callers are required to handle, so both handled it,
 * every time, silently (W.104.8).
 *
 * It is exported rather than written twice for the same reason both copies
 * were wrong at once, and the attribute NAME is exported separately so a test
 * can hold it against the markup the library really renders — a selector is
 * not something the type checker can be wrong about on your behalf.
 */
export const CARD_NODE_ATTR = "data-rfd-draggable-id";

export function cardNodeSelector(cardId: string): string {
  return `[${CARD_NODE_ATTR}="${CSS.escape(cardId)}"]`;
}

/**
 * Give focus back to the card that opened the drawer (W.92.6).
 *
 * A dialog that closes to nowhere strands a keyboard user at the top of the
 * document, which on a board of a hundred cards means finding their place
 * again by hand. The card's element on the board is the drag handle the drag
 * library already marks with the card's id.
 *
 * A board card is not in the tab order by the board's own doing — it is a
 * click target, not a control — but the drag library gives its handle
 * `tabindex="0"` and `role="button"` so a card can be lifted with the
 * keyboard, so in practice the node is focusable already. The `tabIndex = -1`
 * below is for the surfaces that render a card with dragging disabled, where
 * the library adds neither.
 *
 * Returns whether focus was actually placed, so the caller can fall back to
 * whatever had focus before the drawer opened — the card may not be on screen
 * at all, on a view that has since filtered it out or a card just archived.
 */
export function focusCard(cardId: string | null): boolean {
  if (!cardId || typeof document === "undefined") return false;
  const el = document.querySelector<HTMLElement>(cardNodeSelector(cardId));
  if (!el) return false;
  if (!el.hasAttribute("tabindex")) el.tabIndex = -1;
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: "nearest", inline: "nearest" });
  return true;
}
