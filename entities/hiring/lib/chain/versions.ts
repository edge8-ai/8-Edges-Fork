import { contentVersion } from "@/kernel/approvals/version";
import { stepTick } from "@/kernel/audit/step-driver";
import { shortlistVersionParts, type ShortlistItem } from "./proposal";
import type { DecisionOutcome } from "./steps";

// The versions each hiring approval is for (spec section 6). An approver
// decides the version the page showed them, and the step that acts compares
// it with the content as it is now, so anything edited after the approval was
// asked for needs a new approval rather than riding on the old one.

export function messageVersion(m: { toEmail: string; subject: string; body: string }): string {
  return contentVersion({ to: m.toEmail, subject: m.subject, body: m.body });
}

export function shortlistVersion(round: number, items: ShortlistItem[]): string {
  return contentVersion(shortlistVersionParts(round, items));
}

/** A hire or a rejection: the outcome, its reason, and the exact message that goes with it. */
export function decisionVersion(d: { outcome: DecisionOutcome; reason: string; messageVersion: string }): string {
  return contentVersion({ outcome: d.outcome, reason: d.reason.trim(), message: d.messageVersion });
}

export function requisitionVersion(content: Record<string, unknown>): string {
  return contentVersion(content);
}

/**
 * The tick a wait on a person parks under: one per version asked for, so a
 * new approval after an edit is a new wait. It differs from every step tick,
 * which claim_tick would otherwise refuse while the wait holds it.
 */
export function waitTick(id: string, epoch: string | null, what: string, version: string): string {
  return stepTick({ id, epoch, step: `wait-${what}-${version}` });
}
