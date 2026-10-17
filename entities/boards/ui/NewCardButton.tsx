"use client";

import { useEffect, useRef, useState } from "react";
import type { CardTemplate } from "@/entities/boards/lib/card-templates";

// "New card", and the templates behind it (W.58).
//
// A board with no templates renders EXACTLY the button it always did — same
// element, same classes, same label, no caret — because most boards have
// none and a disclosure that never discloses anything is a cost with no
// return. The split only appears once a board has something to offer.
export function NewCardButton({ templates, onNew }: { templates: CardTemplate[]; onNew: (template?: CardTemplate) => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  // Close on a click anywhere else and on Escape — the two ways a person
  // expects to dismiss a menu they opened by mistake.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (templates.length === 0) {
    return (
      <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={() => onNew()}>
        New card
      </button>
    );
  }

  return (
    <div className="admin-board-newcard" ref={wrap}>
      <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={() => onNew()}>
        New card
      </button>
      <button
        className="admin-btn admin-btn--primary admin-btn--sm admin-board-newcard-caret"
        aria-label="New card from a template"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        ▾
      </button>
      {open && (
        <div className="admin-board-newcard-menu" role="menu">
          {templates.map((t, i) => (
            <button
              key={i}
              type="button"
              role="menuitem"
              className="admin-board-newcard-item"
              onClick={() => {
                setOpen(false);
                onNew(t);
              }}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
