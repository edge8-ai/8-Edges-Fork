import { closeParkedRun } from "@/kernel/audit/parked-runs";
import { cancelLetterBroadcast, loadLetter, markLetterReleased, releaseLetter, type Letter } from "./data";
import { cancelSend, dueTick, letterVersion, readLatest, str, type Decider } from "./send-approval";
import { LETTER_CANCELLED, LETTER_READY, LETTER_RELEASED, LETTER_ROUTINE_ID, LETTER_SCHEDULED, type LetterState } from "./steps";

// The letter's send (Y.17): the step the agent driver runs once the due time
// has passed, and the broadcast page's own buttons as they meet the letter's
// approval (Approve, Start sending, Pause, Cancel, Delete). The approval itself,
// its ask and its decision live in ./send-approval; this file reads it. Split
// from there at the file-size cap after the Opus review of #1988.
//
// Nothing here guards: the actions that call it do, inline (ADR 0007).

/**
 * For the broadcast's own Approve: why it must not approve this broadcast, or
 * null. Any broadcast the letter agent ran on is approved only through its
 * send approval (Y.17 review): at ready that is the Letter agent panel; after a
 * Stop or mid-run, the agent must reach ready again so the approval names the
 * version being sent. A plain Approve would mail it with no letter_send row.
 */
export async function letterAwaitsApproval(id: string): Promise<string | null> {
  const loaded = await loadLetter(id);
  if (!loaded.ok) return loaded.error;
  const { agentStep, agentStartedAt } = loaded.data;
  if (agentStep === LETTER_READY) return "This letter waits on its send approval. Approve it in the Letter agent panel, which checks the version you read.";
  if (agentStartedAt) return "The letter agent wrote this letter, so it is approved through its send approval: run the agent to ready, then approve it in the Letter agent panel.";
  return null;
}

// The gate the send step and a person's Start sending share: the letter's
// latest approval is approved and for exactly this version. A failed read refuses.
async function approvedToSend(letter: Letter): Promise<{ ok: true } | { ok: false; reason: string; state: string | null }> {
  const read = await readLatest(letter.id);
  if (!read.ok) return { ok: false, reason: read.error, state: null };
  const latest = read.latest;
  if (latest?.state !== "approved") return { ok: false, reason: latest ? `the approval is ${latest.state}` : "no approval is on record", state: latest?.state ?? null };
  if (str(latest.metadata.version) !== letterVersion(letter)) return { ok: false, reason: "the letter is not the version that was approved", state: latest.state };
  return { ok: true };
}

/**
 * For a person's Start sending: why it must not start this broadcast, or null.
 * A broadcast the letter agent never ran on starts as before. A letter the
 * agent ran on starts only once released, or while scheduled and still the
 * version approved: a scheduled letter's recipients are stamped with their
 * moments, so an early start still mails each at their window. Anything else
 * (at ready, stopped or cancelled after a freeze, a schedule that failed half
 * way) has no standing approval or an unstamped list, and is refused. A
 * started letter is past its send, so the driver never releases it again.
 */
export async function letterManualStart(id: string): Promise<string | null> {
  const loaded = await loadLetter(id);
  if (!loaded.ok) return loaded.error;
  const letter = loaded.data;
  if (letter.agentStep === LETTER_READY) return "This letter waits on its send approval; approve it in the Letter agent panel and it sends at its window.";
  if (!letter.agentStartedAt || letter.agentStep === LETTER_RELEASED) return null;
  if (letter.agentStep !== LETTER_SCHEDULED) {
    return "The letter agent wrote this letter and it has no scheduled send. Run the agent to ready and approve it in the Letter agent panel; it sends at its window.";
  }
  const gate = await approvedToSend(letter);
  if (!gate.ok) return `The letter sends at its window only once approved, and ${gate.reason}.`;
  return null;
}

/** After a person started or paused a scheduled letter by hand: the run is past its send. */
export async function letterSentByHand(id: string): Promise<string | null> {
  const marked = await markLetterReleased(id);
  if (!marked.ok) return `The send started, but the letter's run was not closed (${marked.error}); the agent driver will find it sending and close it.`;
  if (marked.marked) await closeParkedRun(LETTER_ROUTINE_ID, dueTick(id), { status: "ok", summary: "started by hand" });
  return null;
}

/**
 * For the broadcast's own Cancel and Delete, after the broadcast is cancelled:
 * a letter waiting on its approval or its send time gets a cancelled approval
 * row too, which the send step reads, and leaves nothing open in an inbox.
 * Answers what went wrong, or null.
 */
export async function withdrawLetterSend(id: string, by: Decider, why: string): Promise<string | null> {
  const r = await cancelSend(id, by, why);
  return r.ok ? null : `The broadcast is cancelled and nothing will send, but the letter's approval was not withdrawn: ${r.error}`;
}

export type SendStepResult = { ok: true; next: LetterState; summary: string } | { ok: false; error: string };

/**
 * The send step, run by the tick driver once the due time has passed. It reads
 * the approval row, not the state a button left: a cancelled approval or a
 * cancelled broadcast sends nothing, and a letter that is not the version
 * approved stops with that reason. A broadcast a person already started by hand
 * is the send done. Otherwise the claim (approved -> sending) releases it to
 * the send routine.
 */
export async function runSend(letter: Letter, now: Date = new Date()): Promise<SendStepResult> {
  const closeDue = (status: "ok" | "skipped", summary: string) => closeParkedRun(LETTER_ROUTINE_ID, dueTick(letter.id), { status, summary });
  if (letter.status === "cancelled" || letter.status === "missed") {
    await closeDue("skipped", `the broadcast is ${letter.status}`);
    return { ok: true, next: LETTER_CANCELLED, summary: `The broadcast is ${letter.status}; nothing was sent.` };
  }
  if (letter.status === "sending" || letter.status === "sent") {
    await closeDue("ok", "started by hand");
    return { ok: true, next: LETTER_RELEASED, summary: "A person already started the send by hand; nothing more to release." };
  }
  if (letter.status !== "approved") return { ok: false, error: `Send: the broadcast is ${letter.status}, not approved.` };
  if (letter.scheduledAt && new Date(letter.scheduledAt).getTime() > now.getTime()) {
    return { ok: false, error: `Send: not due until ${letter.scheduledAt}.` };
  }

  const gate = await approvedToSend(letter);
  if (!gate.ok && (gate.state === "cancelled" || gate.state === "rejected")) {
    const cancelled = await cancelLetterBroadcast(letter.id);
    if (!cancelled.ok) return { ok: false, error: `Send: the approval is ${gate.state}, and the broadcast could not be cancelled: ${cancelled.error}` };
    await closeDue("skipped", `the approval is ${gate.state}`);
    return { ok: true, next: LETTER_CANCELLED, summary: `The approval is ${gate.state}; nothing was sent and the broadcast is cancelled.` };
  }
  if (!gate.ok) return { ok: false, error: `Send: ${gate.reason}; nothing was sent.` };

  const released = await releaseLetter(letter.id);
  if (!released.ok) return { ok: false, error: `Send: ${released.error}` };
  if (!released.released) {
    if (released.status === "sending" || released.status === "sent") {
      await closeDue("ok", "started by hand");
      return { ok: true, next: LETTER_RELEASED, summary: "A person started the send by hand a moment ago." };
    }
    return { ok: false, error: `Send: the broadcast moved to ${released.status} under the send; nothing was released.` };
  }
  await closeDue("ok", "released to the send");
  return { ok: true, next: LETTER_RELEASED, summary: `Released to the send routine; each recipient is mailed at their moment from ${letter.scheduledAt ?? "now"}.` };
}
