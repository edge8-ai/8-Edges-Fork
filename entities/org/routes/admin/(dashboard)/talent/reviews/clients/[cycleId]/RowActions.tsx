"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FocusEvent as ReactFocusEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { MayProp } from "@/kernel/identity/may-prop";
import { ConfirmDialog } from "@/kernel/ui/ConfirmDialog";
import { FOCUSABLE, inOtherDialog, trapTarget } from "@/kernel/ui/focus-trap";
import { useMediaQuery } from "@/kernel/ui/hooks/useMediaQuery";
import { ActionItems, ChangeManager, type Confirm, type RowFacts } from "./RowActionsItems";
import { placeMenu } from "./row-menu";

// The owner's actions on one member of a client review (CR.2.4, redrawn as
// CR.3.8): a menu that opens over the page from the row's More button. What
// the menu holds is RowActionsItems'; this file is where it sits and when it
// shuts.
//
// Where. It used to open inside the table's last cell, where it made the row
// tall and the table's scrolling frame cut it off at the edge (a wide table
// scrolls sideways, so its wrapper clips whatever overflows). It is now
// portalled to the body and placed under its button by measuring the button,
// opening upwards when there is no room below. On a phone it is a sheet from
// the bottom instead, as the commitment card's menu is. Its position is set
// through the ref rather than an inline style, because it is measured, not
// designed, and the design ratchet counts inline styles.
//
// When. On a click anywhere else and on Escape, which puts focus back on More.
// An item that asks first shuts the menu and opens ConfirmDialog, owned here
// rather than by the menu, since a dialog inside the menu would unmount under
// the reader's own click (see ConfirmDialog). Each server action guards
// itself; `may` only hides what it would refuse (ADR 0014).

export type { RowFacts };

/** The breakpoint where the menu becomes a sheet; the same as the table's phone layout (admin.css). */
const PHONE = "(max-width: 640px)";
/** The gap between the button and the menu, and the least room kept from the window's edge. */
const GAP = 6;
const EDGE = 8;

