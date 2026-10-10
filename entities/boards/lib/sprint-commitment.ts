import { totalTokens } from "./tokens";

// What a board is committing to next week, for its planning panel heading.
//
// This replaced "does the week fit" (W.21), which put the commitment beside
// what the ending week finished so the room could read one against the other.
// Three things were wrong with that, measured on production on 2026-09-21
// (W.98). Half the committed cards carried no estimate, so the sum it printed
// was not the size of the commitment. The week it compared against was one
// agent-driven rebuild wave — 290 cards, 367.85 HT — which nobody repeats, and
// a holiday week poisons it the same way in the other direction. And the only
// action a throughput figure invites is "we did about N last week, so commit
// about N", which is the forecast the house rule forbids: Human Tokens
// estimate the shape of the work and are never a rate.
//
// What is left describes a decision rather than predicting a week, and names
// the one thing somebody can act on before the sprint starts: the committed
// cards nobody has sized. The Human Token sum appears only when every
// committed card carries an estimate, because a partial sum reads as the whole
// and is simply wrong.
//
// Like flow-metrics.ts, the row carries no person column, so no read of it can
// be sliced by whose card it was.

/** The commitment as the heading says it. No assignee_id, no owner_id, no moved_by. */
export type SprintCommitment = {
  cards: number;
  /** Committed cards with no estimate. The number the meeting acts on. */
  unsized: number;
  /** The sum, or null when any committed card is unsized — a partial sum is a wrong one. */
  tokens: number | null;
};

/** The card as the commitment sees it: which planning column it sits in, and its size. */
type CommitmentCard = { columnId: string; human_tokens: number | null };

export function sprintCommitment(cards: CommitmentCard[]): SprintCommitment {
  const committing = cards.filter((c) => c.columnId === "next");
  const unsized = committing.filter((c) => c.human_tokens === null).length;
  return {
    cards: committing.length,
    unsized,
    tokens: committing.length > 0 && unsized === 0 ? totalTokens(committing) : null,
  };
}
