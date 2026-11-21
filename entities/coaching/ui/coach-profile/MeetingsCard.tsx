"use client";

import type { CoachProfileDetail } from "@/entities/coaching/lib/data/profile";
import { splitBookings } from "@/entities/coaching/lib/missed";
import { currentCycleCheckin } from "@/entities/coaching/lib/types";
import { describeDay } from "@/entities/coaching/lib/cadence";
import { type RenderedHtml, type ActionResult } from "./shared";
import { MeetingRow } from "./MeetingRow";
import { ScheduleForm } from "./ScheduleForm";

export function MeetingsCard({
  detail,
  html,
  run,
  busy,
  view,
  todayIso,
}: {
  detail: CoachProfileDetail;
  html: RenderedHtml;
  run: (label: string, fn: () => Promise<ActionResult>, onOk?: () => void) => void;
  busy: boolean;
  view: "next" | "log";
  todayIso: string;
}) {
  // The next 1-1 is the earliest booking still to come; a booking whose day
  // passed is not it, however early (splitBookings, K.79). Picking by status
  // alone made a passed booking "Next 1-1" and hid a real future one from both
  // tabs. The header reads the same split.
  const { next: nextMeeting, passed } = splitBookings(detail.meetings);
  const nextMeetingId = nextMeeting?.id ?? null;

  // The member's pre-meeting form for the upcoming 1-1: the newest check-in
  // row stamped between the last held 1-1 and that meeting's date.
  const lastHeldOn =
    detail.meetings.filter((m) => m.status === "held").reduce<string | null>((latest, m) => (!latest || m.heldOn > latest ? m.heldOn : latest), null);
  const nextCheckin = nextMeeting
    ? currentCycleCheckin(detail.checkins, lastHeldOn, nextMeeting.heldOn)
    : null;

  // "next" is the walk-into-the-room view: any booking whose day passed
  // unanswered first (it asks what happened, with its own way out), then the
  // upcoming 1-1 open on its prep. "log" is everything that is not still to
  // come, passed bookings included, so no row is ever in neither tab.
  const rows =
    view === "next"
      ? [...passed, ...(nextMeeting ? [nextMeeting] : [])]
      : detail.meetings.filter((m) => m.outcome !== "booked");

  return (
    <section className="admin-card admin-coach-section">
      <div className="admin-card-title">{view === "next" ? "This session" : "Past sessions"}</div>

      {/* An empty state that books the 1-1 rather than telling the coach where
          the button is (G.1). "Schedule one from the top of the page" made the
          reader go and look for a control they were already standing next to. */}
      {view === "next" && !nextMeetingId && (
        <>
          {/* Nothing booked is said as it is. The day that keeps the rhythm sits
              beside it and the form opens on it, so booking the suggestion is
              one click; it is never shown as a booking (ADR-0010). */}
          <div className="admin-empty">
            Nothing booked with {detail.member.name}.{" "}
            {detail.suggestedOn
              ? `${describeDay(detail.suggestedOn)} keeps the rhythm.`
              : "Pick a day and it is booked."}
          </div>
          <ScheduleForm profileId={detail.profileId} minDate={todayIso} suggestedOn={detail.suggestedOn} />
        </>
      )}
      {view === "log" && rows.length === 0 && <div className="admin-empty">No 1-1s yet.</div>}

      {rows.map((m) => (
        <MeetingRow
          key={m.id}
          m={m}
          html={html.meetings[m.id]}
          run={run}
          busy={busy}
          isNext={m.id === nextMeetingId}
          checkin={m.id === nextMeetingId && view === "log" ? nextCheckin : null}
          memberLeave={detail.memberLeave}
          todayIso={todayIso}
        />
      ))}
    </section>
  );
}
