"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Tabs } from "./Tabs";
import { escapeHandledInside, escapeLeavesField, FOCUSABLE, inOtherDialog, trapTarget } from "./focus-trap";

export function DetailDrawer({
  open,
  onClose,
  title,
  eyebrow,
  action,
  subhead,
  className,
  restoreFocus,
  history,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  eyebrow?: ReactNode;
  // Optional control rendered in the header, left of the close button —
  // e.g. an "open full page" link when the shelf is a summary of a record
  // that has its own route.
  action?: ReactNode;
  /**
   * A band pinned under the title and above the scrolling body. It is part of
   * the header, not of the content: the Workboard's card drawer puts the four
   * controls you change without reading anything (column, assignee, due date,
   * estimate) there, so they stay reachable however far the activity stream
   * has been scrolled.
   */
  subhead?: ReactNode;
  /** Extra class on the panel itself, for a surface that needs a wider one. */
  className?: string;
  /**
   * Where focus goes when the drawer closes. A dialog that hands focus back to
   * the document body strands a keyboard user at the top of the page; the
   * caller names the thing that opened it. Returns true when it placed focus,
   * and the element focused before opening is used when it does not.
   */
  restoreFocus?: () => boolean;
  /**
   * The record's history, rendered as a second tab beside the details (S.4).
   * The drawer stays a single pane when it is not given: the twenty-four
   * callers that pass no history render exactly as they did before, and no
   * surface grows a tab strip it did not ask for.
   *
   * Only the open panel is rendered, so a panel that loads its own rows does
   * nothing until somebody selects the tab.
   */
  history?: ReactNode;
  children: ReactNode;
}) {
  // What had focus at the moment the drawer opened, so Escape can give it back.
  const opener = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  // Read while rendering the open transition, which is the last moment the
  // answer is still true: React applies the panel's `autoFocus` during the
  // commit that follows, so an effect asking the same question is told the
  // drawer's own first field — and hands focus back to a node it has just
  // unmounted, stranding the reader on <body>.
  if (open && !wasOpen.current && typeof document !== "undefined") {
    const previous = document.activeElement;
    opener.current = previous instanceof HTMLElement ? previous : null;
  }
  wasOpen.current = open;
  // Held in refs so the effect does not re-run — and re-focus — every time the
  // parent re-renders with a fresh closure. Every caller writes `onClose` as an
  // inline arrow, so a dependency on it fires the close-time cleanup on each
  // keystroke: that is how typing in the card drawer's description jumped the
  // buffer into the title.
  const restore = useRef(restoreFocus);
  // Only while the drawer is open. Closing it is a state change in the parent,
  // so the render that sets `open` to false arrives BEFORE this effect's
  // cleanup — and it carries a closure that no longer knows which record was
  // open (the card drawer's is `() => focusCard(form?.id ?? null)`). Refreshing
  // the ref on that render would hand the cleanup a callback that always
  // answers null, which is why nothing was ever focused back.
  if (open) restore.current = restoreFocus;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // The panel itself, so an opening drawer can take focus when nothing inside
  // it has asked for focus of its own (W.104.3).
  const panel = useRef<HTMLElement | null>(null);
  // The dialog's accessible name. `role="dialog" aria-modal="true"` with no
  // name is announced as "dialog" and nothing else, which is what every
  // drawer in the admin did (W.104.2). The name is the title the header
  // already draws rather than a new prop, so all twenty-four callers get one
  // without passing anything: `title` is required, so there is always a name.
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const root = () => panel.current ?? document.body;
    const onKey = (e: KeyboardEvent) => {
      // A picker inside the drawer that closed itself on this Escape.
      if (escapeHandledInside(e)) return;
      if (e.key === "Escape") {
        // The first Escape leaves a field holding text; the next one closes
        // (W.141), so a half-written comment is not thrown away with the drawer.
        const field = e.target instanceof HTMLElement ? e.target : null;
        if (field && root().contains(field) && escapeLeavesField(field as HTMLInputElement)) {
          field.blur();
          panel.current?.focus();
          return;
        }
        closeRef.current();
        return;
      }
      // Keep Tab inside the dialog (W.141): `aria-modal` promises that the
      // page behind cannot be reached, and the keyboard used to reach it.
      if (e.key !== "Tab" || !panel.current) return;
      const container = panel.current;
      // Only what is actually drawn: an inactive tab's panel and a control in
      // a hidden block are in the tree but cannot take focus.
      const focusables = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.getClientRects().length > 0);
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      // A confirm stacked over the drawer keeps its own Tab order.
      if (inOtherDialog(active, container)) return;
      // The panel itself holds focus right after opening; it is an edge, not a
      // place inside, or Shift+Tab from there steps onto the page behind.
      const inside = !!active && active !== container && container.contains(active);
      const target = trapTarget(focusables, active, inside, e.shiftKey);
      if (target) {
        e.preventDefault();
        target.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    // MOVE INTO THE DIALOG, but only when nothing inside it already holds
    // focus. A drawer whose first field carries `autoFocus` has placed focus
    // deliberately and keeps it — several do. The card drawer used to be one
    // of them, which meant opening a card to READ it put the caret in its
    // title, so the first keystroke renamed the card and a screen reader
    // announced a text box before it announced what the dialog was (W.104.3).
    // Focusing the panel instead announces the drawer by its name and leaves
    // the first Tab to reach the first control.
    const node = panel.current;
    if (node && !node.contains(document.activeElement)) node.focus();
    // Lock the page behind the drawer so a swipe that reaches the drawer's scroll
    // end does not scroll the list underneath (paired with overscroll-behavior on
    // .admin-drawer-body). Restored on close.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      if (restore.current?.()) return;
      const back = opener.current;
      // An opener that has since been removed from the document cannot take
      // focus back, and focusing a detached node throws nothing but achieves
      // nothing either.
      if (back && back.isConnected) back.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <>
      <div className="admin-drawer-backdrop" onClick={onClose} />
      <aside
        ref={panel}
        className={className ? `admin-drawer ${className}` : "admin-drawer"}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        // Focusable only programmatically: the panel is a landing place for
        // focus when the drawer opens, never a stop in the tab order.
        tabIndex={-1}
      >
        <div className="admin-drawer-head">
          <div>
            {eyebrow && <div className="admin-drawer-eyebrow">{eyebrow}</div>}
            <div className="admin-drawer-title" id={titleId}>
              {title}
            </div>
          </div>
          <div className="admin-drawer-actions">
            {action}
            <button className="admin-drawer-close" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>
        </div>
        {subhead}
        <div className="admin-drawer-body">
          {history ? (
            <Tabs
              tabs={[
                { key: "details", label: "Details", content: children },
                { key: "history", label: "History", content: history },
              ]}
            />
          ) : (
            children
          )}
        </div>
      </aside>
    </>
  );
}
