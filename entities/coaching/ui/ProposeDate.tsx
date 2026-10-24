"use client";

import { useState, useTransition } from "react";
import { proposeMyOneOnOneDate } from "@/entities/coaching/lib/my-actions";
import { WEEKDAY_NAMES } from "@/entities/coaching/lib/cadence";
import { formatDate } from "@/kernel/ui/format";
import { LeaveNote } from "./LeaveNote";
import type { LeaveSpan } from "@/entities/coaching/lib/leave-window";

// "Pick a day that works" (K.32): the member's half of booking a 1-1. Which
// state shows is a property of the schedule, not of the member. Someone who
// has never had a 1-1 names their first day and it IS the 1-1 — there is
// nothing to negotiate with. After that, with nothing booked, the day they name
// is a proposal their coach confirms, and the form opens on the day that keeps
// their rhythm (ADR-0010); with a 1-1 booked they are asking to move it. While
// a proposal is open there is nothing to do but the line saying so, because a
// second proposal would only be a race with the first.

// The weekday beside the date, read from the date string alone so the server's
// locale never gets a say. Date-only strings parse at midnight UTC.
function weekdayOf(iso: string): string {
  return WEEKDAY_NAMES[new Date(`${iso}T00:00:00Z`).getUTCDay()];
}

export function ProposeDate({
  nextOn,
  proposedOn,
  suggestedOn = null,
  hasMet = false,
  coachName,
  coachLeave = [],
}: {
  nextOn: string | null;
  proposedOn: string | null;
  suggestedOn?: string | null;
  hasMet?: boolean;
  coachName: string | null;
  // When the coach is away, so the member proposes a day their coach can make
  // (L.2). Their own holidays are not shown back to them — they know those.
  coachLeave?: LeaveSpan[];
}) {
  const [date, setDate] = useState(nextOn ? "" : (suggestedOn ?? ""));
  // Only a first 1-1 is booked by the member's own day; anything else waits for
  // the coach (data/proposals.ts decides it the same way).
  const booksDirectly = !nextOn && !hasMet;
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const propose = () => {
    setError(null);
    setToast(null);
    startTransition(async () => {
      const res = await proposeMyOneOnOneDate(date);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setToast(
        booksDirectly
          ? "Booked. Your coach has the day and a link to the page."
          : "Sent. Your coach has the day and a link to the page.",
      );
    });
  };

  if (proposedOn) {
    return (
      <section className="admin-card admin-coach-section">
        <div className="admin-card-title">Waiting on your coach</div>
        <div className="admin-hint">
          You proposed {weekdayOf(proposedOn)} {formatDate(proposedOn)}.{" "}
          {coachName ?? "Your coach"} confirms it from their roster, and it lands here as your next 1-1.
        </div>
      </section>
    );
  }

  return (
    <section className="admin-card admin-coach-section">
      <div className="admin-card-title">{nextOn ? "Need a different day?" : "Pick a day that works"}</div>
      <div className="admin-hint">
        {nextOn
          ? `${weekdayOf(nextOn)} ${formatDate(nextOn)} is on the calendar. Name another weekday and ${coachName ?? "your coach"} moves it in a click — your prep and what you wrote stay with the meeting.`
          : booksDirectly
            ? `No 1-1 on the calendar yet. Name a weekday that suits you and it is booked; ${coachName ?? "your coach"} gets a line about it.`
            : `${coachName ?? "Your coach"} hasn't booked the next 1-1.${suggestedOn ? ` ${weekdayOf(suggestedOn)} ${formatDate(suggestedOn)} would keep your rhythm.` : ""} Name a day and they confirm it.`}
      </div>
      <div className="admin-coach-field-row">
        <div className="admin-field">
          <label className="admin-label" htmlFor="propose-date">
            Day
          </label>
          <input
            id="propose-date"
            className="admin-input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        {date && <span className="admin-cell-muted">{weekdayOf(date)}</span>}
      </div>
      {/* Says nothing when the day is fine, which is almost always (L.2). */}
      <LeaveNote
        dateISO={date || null}
        spans={coachLeave}
        who={coachName ?? "Your coach"}
      />
      <div className="admin-form-actions">
        <button type="button" className="admin-btn" disabled={pending || !date} onClick={propose}>
          {pending ? "Sending…" : nextOn ? "Ask to move it" : "Propose this day"}
        </button>
        {toast && <span className="admin-cell-muted">{toast}</span>}
      </div>
      {error && <div className="admin-alert admin-alert--err">{error}</div>}
    </section>
  );
}
