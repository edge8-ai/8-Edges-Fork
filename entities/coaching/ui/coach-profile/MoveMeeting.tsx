"use client";

import { useState } from "react";
import type { OneOnOne } from "@/entities/coaching/lib/data/profile";
import { moveOneOnOne } from "@/entities/coaching/lib/schedule-actions";
import { type ActionResult } from "./shared";
import { DayTimePicker } from "@/entities/coaching/ui/DayTimePicker";

// Move a 1-1 rather than skip it (K.33). Skip records a cycle that did not
// happen; a move records the same meeting on another day, so it keeps the row
// and everything attached to it — the prep, the member's pre-meeting answers,
// the commitments. The why is a one-line inline form for the same reason
// Skip's is: another human reads it on both pages.
export function MoveMeeting({
  m,
  run,
  busy,
  todayIso,
  startOpen = false,
}: {
  m: OneOnOne;
  todayIso: string;
  // Opened from the header's "Move or skip", the form is the point.
  startOpen?: boolean;
  run: (label: string, fn: () => Promise<ActionResult>, onOk?: () => void) => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  const [date, setDate] = useState("");
  // Opens on the time the meeting already has, because the move writes the time
  // as the form gives it and an empty field would quietly clear it (K.71).
  const [time, setTime] = useState(m.startsAt ?? "");
  const [reason, setReason] = useState("");

  // A 1-1 that happened is history and a skipped one is a cycle that did not
  // happen; neither is a thing you reschedule.
  if (m.status !== "scheduled") return null;

  return (
    <div className="admin-coach-block">
      <div className="admin-coach-block-head">
        <span className="admin-eyebrow">Move this 1-1</span>
      </div>
      {open ? (
        <div className="coach-schedule">
          {/* The same day and time chips as booking (K.80): the day it is on
              is not offered, and the time it already has is "their usual". */}
          <DayTimePicker
            todayIso={todayIso}
            preferredTime={m.startsAt}
            day={date}
            time={time}
            onDay={setDate}
            onTime={setTime}
          />
          <label className="coach-picker-label" htmlFor={`move-why-${m.id}`}>
            Why is it moving? <span className="coach-optional">{"they read this"}</span>
          </label>
          <input
            id={`move-why-${m.id}`}
            className="admin-input"
            placeholder="A client call landed on it."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="admin-form-actions">
            <button
              className="admin-btn admin-btn--growth"
              disabled={busy || !date || !reason.trim()}
              onClick={() => {
                // Closed only once it moved: a weekend or a passed day is refused,
                // and the coach should not have to type the reason again (K.79).
                run("Move", () => moveOneOnOne(m.id, date, reason, time || null), () => {
                  setDate("");
                  setReason("");
                  setOpen(false);
                });
              }}
            >
              Move it
            </button>
            <button className="admin-btn admin-btn--ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button className="admin-btn admin-btn--sm" disabled={busy} onClick={() => setOpen(true)}>
          Move to another day
        </button>
      )}
    </div>
  );
}
