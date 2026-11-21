"use client";

import { addDays, isWeekend, nextWorkday, previousWorkday } from "@/kernel/config/dates";
import { chipDate } from "./card-chips";

/**
 * The one thing a plain date input never said (W.68).
 *
 * A Saturday is accepted without comment, and a due date on a day nobody
 * works is a card that turns overdue the next day (Sunday for a Saturday,
 * Monday for a Sunday) for no reason anybody chose, and then colours red on
 * the card and in the daily digest.
 *
 * So this WARNS and OFFERS, and that is all. The typed date is already in the
 * form when the note appears; the two buttons are shortcuts, not a condition
 * of saving, and nothing here rewrites what was picked. Some weeks are like
 * that, and the board does not get to tell people when to work — the same
 * line the WIP limit takes one card over (W.31).
 *
 * The date input itself moved into the drawer's header bar with W.92.6, so
 * this is the note alone, rendered under that bar where it has the width to
 * say its piece.
 *
 * Its dates read as the chips beside it do ("Sat 10 Oct", bug hunt U5): the
 * drawer's due chip says "Sat 10 Oct", and a note under it that said
 * "Oct 10, 2026" read as a second date. The weekday is in the words, so the
 * buttons need no "Friday" in front of them.
 */
export function CardDueWeekendNote({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  if (value === "" || !isWeekend(value)) return null;
  return (
    <div className="wb-weekend-note">
      {/* Not role="alert": nothing has gone wrong. It is a note the person may
          take or leave, and an assertive announcement on every keystroke of a
          typed date would be its own nuisance. */}
      {/* The day after the due date, by the board's rule (A.29.1): a card due
          on Saturday is overdue from Sunday, not Monday. */}
      <p className="admin-hint">
        {chipDate(value)} is a weekend — this card reads as overdue from {isWeekend(addDays(value, 1)) ? "Sunday" : "Monday"}.
      </p>
      <div className="u-row u-gap-2 u-mt-1">
        <button
          type="button"
          className="admin-btn admin-btn--sm"
          disabled={disabled}
          onClick={() => onChange(previousWorkday(value))}
        >
          {chipDate(previousWorkday(value))}
        </button>
        <button
          type="button"
          className="admin-btn admin-btn--sm"
          disabled={disabled}
          onClick={() => onChange(nextWorkday(value))}
        >
          {chipDate(nextWorkday(value))}
        </button>
      </div>
    </div>
  );
}
