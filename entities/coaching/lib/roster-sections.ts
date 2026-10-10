import { diffDays } from "@/kernel/config/dates";
import type { RowState } from "./row-state";

// Where a person sits on the coach's roster (K.80). The roster used to show
// four tiles about the practice, then a "Where I can help" shortlist, then
// every person again, so anybody who needed something appeared twice with the
// same button twice. Now each person appears once, in the section that says
// what the week asks of the coach:
//
//   needs  — something waits on the coach: a day the employee proposed, a
//            session that passed unmarked, a first session to agree, or the
//            rhythm's next day is close and nothing is booked;
//   week   — a session is booked within the next seven days;
//   later  — booked further out, or nothing due yet.
//
// Within a section people are in date order, then by name. Never by a score:
// nothing on this page ranks a person.
export type RosterSection = "needs" | "week" | "later";

export const WEEK_DAYS = 7;

export function rosterSection(state: RowState, todayIso: string): RosterSection {
  switch (state.kind) {
    case "member-proposed":
    case "missed":
      return "needs";
    case "booked":
      return diffDays(todayIso, state.on) <= WEEK_DAYS ? "week" : "later";
    case "coach-proposed":
      return "later";
    case "none":
      if (!state.everMet) return "needs";
      if (!state.suggestedOn) return "later";
      return diffDays(todayIso, state.suggestedOn) <= WEEK_DAYS ? "needs" : "later";
  }
}

// The day a row is about, for ordering inside its section.
export function sectionDay(state: RowState): string | null {
  switch (state.kind) {
    case "none":
      return state.suggestedOn;
    default:
      return state.on;
  }
}
