// What a sprint's lock refuses (W.120).
//
// "Finish planning" locks the next sprint (SW-01) so the meeting's commitment
// stands, and the planning panel stops offering the gestures that would change
// it (W.19). The panel was the only thing refusing, though: the card drawer's
// sprint picker, the list view and quick-add all reach setCardSprint, which
// never looked at the lock. This is the rule the server applies.
//
// ONLY UNTIL THE SPRINT STARTS (Khoa, 2026-09-23). Nothing ever clears
// locked_at on its own — the sprint runs its whole week locked — so a rule
// that held all week would refuse every card anybody adds to this week's
// sprint mid-week. The lock protects the planning window: from the sprint's
// first day the week runs as it always has.
//
// A sprint with no start date is treated as not started, because nothing says
// the window has closed.

export type LockableSprint = { name: string; locked_at: string | null; starts_on: string | null };

/** Whether the lock still holds on `today` (a business date, YYYY-MM-DD). */
export function sprintLockHolds(sprint: LockableSprint, today: string): boolean {
  if (!sprint.locked_at) return false;
  return sprint.starts_on === null || today < sprint.starts_on;
}

/**
 * The refusal for moving a card from one sprint to another, or null when the
 * move may go ahead. `from` and `to` are the card's current and requested
 * sprints; either may be null (the backlog), and only a locked, not-yet-started
 * one refuses.
 */
export function sprintLockRefusal(from: LockableSprint | null, to: LockableSprint | null, today: string): string | null {
  const held = [to, from].find((s): s is LockableSprint => s !== null && sprintLockHolds(s, today));
  if (!held) return null;
  return `${held.name} is locked: planning finished and it has not started yet. Unlock it on the Sprint planning page to change what it commits to.`;
}
