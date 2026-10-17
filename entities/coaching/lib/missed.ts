// A missed 1-1 asks, it does not roll silently (K.36). The pure half: what a
// booked 1-1 whose day has passed is, and the words both pages say about it.
// Kept out of the data layer so the client components may import the
// sentences.
//
// Nothing here counts or scores anything. A miss is a question — "what
// happened, and which way out do you want?" — never a figure about a person,
// and there is no red state on either page (CLAUDE.md).

import type { OneOnOneStatus } from "./types";

// What became of one booking, as a single fact rather than a pair of flags.
//
// A held 1-1 that was held late is still held: "it did not happen on the day
// it was booked" is a second question about the same meeting, answered by
// heldLate below. Modelled as two booleans, such a row was once both held and
// missed, and one meeting was counted in the held tile, again in the "passed
// unheld" tile, and again in the six-month line — three figures on one screen
// disagreeing about one booking (K.67). A single outcome makes that state
// unrepresentable: the boundary decides once, and every figure counts the same
// answer.
export type MeetingOutcome =
  // The 1-1 happened, whenever it came to be marked so.
  | "held"
  // On the calendar, its day today or still ahead of it.
  | "booked"
  // A booking whose day went by with nobody marking it held or skipped. The
  // passing day is the fact (ADR-0010): nothing stamps it, so no routine has to
  // run for the question to be asked.
  | "passed-unheld"
  // A cycle deliberately let go, which is not a miss.
  | "skipped";

export function meetingOutcome(row: { status: OneOnOneStatus; heldOn: string }, todayISO: string): MeetingOutcome {
  if (row.status === "held") return "held";
  if (row.status === "skipped") return "skipped";
  return row.heldOn < todayISO ? "passed-unheld" : "booked";
}

// Did this 1-1 happen, but not on the day it was booked? The coach says so by
// marking a passed booking held: marked_held_on records the day of that answer,
// and held late is that day after the booked one. A person writes it; no
// routine does (A.31). Deliberately NOT a fifth MeetingOutcome: the month tile
// counts `outcome === "held"`, and splitting that value would drop every
// held-late 1-1 out of the count without a single test going red.
export function heldLate(row: { status: OneOnOneStatus; heldOn: string; markedHeldOn: string | null }): boolean {
  return row.status === "held" && row.markedHeldOn !== null && row.markedHeldOn > row.heldOn;
}

// The coach's sentence, quoted from the card: the four ways out, in the order
// the prompt offers them.
export const MISSED_COACH_PROMPT =
  "This 1-1 did not happen: move it, mark it held, do it in writing, or skip it.";

// The member's half of the same sentence. They have two of the four ways out —
// skipping and marking it held are the coach's call, not theirs.
export const MISSED_MEMBER_PROMPT =
  "This 1-1 did not happen: ask to move it, or do it in writing.";

// "1-1 on Sep 16, 2026 did not happen" — the roster's attention label and the
// History timeline's note are built from the same words, so the coach and the
// member never read two different accounts of the same day.
export function missedLine(heldOn: string, formatDate: (iso: string) => string): string {
  return `1-1 on ${formatDate(heldOn)} did not happen`;
}

// The profile's two questions about its bookings, answered from the outcome
// rather than the status. "Next 1-1" is the earliest booking still to come; a
// booking whose day passed is not the next 1-1 however early it is, because it
// asks something else ("what happened?"). Picking by status alone made a
// passed booking the header's "Next 1-1 · 7 days ago" and hid any real future
// booking from both tabs (K.79).
export function splitBookings<M extends { heldOn: string; outcome: MeetingOutcome }>(
  meetings: M[],
): { next: M | null; passed: M[] } {
  let next: M | null = null;
  for (const m of meetings) {
    if (m.outcome === "booked" && (!next || m.heldOn < next.heldOn)) next = m;
  }
  const passed = meetings
    .filter((m) => m.outcome === "passed-unheld")
    .sort((a, b) => (a.heldOn < b.heldOn ? 1 : a.heldOn > b.heldOn ? -1 : 0));
  return { next, passed };
}
