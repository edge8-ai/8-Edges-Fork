// Where Tab goes inside a modal (W.141).
//
// DetailDrawer says `aria-modal="true"`, which promises assistive technology
// that nothing outside the dialog can be reached. It did not keep that promise
// for the keyboard: Tab past the last control walked onto the page behind the
// backdrop, where a card could be opened or a button pressed with the drawer
// still on top. Every drawer in the app is a DetailDrawer, so this is one fix
// for all of them.
//
// The decision is kept pure, apart from the DOM, so it can be tested without
// one: given the dialog's focusable controls in order, where focus is now, and
// the direction, it answers the control to move to — or null, to let the
// browser take its ordinary step inside the dialog.

/** What can take focus by Tab: the standard interactive set, minus what is disabled or taken out of the order. */
export const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
  "[contenteditable='true']",
].join(",");

export function trapTarget<T>(focusables: readonly T[], active: T | null, inside: boolean, shift: boolean): T | null {
  if (focusables.length === 0) return null;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  // Focus that has left the dialog (a click on the page behind, or a control
  // that was removed while focused) comes back in at the edge Tab would reach.
  if (!inside || active === null) return shift ? last : first;
  if (shift && active === first) return last;
  if (!shift && active === last) return first;
  return null;
}

/**
 * Whether Escape should leave the field it was pressed in rather than close
 * the dialog (W.141). Escape in a comment box half-way through a sentence
 * used to close the drawer and throw the sentence away. The first Escape now
 * leaves a multi-line box that holds text, and the second closes.
 *
 * Only multi-line boxes, where drafts are written. A one-line field holding
 * text is usually a prefilled value (a name, a date) on an edit form, and
 * making Escape take two presses on every such form across the app would cost
 * every drawer a keystroke to protect nothing.
 */
export function escapeLeavesField(target: { tagName?: string; value?: string; isContentEditable?: boolean } | null): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  return (target.tagName ?? "").toUpperCase() === "TEXTAREA" && (target.value ?? "") !== "";
}

/**
 * Whether focus sits in a different dialog stacked over this one — a confirm
 * opened from inside a drawer renders through a portal, outside the drawer's
 * panel. The drawer's trap stands down while it does, or Tab inside the
 * confirm would be pulled back into the drawer behind it.
 */
export function inOtherDialog(active: Element | null, own: Element): boolean {
  const dialog = active?.closest('[role="dialog"], [role="alertdialog"]');
  return !!dialog && dialog !== own;
}

/**
 * Whether an Escape was already handled by something inside the drawer — a
 * picker closing itself — so the drawer must not close as well (W.153).
 *
 * In the App Router React listens on `document`, the same node the drawer's
 * own keydown listener is on, so a picker's `stopPropagation()` cannot keep
 * the key from the drawer: two listeners on one node both run. The picker's
 * `preventDefault()` survives, though, and React's listener runs first,
 * because it was attached at hydration. Found in a browser on 2026-10-05,
 * where Escape in the card's epic picker closed the whole card.
 */
export function escapeHandledInside(e: { key: string; defaultPrevented: boolean }): boolean {
  return e.key === "Escape" && e.defaultPrevented;
}
