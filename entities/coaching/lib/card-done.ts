import type { CommitmentStatus } from "./types";

// When a finished board card has something to say to the person who made the
// promise (2026-09-18). Pure, so the rule can be read and tested without a
// database and so both boards — the member's and the coach's — ask the same
// question of the same facts.
//
// The rule the shape encodes: a card reaching a done column is EVIDENCE, and
// evidence is offered, never applied. Coaching used to close the commitment
// itself; a growth record the system writes on your behalf is not yours, and a
// promise nobody asked you about is not one you kept.

export type CardDoneFacts = {
  /** When a linked board card reached a done column; null when none has. */
  cardDoneAt: string | null;
  status: CommitmentStatus;
};

/**
 * Whether to offer "your card is done — mark it kept?".
 *
 * Closed commitments are silent on purpose. Once it is `completed` the question
 * is answered, and once it is `dropped` the promise is gone, so re-asking would
 * be the board arguing with a decision its owner already made. Every other
 * status — open, on_track, needs_attention, blocked — still has a person who
 * might want to say yes, including `blocked`: a card can be finished while the
 * note explaining why it was stuck is still on the commitment.
 */
export function cardDoneSuggested(facts: CardDoneFacts): boolean {
  if (!facts.cardDoneAt) return false;
  return facts.status !== "completed" && facts.status !== "dropped";
}
