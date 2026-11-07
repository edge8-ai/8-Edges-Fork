"use client";

import { useState, useTransition } from "react";
import type { LeaveSpan } from "@/entities/coaching/lib/leave-window";
import { setMyPreferredSlot } from "@/entities/coaching/lib/my-actions";
import { ProposeDate } from "./ProposeDate";
import { MissedOneOnOne } from "./MissedOneOnOne";

// The member's 1-1 time: one Saigon time of day, stated once on their own page
// and read by the coach. The day is the pair's rhythm, read off their 1-1s
// (A.31), so the form asks for nothing it would not use.

export function PreferredSlot({
  preferredTime,
  nextOn,
  coachName,
  proposedOn,
  missedOn,
  suggestedOn,
  hasMet,
  coachLeave,
  myLeave,
}: {
  preferredTime: string | null;
  // The date of the next 1-1, when there is one.
  nextOn: string | null;
  coachName: string | null;
  // A date this member has proposed that the coach has not answered (K.32).
  proposedOn: string | null;
  // The day of a 1-1 that was booked and did not happen (K.36); null otherwise.
  missedOn: string | null;
  // The day that would keep the rhythm when nothing is booked (ADR-0010), and
  // whether the member has had a 1-1: someone who has not books directly.
  suggestedOn: string | null;
  hasMet: boolean;
  // Who is away, and when (L.2): the coach's holidays so a proposed day is one
  // they can make, the member's own so a 1-1 missed over one stays quiet.
  coachLeave: LeaveSpan[];
  myLeave: LeaveSpan[];
}) {
  const [time, setTime] = useState<string>(preferredTime ?? "");
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () => {
    setToast(null);
    setError(null);
    startTransition(async () => {
      const res = await setMyPreferredSlot(time || null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setToast(time ? "Saved. Your coach sees it." : "Saved. No time set yet.");
    });
  };

  return (
    <>
      {/* Picking the day of the next 1-1 (K.32) sits above the standing
          preference (K.34): one is about the meeting in front of you, the
          other about every meeting after it. */}
      {/* The miss comes first, because "that day went by" is the thing to
          answer before picking another one (K.36). */}
      <MissedOneOnOne missedOn={missedOn} coachName={coachName} myLeave={myLeave} />
      <ProposeDate
        nextOn={nextOn}
        proposedOn={proposedOn}
        suggestedOn={suggestedOn}
        hasMet={hasMet}
        coachName={coachName}
        coachLeave={coachLeave}
      />
      <section className="admin-card admin-coach-section">
        <div className="admin-card-title">Your 1-1 time</div>
        <div className="admin-hint">
          The time of day that suits you for 1-1s; {coachName ?? "your coach"} sees it.
        </div>
        <div className="admin-coach-field-row">
          <div className="admin-field">
            <label className="admin-label" htmlFor="preferred-time">
              Time (Saigon)
            </label>
            <input
              id="preferred-time"
              className="admin-input"
              type="time"
              step={900}
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>
        </div>
        <div className="admin-form-actions">
          <button type="button" className="admin-btn" disabled={pending} onClick={save}>
            {pending ? "Saving…" : "Save"}
          </button>
          {toast && <span className="admin-cell-muted">{toast}</span>}
        </div>
        {error && <div className="admin-alert admin-alert--err">{error}</div>}
      </section>
    </>
  );
}
