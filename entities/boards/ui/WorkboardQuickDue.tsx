"use client";

import { useState } from "react";
import { formatDate } from "@/kernel/ui/format";

/**
 * When this card is due, read as text and edited in place (W.30, quietened in
 * W.93).
 *
 * The resident `<input type="date">` W.30 shipped is what put "dd/mm/yyyy" on
 * every card that had no due date, which is a form placeholder standing where
 * a fact should be. At rest this is the sub line the board has always drawn:
 * the date through kernel/ui/format's formatDate, in the error token when it
 * is overdue, and — when there is no date — a quiet "Set date" that only the
 * pointer or the keyboard brings out, because an empty due date is a fact
 * about the card and not a field waiting to be filled.
 *
 * Clicking swaps this one field into the native date input, which the browser
 * draws outside the scrolling column. A change commits through the callback
 * the board already had; Escape or leaving without a change puts the text
 * back. The swap is on click and never on hover: the drag library refuses a
 * drag that starts on a form control, so a card that wore its controls at
 * rest would be a card with two dead patches on it.
 */
export function WorkboardQuickDue({
  dueDate,
  overdue,
  saving,
  onDueDate,
  label,
}: {
  dueDate: string | null;
  overdue: boolean;
  saving: boolean;
  onDueDate: (date: string | null) => void;
  /**
   * The card face's own words for the date ("Sat 10 Oct", "Overdue · 2 Oct",
   * W.160), drawn first in its line rather than pushed to the end of it; null
   * when the card has no date, which still sits first (bug hunt U1: an empty
   * label used to push "Set date" and everything after it to the right). The
   * List view passes nothing and keeps formatDate at the end of its cell.
   */
  label?: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const end = label === undefined ? " u-ml-auto" : "";

  if (!editing) {
    return (
      <button
        type="button"
        className={
          dueDate
            ? `wb-quick-text wb-quick-due-text${end}${overdue ? " u-err is-overdue" : ""}`
            : `wb-quick-text wb-quick-setdate${end}`
        }
        disabled={saving}
        aria-label={dueDate ? `Due ${formatDate(dueDate)}. Change` : "Set a due date"}
        onClick={() => setEditing(true)}
      >
        {dueDate ? (label || formatDate(dueDate)) : "Set date"}
      </button>
    );
  }

  return (
    <input
      className={`wb-quick-control wb-quick-due${end}${overdue ? " u-err" : ""}`}
      type="date"
      value={dueDate ?? ""}
      disabled={saving}
      aria-label="Due date"
      autoFocus
      onChange={(e) => {
        onDueDate(e.target.value || null);
        setEditing(false);
      }}
      onBlur={() => setEditing(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape") setEditing(false);
      }}
    />
  );
}
