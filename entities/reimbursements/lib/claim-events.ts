// What a landed move tells the world (design §1.8), private to the lifecycle
// and payment modules: the catalogue fact on the kernel's bus, which whoever
// the deployment wired listens to (the inbox writes the owner's row for a
// decision and a payment), and the channel notice a submission sends.
//
// Everything here runs after the write has landed and never fails the move.
// The bus already keeps a subscriber's failure from the publisher (it logs
// and audits it); a payload the catalogue refuses — this entity's own bug —
// is logged here rather than answered as a failed decision the decider would
// retry into a refusal. Nothing outside this entity imports this file.
import { publish, type EventPayload } from "@/kernel/events";
import type { EventName } from "@/kernel/events/catalogue";
import { nextRunDate, type ClaimMove } from "./claim-rules";
import type { ClaimActor } from "./claim-lifecycle";
import type { ClaimRow } from "./own-claims";
import { tellOfSubmission } from "./notices";

/** Publishes one catalogue fact, logging instead of throwing when the catalogue refuses it. */
export async function announce<N extends EventName>(name: N, payload: EventPayload<N>): Promise<void> {
  try {
    await publish(name, payload);
  } catch (err) {
    console.error(`[reimbursements] ${name} was not announced`, err instanceof Error ? err.message : err);
  }
}

const DECIDED = { check: "checked", send_back: "sent_back", reject: "rejected", approve: "approved", return_to_approved: "returned" } as const;

/**
 * The facts of one landed move. A submission is told to the Operations chat
 * and accounting@ (RB.8) and stated as `claim.submitted`; a decision is
 * `claim.decided`, an approval carrying the run that will pay it; a payment
 * returned to approved (a failed transfer) is `claim.decided` as "returned",
 * with its reason and the next run, beside the payments module's email;
 * entering a run and being paid are stated as such. A withdrawal states
 * nothing on the bus.
 */
export async function announceMove(m: {
  row: ClaimRow;
  move: ClaimMove;
  actor: ClaimActor;
  reason: string | null;
  approvedTotalVnd: number | null;
  eventId: string | null;
  /** A submission's receipts, as the submit rule read them. */
  receipts: number | null;
  runId: string | null;
  paymentId: string | null;
}): Promise<void> {
  const { row, move, actor, receipts } = m;
  const base = { claimId: row.id, ownerPersonId: row.personId, title: row.title || "Untitled claim" };
  if (move === "submit") {
    const resubmitted = row.status === "sent_back";
    await tellOfSubmission({ ...base, receipts, resubmitted, eventId: m.eventId });
    await announce("claim.submitted", { ...base, receipts: receipts ?? 0, resubmitted, actorPersonId: actor.personId });
    return;
  }
  if (move === "check" || move === "send_back" || move === "reject" || move === "approve" || move === "return_to_approved") {
    // An approved claim, and one returned from its run (which never takes it
    // back, payment-runs.ts), is paid in the first run after today.
    const waitsForRun = move === "approve" || move === "return_to_approved";
    await announce("claim.decided", {
      ...base,
      became: DECIDED[move],
      reason: m.reason,
      approvedTotalVnd: move === "approve" ? m.approvedTotalVnd : null,
      runDate: waitsForRun ? nextRunDate(new Date().toISOString()) : null,
      eventId: m.eventId,
      actorPersonId: actor.personId,
    });
    return;
  }
  if (move === "enter_run" && m.runId) {
    await announce("claim.in_run", { ...base, runId: m.runId, eventId: m.eventId });
    return;
  }
  if (move === "pay" && m.paymentId) {
    await announce("claim.paid", { ...base, paymentId: m.paymentId, eventId: m.eventId, actorPersonId: actor.personId });
  }
}
