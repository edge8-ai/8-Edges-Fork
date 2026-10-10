// "When will you do it?" — the optional sentence on a commitment (L.1).
//
// An implementation intention in Gollwitzer's if-then form: naming the moment
// ("after Thursday standup") rather than the deadline. It is the member's own
// words about their own work, so the only thing this module does is decide what
// counts as having written something.
//
// What it deliberately does NOT do is parse the sentence. There is no date in
// here, no "is it overdue", no structure to extract — the moment a plan becomes
// a parsed date it becomes a second deadline, and a deadline the person did not
// agree to is the surveillance this product keeps refusing to build.

// Long enough for a real sentence, short enough that a card stays a card. A
// member with more to say than this has something for the agenda, not the card.
export const PLAN_MAX = 280;

/**
 * What to store for a plan the owner typed, or null when they typed nothing.
 *
 * Whitespace-only is null, not an empty string: "no plan" and "a plan that is
 * blank" are the same state to a reader, and storing them differently makes
 * the card ask `plan?.trim()` everywhere instead of `plan`.
 */
export function normalisePlan(raw: string | null | undefined): string | null {
  const text = (raw ?? "").trim();
  if (!text) return null;
  return text.slice(0, PLAN_MAX);
}
