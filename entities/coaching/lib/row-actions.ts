import { describeDay } from "./cadence";
import { diffDays } from "@/kernel/config/dates";
import { AGENDA_LEAD_DAYS } from "./help-lines";
import type { LeaveSpan } from "./leave-window";
import { rowState } from "./row-state";

// What the coach's roster row offers, and which single control is the filled
// one (K.57, doc §C.3). "Prepare" was the same button on every row whatever the
// row said, which is the "specific button labels" defect: a label that names
// the next move ("Write the agenda", "Mark it held") tells a coach what the row
// is waiting for before they have read a word of it.
//
// The rule this module exists to hold is "one dominant element" applied per row
// rather than per page: at most one filled button, everything else a quiet
// outline. Keeping the choice here — pure, no React, no data client — is what
// lets every state be asserted in a test instead of clicked through.
//
// Nothing here ranks or scores anybody (CLAUDE.md): the state is a fact about a
// booking, and the same state always produces the same bar for every person.

export type RowActionId =
  | "confirm"
  | "decline"
  | "mark-held"
  | "last-recap"
  | "write-agenda"
  | "open-prep"
  | "rebook"
  | "propose"
  | "set-time"
  | "open";

export type RowAction = {
  id: RowActionId;
  label: string;
  // The destination when the control is a link. Null marks the controls the
  // row performs itself: confirm, decline and mark-held are server actions
  // done from the row, last-recap opens the drawer, and propose and rebook
  // open the booking form in the row (G.9). Only the three that genuinely
  // need the other page — the prep, the agenda and the person's own profile —
  // are still links. The roster could answer a date but not offer one, so
  // putting days in, which is the whole weekly job of this page, was the one
  // thing it handed off.
  href: string | null;
  // On "propose": the day the 1-1 schedule suggests (ADR-0010), which the
  // booking form opens on so booking it is one click.
  suggestedOn?: string | null;
};

export type RowActionState = {
  profileId: string;
  // The person's display name, which "Open <name>" spells out rather than
  // saying "Open" or "View" — the escape hatch should name where it goes.
  name: string;
  proposedOn: string | null;
  proposedBy: string | null;
  nextOneOnOneOn: string | null;
  // The booking sitting on nextOneOnOneOn: its row id, and the time it starts.
  // Null is "no time anywhere" — not on the booking and not in the member's
  // standing preference — which before K.71 was a state no screen could leave.
  nextMeetingId: string | null;
  nextStartsAt: string | null;
  agendaWritten: boolean;
  // Today in Saigon, so a blank agenda is only urgent inside the same window
  // the help list uses; a first 1-1 two weeks out has nothing to prepare yet.
  todayISO: string;
  // The booking whose day passed without the 1-1 being marked held, and its
  // meeting row — mark-held writes to that row, so without the id there is
  // nothing to mark and the row falls through to its next state.
  missedOn: string | null;
  missedMeetingId: string | null;
  // When this person was away (L.2); absent on callers that predate it.
  leave?: LeaveSpan[];
  // Whether a 1-1 has ever been held, which is the only precondition the row
  // can know cheaply. Whether that 1-1 carries a written recap is answered by
  // the drawer's own load, not by a roster-wide read of every recap body.
  hasHeldOneOnOne: boolean;
  // The day that would keep the rhythm when nothing is booked.
  suggestedOn?: string | null;
};

export type RowActionBar = { filled: RowAction | null; quiet: RowAction[] };

// The previous recap as the drawer receives it. It lives in this pure module
// rather than beside the action that returns it because a "use server" file may
// export nothing but async functions, and the browser half needs the shape.
export type LastRecapView = { heldOn: string; html: string | null };

function profileHref(profileId: string): string {
  return `/team/coaching/${profileId}?tab=next`;
}

