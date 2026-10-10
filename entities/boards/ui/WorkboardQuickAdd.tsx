"use client";

import { useEffect, useRef, useState } from "react";
import type { QuickAdd } from "./useWorkboardQuickAdd";

// The foot of a column, as a place to write a card rather than a button that
// opens a form (W.92.8).
//
// Three keys, and the file exists to make them predictable:
//   Enter        — make the card here, with the board's defaults, and stay in
//                  the field so the next one can be typed straight away.
//   Shift+Enter  — the same title, but in the full drawer, for the card that
//                  turned out to need an owner and a date after all.
//   Esc          — never mind. The field closes and the button comes back.
//
// The card appears the moment Enter is pressed, as a faint row under the real
// ones, and is replaced by the real card when the refresh lands. It is not a
// pretend card in the board's own list: the grouping, the sort and the drag
// contract all read that list, and a row that the server has not agreed to
// has no business being dragged. What the ghost promises is only "this was
// heard", which is the part a person needs within 100ms.

export function WorkboardQuickAdd({
  laneId,
  cardCount,
  saving,
  quickAdd,
  onOpenDrawer,
}: {
  laneId: string;
  /** What the column holds now. A change means the refresh landed, so the ghosts go. */
  cardCount: number;
  saving: boolean;
  quickAdd: QuickAdd;
  /** Shift+Enter: the full drawer, prefilled with what was typed. */
  onOpenDrawer: (laneId: string, title: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [ghosts, setGhosts] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // The column's own count is the reconciliation signal: once the refresh has
  // delivered the new card, the ghost standing in for it is redundant.
  useEffect(() => setGhosts([]), [cardCount]);
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function submit(toDrawer: boolean) {
    const t = title.trim();
    if (!t) return;
    setTitle("");
    if (toDrawer) {
      setOpen(false);
      onOpenDrawer(laneId, t);
      return;
    }
    setGhosts((g) => [...g, t]);
    // Straight back into the field: the next card is usually already in
    // somebody's head, and a control that has to be reopened between two of
    // them is the form it was meant to replace.
    inputRef.current?.focus();
    // The ghost is cleared by the count change on success. A refusal changes
    // no count and brings no refresh, so it takes this ghost back itself and
    // returns the sentence to the field, where it can be fixed and sent again;
    // the banner says what was wrong (W.141). A second line typed in the
    // meantime is never overwritten.
    quickAdd(
      laneId,
      t,
      () => inputRef.current?.focus(),
      () => {
        setGhosts((g) => {
          const i = g.indexOf(t);
          return i < 0 ? g : [...g.slice(0, i), ...g.slice(i + 1)];
        });
        setTitle((current) => (current.trim() === "" ? t : current));
      },
    );
  }

  return (
    <>
      {ghosts.map((t, i) => (
        <div key={`${t}-${i}`} className="wb-quickadd-ghost" aria-hidden="true">
          {t}
        </div>
      ))}
      {open ? (
        <div className="wb-quickadd">
          <input
            ref={inputRef}
            className="admin-input wb-quickadd-input"
            placeholder="Card title…"
            value={title}
            disabled={saving}
            aria-label="New card title"
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit(e.shiftKey);
              } else if (e.key === "Escape") {
                e.preventDefault();
                setTitle("");
                setOpen(false);
              }
            }}
            // Clicking away closes the field only when there is nothing in
            // hand: a typed line must never be lost to a stray click, and
            // somebody who has just added one card is almost certainly about
            // to add another, so the field survives the re-render Enter
            // causes. Esc is the deliberate way out.
            onBlur={() => title.trim() === "" && ghosts.length === 0 && setOpen(false)}
          />
          <p className="admin-hint wb-quickadd-hint">Enter to add · Shift+Enter for the full card · Esc to close</p>
        </div>
      ) : (
        <button className="admin-kanban-add" onClick={() => setOpen(true)}>
          + Add a card
        </button>
      )}
    </>
  );
}
