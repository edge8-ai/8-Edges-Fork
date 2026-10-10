"use client";

import { useState, useTransition, type FormEvent } from "react";
import { scheduleOneOnOne } from "@/entities/coaching/lib/meeting-actions";
import { DayTimePicker } from "@/entities/coaching/ui/DayTimePicker";

// The one form that books a 1-1, rendered wherever the coach asks for one
// (G.1): the header, the Next tab's empty state, the first-visit block and the
// roster row all share it, so there is one booking flow rather than several
// that drift apart.
//
// K.80 made it one click for the usual answer. It opens on the day that keeps
// the rhythm and the time the person said suits them, both as chips, so
// booking the likely 1-1 is "Book it"; any other day or time is a chip away.
export function ScheduleForm({
  profileId,
  submitLabel = "Book it",
  minDate,
  suggestedOn = null,
  preferredTime = null,
  autoFocus = false,
  onScheduled,
  onCancel,
}: {
  profileId: string;
  submitLabel?: string;
  // Today in Saigon, resolved on the server so the choices agree with the
  // rest of the page rather than with the reader's own clock.
  minDate?: string;
  suggestedOn?: string | null;
  preferredTime?: string | null;
  autoFocus?: boolean;
  onScheduled?: () => void;
  onCancel?: () => void;
}) {
  const today = minDate ?? new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(suggestedOn && suggestedOn >= today ? suggestedOn : "");
  // Empty means "the time they said suits them", which the action fills in.
  const [time, setTime] = useState(preferredTime ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!date || busy) return;
    setError(null);
    startTransition(async () => {
      let res;
      try {
        res = await scheduleOneOnOne(profileId, date, time || null);
      } catch {
        res = { ok: false as const, error: "That did not go through. Try again." };
      }
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onScheduled?.();
    });
  };

  return (
    <form className="coach-schedule" onSubmit={submit} data-autofocus={autoFocus || undefined}>
      <DayTimePicker
        todayIso={today}
        suggestedOn={suggestedOn}
        preferredTime={preferredTime}
        day={date}
        time={time}
        onDay={setDate}
        onTime={setTime}
      />
      {error && <div className="admin-alert admin-alert--err">{error}</div>}
      <div className="admin-form-actions">
        <button type="submit" className="admin-btn admin-btn--growth" disabled={busy || !date}>
          {busy ? "Booking…" : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="admin-btn admin-btn--ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
