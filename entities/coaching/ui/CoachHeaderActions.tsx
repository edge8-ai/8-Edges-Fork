"use client";

import { useState, useTransition } from "react";
import type { OneOnOne } from "@/entities/coaching/lib/data/profile";
import { ScheduleForm } from "./coach-profile/ScheduleForm";
import { MoveMeeting } from "./coach-profile/MoveMeeting";
import { SkipMeeting } from "./coach-profile/SkipMeeting";
import { MarkSessionDone } from "./MarkSessionDone";

type ActionResult = { ok: true } | { ok: false; error: string };

// The header's jobs (K.80): close a session, change the one that is booked,
// and book the next one.
//
// "Mark a session done" is always offered and always the filled button: a
// coach can hold a session whenever and however they like. It replaced "Log a
// past 1-1", which wanted a date and a transcript. "Move or skip" works on the
// booked session from here, where the coach is looking, rather than from a
// fold at the foot of the page. Booking is offered only when nothing is ahead,
// and straight after a session is marked done, opened on the day that keeps
// the rhythm.
export function CoachHeaderActions({
  profileId,
  name,
  todayIso,
  next,
  passedDay,
  suggestedOn,
  preferredTime,
  scheduleLivesBelow = false,
}: {
  profileId: string;
  name: string;
  todayIso: string;
  // The booking still ahead, whole, so Move and Skip can act on it.
  next: OneOnOne | null;
  passedDay: string | null;
  suggestedOn: string | null;
  preferredTime: string | null;
  // Nothing has happened between these two yet: the first-visit block below
  // carries the booking, so the header does not offer a second one (G.1).
  scheduleLivesBelow?: boolean;
}) {
  const [panel, setPanel] = useState<null | "done" | "book" | "after-done" | "move">(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const toggle = (p: NonNullable<typeof panel>) => setPanel((cur) => (cur === p ? null : p));

  // Move and Skip close their panel only when the write landed (K.79).
  const run = (label: string, fn: () => Promise<ActionResult>, onOk?: () => void) => {
    setError(null);
    startTransition(async () => {
      let res: ActionResult;
      try {
        res = await fn();
      } catch {
        res = { ok: false, error: "That did not go through. Try again." };
      }
      if (!res.ok) setError(`${label}: ${res.error}`);
      else {
        onOk?.();
        setPanel(null);
      }
    });
  };

  return (
    <div className="admin-coach-hero__actions">
      <div className="admin-coach-hero__actionbtns">
        {next && (
          <button type="button" className="admin-btn" aria-expanded={panel === "move"} onClick={() => toggle("move")}>
            Move or skip
          </button>
        )}
        {!scheduleLivesBelow && !next && (
          <button type="button" className="admin-btn" aria-expanded={panel === "book"} onClick={() => toggle("book")}>
            Book the next session
          </button>
        )}
        <button type="button" className="admin-btn admin-btn--growth" aria-expanded={panel === "done"} onClick={() => toggle("done")}>
          Mark a session done
        </button>
      </div>

      {error && <div className="admin-alert admin-alert--err admin-coach-hero__msg">{error}</div>}

      {panel === "done" && (
        <div className="admin-coach-hero__panel coach-hero-panel--wide">
          <MarkSessionDone
            profileId={profileId}
            name={name}
            todayIso={todayIso}
            passedDay={passedDay}
            bookedDay={next?.heldOn ?? null}
            onClose={() => setPanel(null)}
            onDone={() => setPanel("after-done")}
          />
        </div>
      )}

      {panel === "move" && next && (
        <div className="admin-coach-hero__panel coach-hero-panel--wide">
          <MoveMeeting m={next} run={run} busy={busy} todayIso={todayIso} startOpen />
          <SkipMeeting m={next} run={run} busy={busy} />
        </div>
      )}

      {(panel === "book" || panel === "after-done") && (
        <div className="admin-coach-hero__panel coach-hero-panel--wide">
          {panel === "after-done" && (
            <p className="coach-done-ok" role="status">
              Done. {name} has been asked for their FAST goal update or a reflection.
              {next ? "" : " Book the next one?"}
            </p>
          )}
          {(panel === "book" || !next) && (
            <ScheduleForm
              profileId={profileId}
              minDate={todayIso}
              suggestedOn={suggestedOn}
              preferredTime={preferredTime}
              onScheduled={() => setPanel(null)}
              onCancel={() => setPanel(null)}
            />
          )}
        </div>
      )}
    </div>
  );
}
