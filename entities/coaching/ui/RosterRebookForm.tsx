"use client";

import { useId, useState } from "react";
import { moveOneOnOne } from "@/entities/coaching/lib/schedule-actions";

// Rebooking is a MOVE, not a new booking (K.33): it keeps the meeting row and
// everything hanging off it — the prep, the member's pre-meeting answers, the
// commitments — where scheduling a fresh 1-1 would leave the passed one still
// passed. moveOneOnOne asks for a reason because the member reads it on their
// own page, so this form has the field the propose form does not.
export function RebookForm({
  meetingId,
  name,
  minDate,
  currentTime,
  busy,
  run,
  onDone,
}: {
  meetingId: string;
  name: string;
  minDate: string;
  // The time this booking already starts at, "HH:MM" or null. The field opens
  // on it so a move keeps the time by default; whatever comes back is written
  // as given, which is also how a time is taken back off (K.71).
  currentTime: string | null;
  busy: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => void;
  onDone: () => void;
}) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState(currentTime ?? "");
  const [reason, setReason] = useState("");
  const fieldId = useId();

  return (
    <form
      className="coach-schedule"
      onSubmit={(e) => {
        e.preventDefault();
        if (!date || !reason.trim() || busy) return;
        run(() => moveOneOnOne(meetingId, date, reason, time || null), onDone);
      }}
    >
      <div className="admin-field">
        <label className="admin-label" htmlFor={`${fieldId}-d`}>
          New day
        </label>
        <input
          id={`${fieldId}-d`}
          className="admin-input"
          type="date"
          value={date}
          min={minDate}
          autoFocus
          onChange={(e) => setDate(e.target.value)}
        />
      </div>
      <div className="admin-field">
        <label className="admin-label" htmlFor={`${fieldId}-t`}>
          Time
        </label>
        <input
          id={`${fieldId}-t`}
          className="admin-input"
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
        />
      </div>
      <div className="admin-field">
        <label className="admin-label" htmlFor={`${fieldId}-r`}>
          Why it moved — {name} reads this
        </label>
        <input
          id={`${fieldId}-r`}
          className="admin-input"
          value={reason}
          placeholder="We both had the release that day."
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
      <div className="admin-form-actions">
        <button type="submit" className="admin-btn admin-btn--growth" disabled={busy || !date || !reason.trim()}>
          {busy ? "Moving…" : "Move it"}
        </button>
      </div>
    </form>
  );
}
