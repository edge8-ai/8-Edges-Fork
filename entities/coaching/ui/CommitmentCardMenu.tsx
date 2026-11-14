"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useNarrow } from "./useNarrow";

// The card's ⋯ button and the box it opens.
//
// It lives apart from the menu's items because where the box goes and when it
// shuts are questions about the CARD, not about what is in it.
//
// Where: on a phone the box is a bottom sheet portalled to the body, because
// the drag library transforms the card while it is being dragged and a
// transformed ancestor makes `position: fixed` resolve against ITSELF rather
// than the viewport — a sheet rendered inside the card would be pinned to a
// moving box (K.29).
//
// When: on a click anywhere else, and on Escape. It did neither, so a menu
// opened by mistake could only be dismissed by finding the same ⋯ again, which
// nobody does (2026-09-22).

export function CommitmentCardMenu({
  busy,
  children,
}: {
  busy: boolean;
  /** The menu's items, given the function that shuts the box behind them. */
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const narrow = useNarrow();

  useEffect(() => {
    if (!open) return;
    // On a phone the box is portalled out of the wrapper, so "inside the menu"
    // is two elements rather than one; testing the wrapper alone would shut the
    // menu on the way down to one of its own items.
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!wrap.current?.contains(t) && !box.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      // Escape puts the reader back on the control they opened, rather than
      // dropping focus onto the body and losing their place on the board.
      trigger.current?.focus();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const menu = (
    <div className="admin-cboard-menu" role="menu" ref={box}>
      {children(() => setOpen(false))}
    </div>
  );

  return (
    <div className="admin-cboard-menu-wrap" ref={wrap}>
      <button
        ref={trigger}
        type="button"
        className="admin-cboard-menu-btn"
        disabled={busy}
        aria-label="What to do with this commitment"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        ⋯
      </button>
      {open && (narrow ? createPortal(menu, document.body) : menu)}
    </div>
  );
}
