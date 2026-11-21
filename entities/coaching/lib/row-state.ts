import { missWorthPrompting, type LeaveSpan } from "./leave-window";

// What a roster row is actually waiting for (G.8).
//
// Four things on /team/coaching derive from the same handful of scheduling
// facts: the row's action bar (rowActions), the "Where I can help" list
// (helpLines), the row's headline sentence (nextMeetingLine) and the target of
// "Plan the week" (needsDate). The first two knew about a proposed date and a
// booking that passed unheld; the other two did not, and read only
// `nextOneOnOneOn`.
//
// So a row whose own button said "Confirm Thursday 24 Sep" carried the
// headline "No next 1-1 booked yet — put one in." above it, a row offering
// "Mark it held" said the same, and so did a row where the coach had already
// proposed a day. Driven over eight rows covering every state, the sentence
// was wrong on three of the four where it fired — and it is the largest text
// on the row, with the button quieter underneath.
//
// The precedence is the fix. It existed correctly inside rowActions and was
// re-derived, incompletely, twice more. Here it exists once, and the callers
// switch on the answer:
//
//   member-proposed   somebody is waiting on the coach — it outranks everything
//   missed            a booking whose day passed without the 1-1 happening
//   booked            a date on the calendar, prepared or not
//   coach-proposed    the coach has asked and the ball is with the member
//   none              nothing on the table
//
// Nothing here ranks or scores a person: the state is a fact about a booking,
// and the same facts always give the same answer for everybody (CLAUDE.md).

export type RowState =
  | { kind: "member-proposed"; on: string }
  | {
      kind: "missed";
      on: string;
      meetingId: string;
      // False when the day fell in the person's time off (L.2): the 1-1 did
      // not quietly fail to happen, it was never going to, so the honest move
      // is a new day rather than recording a holiday as a meeting.
      worthPrompting: boolean;
    }
  | { kind: "booked"; on: string; agendaWritten: boolean; everMet: boolean }
  | { kind: "coach-proposed"; on: string }
  // Nothing on the table. suggestedOn is the day that would keep the rhythm,
  // from the 1-1 schedule (ADR-0010); null for someone never met or paused.
  | { kind: "none"; everMet: boolean; suggestedOn: string | null };

export type RowStateInput = {
  proposedOn: string | null;
  proposedBy: string | null;
  nextOneOnOneOn: string | null;
  agendaWritten: boolean;
  // The booking that passed unheld, and the row "Mark it held" would write to.
  // Without the id there is nothing to mark, so the row falls through to its
  // next state rather than offering a control that cannot work.
  missedOn: string | null;
  missedMeetingId: string | null;
  everMet: boolean;
  suggestedOn?: string | null;
  leave?: LeaveSpan[];
};

export function rowState(r: RowStateInput): RowState {
  if (r.proposedOn && r.proposedBy === "member") return { kind: "member-proposed", on: r.proposedOn };
  if (r.missedOn && r.missedMeetingId) {
    return {
      kind: "missed",
      on: r.missedOn,
      meetingId: r.missedMeetingId,
      worthPrompting: missWorthPrompting(r.missedOn, r.leave ?? []),
    };
  }
  if (r.nextOneOnOneOn) {
    return { kind: "booked", on: r.nextOneOnOneOn, agendaWritten: r.agendaWritten, everMet: r.everMet };
  }
  if (r.proposedOn) return { kind: "coach-proposed", on: r.proposedOn };
  return { kind: "none", everMet: r.everMet, suggestedOn: r.suggestedOn ?? null };
}

/**
 * Whether this row is one a coach planning the week would put a date in.
 * "Plan the week" used to jump to the first row with no `nextOneOnOneOn`,
 * which is satisfied by a row that already has a day proposed on it — so the
 * page's one header action landed on somebody with nothing to book.
 */
export function needsADate(state: RowState): boolean {
  return state.kind === "none" || state.kind === "missed";
}
