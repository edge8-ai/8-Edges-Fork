"use client";

import { useState, type ReactNode } from "react";
import { formatDate } from "@/kernel/ui/format";
import type { Card } from "./board-view-types";
import { faceDate } from "./card-face";

/**
 * A cell of the List that READS at rest and edits on click (W.108).
 *
 * The board learned this in W.93: a fact is read a hundred times for every
 * time it is changed, so the resting state is the fact itself and the control
 * appears for the one field somebody clicked. The List had gone the other way
 * — five `<select>`s and a date input on every row — and Khoa, setting it
 * beside ClickUp on 2026-09-22, called it funky: a table of facts dressed as a
 * page of forms, with "dd/mm/yyyy" printed wherever a card had no due date.
 *
 * This is the generic half of that pattern. The board's own two fields keep
 * their own components (WorkboardQuickAssignee, WorkboardQuickDue) because
 * each carries a resting look that belongs to the CARD; the List's cells only
 * need the swap, so they share it here rather than growing five near-copies.
 *
 * A read-only surface renders the text and nothing else: `canEdit` false must
 * leave no button, no affordance and no promise that a click does something.
 */
export function WorkboardListEdit({
  canEdit,
  saving,
  label,
  title,
  text,
  control,
}: {
  canEdit: boolean;
  saving: boolean;
  /** The whole aria-label of the resting button, which says what it changes. */
  label: string;
  /** The full value when the cell shows a shortened one (a sprint's name). */
  title?: string;
  /** What the cell reads when nobody is editing it. */
  text: ReactNode;
  /** The control the click swaps in; `close` puts the text back unchanged. */
  control: (close: () => void) => ReactNode;
}) {
  const [editing, setEditing] = useState(false);

  if (!canEdit) return <span title={title}>{text}</span>;
  if (editing) return <>{control(() => setEditing(false))}</>;

  return (
    <button
      type="button"
      className="wb-list-edit"
      disabled={saving}
      title={title}
      aria-label={label}
      onClick={() => setEditing(true)}
    >
      {text}
    </button>
  );
}

/**
 * What an empty cell prints (W.108).
 *
 * An en dash in the lightest grey, never a form placeholder and never an em
 * dash in ink: the row is a line of facts, and "this card has no sprint" is
 * one of them — it should be legible without competing with the facts that
 * are there.
 */
export function ListDash() {
  return <span className="wb-list-dash">–</span>;
}

/**
 * The Due cell (W.108, worded in W.175).
 *
 * It reads in the card face's own words (faceDate): "Thu 8 Oct", "Overdue ·
 * 6 Oct" in the error ink, "Done 7 Oct" for finished work — and "Today", in
 * the accent, for an open card due today. It used to print "Oct 8, 2026": a
 * year on every row of a month nobody was unsure of, in words the board and
 * the Calendar never use for the same date.
 *
 * It builds its own swap rather than reusing WorkboardQuickDue: the card's
 * version prints "Set date" when there is no date and hides it until the
 * pointer arrives, which is right for a card that must not change height under
 * a passing pointer and wrong for a table, where an empty cell has to read as
 * the fact it is — an en dash, like every other empty cell in the row.
 */
export function ListDue({
  card,
  today,
  overdue,
  canEdit,
  saving,
  onDue,
}: {
  card: Card;
  today: string;
  overdue: boolean;
  canEdit: boolean;
  saving: boolean;
  onDue: (date: string | null) => void;
}) {
  const face = faceDate(card, overdue);
  const dueToday = card.status === "open" && card.due_date?.slice(0, 10) === today;
  return (
    <td className={overdue ? "u-err" : dueToday ? "wb-list-due-today" : undefined}>
      <WorkboardListEdit
        canEdit={canEdit}
        saving={saving}
        // The name says what the cell shows, so "Today" or "Done 7 Oct" is
        // not announced as an older wording of the same date.
        label={card.due_date ? `${dueToday ? "Due today" : face?.kind === "due" ? `Due ${face.text}` : face?.text ?? `Due ${formatDate(card.due_date)}`}. Change the due date` : "Set a due date"}
        text={dueToday ? "Today" : face?.text ?? <ListDash />}
        control={(close) => (
          <input
            className="wb-list-control"
            type="date"
            aria-label="Due date"
            value={card.due_date ?? ""}
            disabled={saving}
            autoFocus
            {...closeHandlers(close)}
            onChange={(e) => {
              onDue(e.target.value || null);
              close();
            }}
          />
        )}
      />
    </td>
  );
}

/**
 * The keyboard and blur contract every swapped-in control shares (W.93): a
 * change commits and closes, Escape abandons, and leaving without a change
 * puts the text back, because nothing was changed and nothing should still
 * look changeable.
 */
export function closeHandlers(close: () => void) {
  return {
    onBlur: close,
    onKeyDown: (e: { key: string }) => {
      if (e.key === "Escape") close();
    },
  };
}
