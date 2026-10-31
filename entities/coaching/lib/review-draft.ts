// Offering the brag document as a review draft (L.9).
//
// When somebody's review cycle is open they are about to write, from memory,
// the same account their coaching history already holds. They do it twice
// today: once as they go, in notes and recaps, and again from scratch in the
// self-assessment box.
//
// Pure, because the only interesting part is deciding WHEN to offer — and the
// answer has to be narrow. An offer that shows all year is an advert.

export type ReviewCycleFacts = {
  /** The cycle's own label, e.g. "2026 H2". */
  label: string | null;
  /** Its furthest-along status across every rater on it. */
  status: string;
};

// The statuses that mean "the member still has writing to do". Anything at
// submitted or beyond is somebody else's turn, and an offer then is noise.
const STILL_WRITING = new Set(["open", "draft"]);

/**
 * The cycle worth offering a draft for, or null.
 *
 * Null is the normal state — most of the year there is no cycle open — and
 * null is what keeps this off the page rather than a hidden flag somewhere.
 */
export function cycleNeedingDraft(cycles: ReviewCycleFacts[]): ReviewCycleFacts | null {
  return cycles.find((c) => STILL_WRITING.has(c.status)) ?? null;
}
