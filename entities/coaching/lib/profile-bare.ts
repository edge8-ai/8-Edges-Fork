// Whether a coach's profile page has anything to report yet (L.13).
//
// The member's page has had this since K.27 — "the first visit is a different
// page, not an emptier one" — and the coach's side of the same product never
// got it. Opening somebody you have not met yet showed six tiles that all said
// nothing happened, above two large empty cards.
//
// The rule is `practiceIsBare`'s, applied one level down: the tiles earn the
// screen when they have something to report. A profile with a date, a meeting,
// a promise or a goal has real facts and keeps its tiles; a profile with none
// of those has six ways of saying "nothing", and one sentence says it better.
//
// Nothing here describes the person. Every input is a fact about the
// RELATIONSHIP — has it got a meeting in it, a promise, a goal — and the block
// it decides to draw is addressed to the coach about what to do next.

export type ProfileFacts = {
  hasNextMeeting: boolean;
  hasHeldMeeting: boolean;
  openCommitments: number;
  /** Goals in any live state: an active goal and a draft both count as real. */
  goals: number;
};

export function profileIsBare(f: ProfileFacts): boolean {
  return !f.hasNextMeeting && !f.hasHeldMeeting && f.openCommitments === 0 && f.goals === 0;
}

/**
 * What the "open commitments" tile says underneath its figure.
 *
 * "All clear" was said about zero, which reads as a positive report on a
 * relationship where nothing was ever promised — the same class of copy that
 * was removed from the Stuck column (K.45, "Nothing blocked. Good.") and from
 * the member's own strip (`keptNote`, "0 kept since Aug 26"). A zero is never
 * the headline of a summary somebody reads about their work or their coaching.
 */
export function openCommitmentsNote(input: { open: number; them: number; me: number; everMade: boolean }): string {
  if (input.open > 0) return `them ${input.them} · me ${input.me}`;
  // Cleared is only true if there was something to clear.
  return input.everMade ? "all kept" : "none promised yet";
}

/** What the "last 1-1" tile says when there has never been one. */
export const NO_LAST_MEETING = "None yet";