// The order is the order of obligation, not the order of the columns: a date
// the member proposed is the only state where somebody else is waiting on the
// coach, so it outranks a booking that passed unmarked, which in turn outranks
// prep the coach owes only themselves.
export function rowActions(state: RowActionState): RowActionBar {
  const href = profileHref(state.profileId);
  const tail: RowAction[] = [];
  if (state.hasHeldOneOnOne) tail.push({ id: "last-recap", label: "Last recap", href: null });
  tail.push({ id: "open", label: `Open ${state.name}`, href });

  // The precedence itself lives in rowState (G.8), because the row's headline
  // sentence and "Plan the week" derive from the same facts and used to
  // re-derive them incompletely. This function only decides which controls a
  // state deserves.
  const s = rowState({ ...state, everMet: state.hasHeldOneOnOne });

  if (s.kind === "member-proposed") {
    return {
      filled: { id: "confirm", label: `Confirm ${describeDay(s.on)}`, href: null },
      quiet: [{ id: "decline", label: "Suggest another", href: null }, ...tail],
    };
  }

  if (s.kind === "missed") {
    // A 1-1 the person was away for did not quietly fail to happen — it was
    // never going to (L.2). "Mark it held" as the one filled action would be
    // the page asking a coach to record a holiday as a meeting, so the day
    // simply needs a new one: Rebook leads and marking it held stays available
    // for the coach who did talk to them anyway.
    if (!s.worthPrompting) {
      return {
        filled: { id: "rebook", label: "Rebook", href: null },
        quiet: [{ id: "mark-held", label: "Mark it done", href: null }, ...tail],
      };
    }
    return {
      filled: { id: "mark-held", label: "Mark it done", href: null },
      quiet: [{ id: "rebook", label: "Rebook", href: null }, ...tail],
    };
  }

  if (s.kind === "booked") {
    // A booking with no time is answered from the row itself (K.71), and always
    // as a quiet control: a missing time is a smaller omission than the agenda
    // or the prep the same row may also be asking for, and promoting it would
    // break the one-filled-control rule this module exists to hold.
    const rest =
      state.nextStartsAt === null && state.nextMeetingId
        ? [{ id: "set-time" as const, label: "Set the time", href: null }, ...tail]
        : tail;
    // On the day itself the next move is closing it once it has happened
    // (K.80): the prep is still one click away beside it.
    if (state.nextMeetingId && diffDays(state.todayISO, s.on) === 0) {
      return {
        filled: { id: "mark-held", label: "Mark it done", href: null },
        quiet: [{ id: "open-prep", label: "Open the prep", href }, ...rest],
      };
    }
    if (state.agendaWritten) return { filled: { id: "open-prep", label: "Open the prep", href }, quiet: rest };
    // The same window the help list uses (AGENDA_LEAD_DAYS), and the same bound
    // at BOTH ends: inside it the agenda is the move; before it the row says
    // nothing is waiting, which is what the week line and the help list already
    // say about that person (Khoa saw "Write the agenda" on a first 1-1 thirteen
    // days out, 2026-09-17).
    //
    // `away >= 0` is the half this site was missing (K.68). A booking whose day
    // has passed is not something to prepare for, and the row used to offer the
    // agenda for it during every gap between midnight and the daily pass —
    // 7h45m a day, because the Saigon date turns at 17:00 UTC and the pass runs
    // at 00:45 UTC. help-lines.ts has always carried the bound, so for those
    // hours the row's one filled control and the help list above it disagreed
    // about the same person. Once the pass stamps the row, the missed bar above
    // takes over; until then the honest answer is that nothing is waiting.
    const away = diffDays(state.todayISO, s.on);
    if (away >= 0 && away <= AGENDA_LEAD_DAYS)
      return { filled: { id: "write-agenda", label: "Write the agenda", href }, quiet: rest };
    return { filled: null, quiet: [{ id: "open-prep", label: "Open the prep", href }, ...rest] };
  }

  // The coach has put a day forward and the member has not answered it: the
  // ball is theirs, so nothing on this row is filled. This is doc §C.3's
  // "nothing pending" row — a row with nothing to answer should not compete for
  // the eye with the rows that do.
  if (s.kind === "coach-proposed") return { filled: null, quiet: tail };

  const suggestedOn = s.kind === "none" ? s.suggestedOn : null;
  // The form books directly, so the button says so (K.80): "Propose a day"
  // promised an answer from the member that never came. With a day that keeps
  // the rhythm it names that day; a first session is agreed together.
  const label = suggestedOn ? `Book ${describeDay(suggestedOn)}` : s.kind === "none" && !s.everMet ? "Agree a first session" : "Book a day";
  return { filled: { id: "propose", label, href: null, suggestedOn }, quiet: tail };
}
