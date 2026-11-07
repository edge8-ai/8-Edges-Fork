"use client";

import Link from "next/link";
import { useCallback, useState, useTransition } from "react";
import { confirmProposedDate, declineProposedDate } from "@/entities/coaching/lib/schedule-actions";
import { ScheduleForm } from "@/entities/coaching/ui/coach-profile/ScheduleForm";
import { MarkSessionDone } from "./MarkSessionDone";
import type { RowAction, RowActionBar } from "@/entities/coaching/lib/row-actions";
import { RebookForm } from "./RosterRebookForm";
import { SetTimeForm } from "./RosterSetTimeForm";
import { RecapDrawer } from "./RosterRecapDrawer";

// The coach's roster row, ended (K.57, doc §C.3). Which controls appear and
// which one is filled is decided by the pure rowActions() on the server; this
// island is only the three behaviours a link cannot have — two writes done from
// the row, the booking and "mark it done" panels, and the recap drawer.
//
// ProposalActions used to live in its own bordered footer below the row. It is
// folded in here because a proposal is one of the row's states, not a second
// widget: a coach should find the row's next move in one place whatever the row
// is waiting for.

type Props = {
  bar: RowActionBar;
  profileId: string;
  name: string;
  missedMeetingId: string | null;
  // The day that booking was for: "Mark it done" closes that session on it.
  missedOn: string | null;
  // The booking still ahead, if any: "Mark it done" asks whether this was it.
  nextOn: string | null;
  missedStartsAt: string | null;
  // The booking the row's "Set the time" writes to, and the time it already
  // carries (K.71). Null on a row with no booking, which is the one state that
  // control is never offered in.
  nextMeetingId: string | null;
  nextStartsAt: string | null;
  // Today in Saigon, resolved on the server, so the booking fields agree with
  // the rest of the page rather than with the reader's own clock.
  todayIso: string;
};

export function RosterRowActions({
  bar,
  profileId,
  name,
  missedMeetingId,
  missedOn,
  nextOn,
  missedStartsAt,
  nextMeetingId,
  nextStartsAt,
  todayIso,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [recapOpen, setRecapOpen] = useState(false);
  // Which booking form is open in the row, if any (G.9). "propose" puts a new
  // day in; "rebook" moves the booking that passed, which is a different
  // write and carries a reason the member reads (K.33).
  const [booking, setBooking] = useState<null | "propose" | "rebook" | "set-time" | "done">(null);

  const run = useCallback((fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => {
    setError(null);
    startTransition(async () => {
      // A server action can reject as well as return a failure — a dropped
      // connection, or a session that expired between the page load and the
      // click. Without this the row would sit on "Saving…" with nothing said.
      try {
        const res = await fn();
        if (res.ok) after?.();
        else setError(res.error ?? "Something went wrong.");
      } catch {
        setError("That did not reach the server. Try again.");
      }
    });
  }, []);

  const control = (a: RowAction, filled: boolean) => {
    if (a.href) {
      return (
        <Link
          key={a.id}
          href={a.href}
          className={filled ? "admin-btn coach-row-actions-filled" : "admin-btn"}
        >
          {a.label}
        </Link>
      );
    }
    const toggleBooking = (which: "propose" | "rebook" | "set-time" | "done") => () => {
      setError(null);
      setBooking((cur) => (cur === which ? null : which));
    };
    const onClick =
      a.id === "confirm"
        ? () => run(() => confirmProposedDate(profileId))
        : a.id === "decline"
          ? () => run(() => declineProposedDate(profileId))
          : a.id === "mark-held"
            ? toggleBooking("done")
            : a.id === "propose" || a.id === "rebook" || a.id === "set-time"
              ? toggleBooking(a.id)
              : () => setRecapOpen(true);
    const open = booking === a.id || (a.id === "mark-held" && booking === "done");
    return (
      <button
        key={a.id}
        type="button"
        className={filled ? "admin-btn coach-row-actions-filled" : "admin-btn"}
        disabled={pending}
        aria-expanded={a.id === "propose" || a.id === "rebook" || a.id === "set-time" || a.id === "mark-held" ? open : undefined}
        onClick={onClick}
      >
        {pending && filled ? "Saving…" : open ? "Cancel" : a.label}
      </button>
    );
  };

  // Booking, in place (G.9). Putting a day in is what a coach opens this page
  // to do, and it used to be the one control that sent them somewhere else.
  // The propose form is the very component the coach profile uses, so there is
  // one booking flow rather than two.
  //
  // Built once and rendered by BOTH shapes of this island, for the same reason
  // the toast is: the shortlist offers the row's filled control, so a shortlist
  // entry can be "Propose a day" too. Rendering the panel only in the row left
  // that button flipping to "Cancel" with no form under it — a dead control,
  // which is the whole defect this change exists to remove.
  const bookingPanel =
    booking === "propose" ? (
      <div className="coach-row-booking">
        <ScheduleForm
          profileId={profileId}
          submitLabel={`Book it with ${name}`}
          preferredTime={nextStartsAt}
          minDate={todayIso}
          suggestedOn={bar.filled?.suggestedOn ?? null}
          autoFocus
          onScheduled={() => setBooking(null)}
        />
      </div>
    ) : booking === "done" ? (
      <div className="coach-row-booking">
        <MarkSessionDone
          profileId={profileId}
          name={name}
          todayIso={todayIso}
          passedDay={missedOn}
          bookedDay={nextOn}
          onClose={() => setBooking(null)}
          onDone={() => setBooking(null)}
        />
      </div>
    ) : booking === "rebook" && missedMeetingId ? (
      <div className="coach-row-booking">
        <RebookForm
          meetingId={missedMeetingId}
          name={name}
          minDate={todayIso}
          currentTime={missedStartsAt}
          busy={pending}
          run={run}
          onDone={() => setBooking(null)}
        />
      </div>
    ) : booking === "set-time" && nextMeetingId ? (
      <div className="coach-row-booking">
        <SetTimeForm
          meetingId={nextMeetingId}
          currentTime={nextStartsAt}
          busy={pending}
          run={run}
          onDone={() => setBooking(null)}
        />
      </div>
    ) : null;

  return (
    <>
      {/* The bar is one group so a screen reader announces the row's controls
          as the row's controls, named after the person they belong to — six
          identical "Open the prep" buttons down a page are otherwise
          indistinguishable (ui-ux-pro-max priority 1, aria-labels). */}
      <div className="coach-row-actions" role="group" aria-label={`What to do next with ${name}`}>
        {bar.filled && control(bar.filled, true)}
        {bar.quiet.map((a) => control(a, false))}
        {error && <span className="coach-row-actions-note">{error}</span>}
      </div>

      {bookingPanel}

      {recapOpen && <RecapDrawer profileId={profileId} name={name} onClose={() => setRecapOpen(false)} />}
    </>
  );
}
