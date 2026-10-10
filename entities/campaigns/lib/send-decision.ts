import { checkSendGate } from "./broadcasts";
import { capLiftsAt, dailySendCap, type SendKind } from "./send-cap";

// Everything a send path must ask before a marketing email goes out, in one
// place and in one order (A.15).
//
// Two paths, broadcast and personal, had this sequence written twice, and the
// copies had drifted: the personal one asked the daily cap and the broadcast
// one did not. A rule with two homes is changed in one of them — the same cost
// lib/run-loop.ts records for the writer and letter agents (A.2).
//
// The personal email agent was removed (Y.18, decision Y.59); the broadcast
// send is the only caller. The decision stays here, in one order, so a new kind
// of send cannot be written that forgets a step. The bookkeeping stays with the
// caller, because that is what genuinely differs between kinds.
export type SendDecision =
  // Go ahead.
  | { action: "send" }
  // Never for this person on this campaign: a consent or persona suppression.
  // The caller records the reason against the row.
  | { action: "skip"; reason: string }
  // Not now, try again. `reason` is why, for the log. `retryAfter` is the
  // earliest instant a retry could get a different answer: null for a transient
  // failure, which the next tick may as well re-ask, and the moment the daily
  // cap lifts when the person has already had today's email.
  //
  // It replaced a `capped` boolean, which left each caller to work out WHEN
  // tomorrow was. The personal path did (`now` plus a day) and the broadcast
  // path did not look at the flag at all, so a capped recipient was reclaimed,
  // re-gated and re-deferred every fifteen minutes until the day rolled.
  | { action: "defer"; reason: string; retryAfter: Date | null };

/** Who the email is for. One argument, because `personId` and `email` always
 *  travel together and two adjacent strings can be transposed silently. */
export type Recipient = { personId: string; email: string };

export async function decideSend(kind: SendKind, to: Recipient, now: Date): Promise<SendDecision> {
  // Live consent, do-not-contact, persona, archived, and prior hard failures.
  // The list may have been built days ago and somebody can unsubscribe in the
  // meantime, so this is re-asked immediately before every send.
  const gate = await checkSendGate(to.personId, to.email);
  if (gate.verdict === "error") {
    // A database hiccup is not a suppression: deferring retries, skipping would
    // mark somebody permanently passed over for a transient timeout.
    return { action: "defer", reason: `gate check failed: ${gate.message}`, retryAfter: null };
  }
  if (gate.verdict === "suppress") return { action: "skip", reason: gate.reason };

  const cap = await dailySendCap(kind, to.personId, now);
  if (cap.error) {
    // No evidence is not evidence of no prior email.
    return { action: "defer", reason: `cap evidence unavailable: ${cap.error}`, retryAfter: null };
  }
  if (cap.hold) return { action: "defer", reason: cap.hold, retryAfter: capLiftsAt(now) };

  return { action: "send" };
}
