// A FAST goal past its date needs an ending (K.83, from Derek Nguyen's spark).
//
// A goal's due date used to be decorative: "5 stars by Oct 5" sailed past its
// date and two days later still said ACTIVE and still asked for a number. Now
// a goal whose date has passed is ENDED until its owner says how it went:
// Landed (status achieved), Missed (status missed, with one line) or Extend (a
// new date, the old one kept in extended_from).
//
// "Ended" is not stored. Every surface works it out when it renders, from the
// status and the date, so the goal card, Home's FAST goals rail and the coach's
// roster all change on the same day and no daily job can fail quietly. Nothing
// resolves on its own: an ended goal waits for its owner.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Whether a goal's date has passed with no ending recorded. `todayISO` is the Saigon day. */
export function goalHasEnded(goal: { status: string; dueDate: string | null }, todayISO: string): boolean {
  return goal.status === "active" && goal.dueDate !== null && goal.dueDate < todayISO;
}

/** "30 Sep", read straight off the calendar date so no time zone can move it. */
export function shortDay(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(d)} ${MONTHS[Number(m) - 1]}`;
}

/** The line every surface shows for an ended goal: "Ended 30 Sep · did it land?". */
export function endedLabel(dueDate: string): string {
  return `Ended ${shortDay(dueDate)} · did it land?`;
}

/** How the owner ended it. The server re-checks every part of this. */
export type GoalEnding =
  | { kind: "landed"; finalValue: number | null }
  | { kind: "missed"; note: string }
  | { kind: "extended"; dueDate: string };