export function RowActions({ may, row, contacts }: { may: MayProp; row: RowFacts; contacts: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"menu" | "change">("menu");
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  /** A client manager change in flight: the menu stays open until it answers, so a refusal is seen. */
  const busy = useRef(false);
  const phone = useMediaQuery(PHONE);

  const close = useCallback((refocus: boolean) => {
    if (busy.current) return;
    setOpen(false);
    setView("menu");
    if (refocus) trigger.current?.focus({ preventScroll: true }); // the reader may have scrolled during a save
  }, []);

  // Place the menu by its button, right edges aligned (placeMenu decides where), and again on scroll
  // and resize so it stays with its row; a sheet needs no placing.
  useLayoutEffect(() => {
    if (!open) return;
    if (phone) {
      // A sheet is placed by its stylesheet; a position left from a wider window would stretch it.
      for (const prop of ["top", "right", "max-height"]) box.current?.style.removeProperty(prop);
      return;
    }
    const place = (e?: Event) => {
      const b = trigger.current?.getBoundingClientRect();
      const el = box.current;
      // The menu's own scroll moves nothing; and its height is read under any cap, since lifting one resets that scroll.
      if (!b || !el || (e?.target instanceof Node && el.contains(e.target))) return;
      const at = placeMenu(b, el.scrollHeight + el.offsetHeight - el.clientHeight, window.innerHeight, GAP, EDGE);
      el.style.top = `${at.top}px`;
      el.style.maxHeight = at.maxHeight === null ? "" : `${at.maxHeight}px`;
      el.style.right = `${Math.max(EDGE, window.innerWidth - b.right)}px`;
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, phone, view]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!box.current?.contains(t) && !trigger.current?.contains(t)) close(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(true);
      else if (e.key === "Tab" && view === "change") trapPicker(e);
    };
    // The picker is a small dialog: Tab stays inside it, as in DetailDrawer. On the document, so focus a
    // disabled Save dropped to the body is caught too; trapTarget brings it back in at the edge Tab reaches.
    const trapPicker = (e: KeyboardEvent) => {
      const el = box.current;
      if (!el) return;
      const stops = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((x) => x.getClientRects().length > 0);
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (inOtherDialog(active, el)) return; // a dialog over the picker keeps its own Tab order
      const target = trapTarget(stops, active, !!active && el.contains(active), e.shiftKey);
      if (target) {
        e.preventDefault();
        target.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close, view]);

  // Opening, or coming back from the client manager picker, starts on the
  // first item; the picker starts on its list.
  useEffect(() => {
    if (!open) return;
    box.current?.querySelector<HTMLElement>(view === "menu" ? '[role="menuitem"]' : "select")?.focus();
  }, [open, view]);

  if (!may["org.reviews"]) return null;

  /**
   * Focus leaving the menu and its button shuts it, so a keyboard cannot leave
   * one row's menu open under another's. A focus that goes nowhere (a click on
   * the menu's own padding) is left to the click handler above.
   */
  function onLeave(e: ReactFocusEvent) {
    const next = e.relatedTarget as Node | null;
    if (!open || !next) return;
    if (box.current?.contains(next) || trigger.current?.contains(next)) return;
    close(false);
  }

  /**
   * Up and Down move between the items, as in any menu. Tab leaves it: the
   * menu is portalled to the end of the page, so Tab would otherwise carry
   * focus off the page and leave it open behind the reader.
   */
  function onMenuKey(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key === "Tab") {
      e.preventDefault();
      close(true);
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const items = [...(box.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    if (items.length === 0) return;
    e.preventDefault();
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === "ArrowDown" ? (at + 1) % items.length : (at - 1 + items.length) % items.length;
    items[next].focus();
  }

  const menu = (
    <div
      ref={box}
      className={`cr-menu${phone ? " is-sheet" : ""}`}
      role={view === "menu" ? "menu" : "dialog"}
      aria-label={view === "menu" ? `Actions for ${row.name}` : `${row.name}'s client manager`}
      onKeyDown={view === "menu" ? onMenuKey : undefined}
      onBlur={onLeave}
    >
      <p className="cr-menu-title">{row.name}</p>
      {view === "menu" ? (
        <>
          <ActionItems
            may={may}
            row={row}
            contacts={contacts}
            onAsk={(c) => {
              close(false);
              setConfirm(c);
            }}
            onChange={() => setView("change")}
          />
          {phone && (
            <button type="button" className="admin-btn cr-menu-cancel" onClick={() => close(true)}>
              Cancel
            </button>
          )}
        </>
      ) : (
        <ChangeManager
          may={may}
          row={row}
          contacts={contacts}
          onBack={() => setView("menu")}
          onCancel={() => close(true)}
          onSaved={() => {
            busy.current = false;
            // Back to More unless the reader has gone on to somewhere real outside this
            // menu (another row's menu opened meanwhile). The body counts as here: Save
            // disables itself while it runs, and a browser drops a disabled control's focus there.
            const at = document.activeElement;
            close(!(at && at !== document.body && !box.current?.contains(at)));
            router.refresh();
          }}
          onBusy={(b) => {
            busy.current = b;
          }}
        />
      )}
    </div>
  );

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="admin-btn admin-btn--sm cr-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${row.name}`}
        onClick={() => (open ? close(false) : setOpen(true))}
        onBlur={onLeave}
      >
        More
        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 4.5 6 7.5 9 4.5" />
        </svg>
      </button>
      {open &&
        createPortal(
          <>
            {phone && <div className="cr-menu-backdrop" aria-hidden="true" />}
            {menu}
          </>,
          document.body,
        )}
      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          body={confirm.body}
          confirmLabel={confirm.confirmLabel}
          onConfirm={confirm.run}
          onClose={() => setConfirm(null)}
          onDone={() => router.refresh()}
        />
      )}
    </>
  );
}
