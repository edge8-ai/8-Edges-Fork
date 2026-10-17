import { countOpenBlockers, isOverdue } from "./card-facts";
import { isOpen } from "./card-stage";

// The board's Attention filter (W.121): the cards the Flow view's Blocked and
// Overdue tiles count, so a tile can link to exactly the cards behind its
// number.
//
// BLOCKED: open, with at least one blocker not yet resolved. A blocker is a
// child card flagged as one (BL-01), the same rows the Flow view counts.
// OVERDUE: card-facts.ts, the one rule every surface asks.
//
// Choosing both reads as "either", the way two assignees do in any other
// picker: the question is "what needs attention", not "what is both".

export const ATTENTION = ["blocked", "overdue"] as const;
export type AttentionId = (typeof ATTENTION)[number];

export const ATTENTION_LABEL: Record<AttentionId, string> = { blocked: "Blocked", overdue: "Overdue" };

/**
 * The kinds this board can answer: both, on every surface. A client-safe
 * read used to strip blockers, so "Blocked" was not offered there; since
 * 2026-10-12 the client's board carries them, so the picker does too. The
 * argument stays so callers need not change.
 */
export function attentionFor(_data: { clientSafe?: true }): AttentionId[] {
  return [...ATTENTION];
}

type AttentionCard = { status: string; due_date: string | null; blockers: { resolved: boolean }[] };

export function isBlocked(card: AttentionCard): boolean {
  return isOpen(card) && countOpenBlockers(card) > 0;
}

/** Whether the card answers any of the chosen kinds; an empty choice keeps every card. */
export function needsAttention(card: AttentionCard, kinds: readonly AttentionId[], today: string): boolean {
  if (kinds.length === 0) return true;
  return kinds.some((k) => (k === "blocked" ? isBlocked(card) : isOverdue(card, today)));
}
