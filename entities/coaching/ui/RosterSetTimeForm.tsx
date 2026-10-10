"use client";

import { useId, useState } from "react";
import { setOneOnOneTime } from "@/entities/coaching/lib/schedule-actions";

// Putting a time on a booking that has none, from the row (K.71). It is not the
// rebook form with the date removed: a move asks for a reason because the
// member reads it, and a coach who is only saying when tomorrow's 1-1 starts
// has no reason to give — the day is not changing. Asking for one anyway is how
// a thirty-second correction turns into a decision somebody has to justify.
//
// Clearing the field and saving takes the time back off, which is why the
// submit is not disabled on an empty value the way the date forms are.
export function SetTimeForm({
  meetingId,
  currentTime,
  busy,
  run,
  onDone,
}: {
  meetingId: string;
  currentTime: string | null;
  busy: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => void;
  onDone: () => void;
}) {
  const [time, setTime] = useState(currentTime ?? "");
  const fieldId = useId();

  return (
    <form
      className="coach-schedule"
      onSubmit={(e) => {
        e.preventDefault();
        if (busy) return;
        run(() => setOneOnOneTime(meetingId, time || null), onDone);
      }}
    >
      <div className="admin-field">
        <label className="admin-label" htmlFor={fieldId}>
          What time does it start?
        </label>
        <input
          id={fieldId}
          className="admin-input"
          type="time"
          value={time}
          autoFocus
          onChange={(e) => setTime(e.target.value)}
        />
        <div className="admin-hint">They see it on their own page and in the calendar file.</div>
      </div>
      <div className="admin-form-actions">
        <button type="submit" className="admin-btn admin-btn--growth" disabled={busy}>
          {busy ? "Saving…" : "Save the time"}
        </button>
      </div>
    </form>
  );
}
