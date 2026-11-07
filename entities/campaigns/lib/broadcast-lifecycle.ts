import type { Decider } from "@/kernel/approvals/versioned";
import type { Result } from "@/kernel/data/result";
import { letterManualStart, letterSentByHand, withdrawLetterSend } from "./letter/send-step";
import { approvalChecks, type ApprovalReady } from "./broadcast-approve";
import { stampSendWindow } from "./send-window-stamp";
import { moveBroadcast } from "./broadcast-transitions";

// A broadcast's lifecycle by a person's hand (A.44): Approve, Cancel, Delete,
// Start sending, Pause and Mark missed. Before this module each route action
// carried its own allowed-from check, its own status write and its own letter
// coupling, and two of them disagreed in ways that mattered. Cancel refused
// only a sent broadcast, so it could cancel one under a running batch; and
// Cancel and Delete both wrote the status before withdrawing the letter's send,
// so a withdraw that failed left a row saying cancelled while the letter's
// approval still stood, a cancelled broadcast that could still send (BUG-2).
//
// Every verb runs the same sequence, in ./broadcast-transitions, which also
// holds the transition table and the routines' moves. It reads the row's status
// and refuses a status outside the transition's `from`, naming it. It runs the
// step that must come first: for Cancel and Delete that is the letter's
// withdraw, so a failure leaves the row exactly as it was. It then writes the
// new status on condition that the row is still in a status the verb accepts,
// and refuses when nothing matched, because the broadcast moved under the
// press. Last come the step that must follow the write and the audit row.
//
// Decision recorded (A.44 review): Cancel refuses a sending broadcast the way
// Delete always has, so no verb but Pause, the one that stops it, touches a row
// under a running batch. The person pauses first and then cancels. Cancel also
// no longer accepts a cancelled or missed broadcast, which the page never
// offered it for: a missed broadcast was not decided against.
//
// Approve joined in A.55. Before it, Approve wrote on its own and never looked
// at how many rows changed, so a Cancel or a second Approve landing between its
// check and its write left it answering ok, stamping the send windows and
// auditing an approval of a broadcast it never moved. It still does NOT freeze
// a letter's copy (lockLetterCopy): the broadcast's own Approve and the
// letter's freeze check different things on purpose (Y.17), and a letter the
// agent ran on is refused here and approved through its send approval.
//
// Nothing here guards and nothing here revalidates: the route actions do both,
// inline (ADR 0007), and call one verb in between.

/** Who pressed the button: the letter's approval records the person, the audit the address. */
type BroadcastActor = Decider;

/**
 * Draft -> approved, or straight to sending for a series issue, which already
 * has its send moment. The broadcast's own checks run first (./broadcast-approve);
 * once the status has moved, a send window stamps each recipient's moment,
 * counted from this approval, so "next Tuesday" means the one after a person
 * said go. A window that fails to stamp is reported while the approval stands.
 */
export function approveBroadcastRow(id: string, by: BroadcastActor): Promise<Result> {
  let ready: ApprovalReady | null = null;
  let stamped: Record<string, number> | null = null;
  return moveBroadcast(id, by, {
    verb: "approve",
    before: async () => {
      const checked = await approvalChecks(id);
      if (!checked.ok) return checked.error;
      ready = checked;
      return null;
    },
    columns: (now) => ({ approved_at: now, approved_by: by.email }),
    after: async () => {
      const window = ready?.campaign.segment.sendWindow;
      if (!window) return null;
      const result = await stampSendWindow(id, window);
      if (!result.ok) return `Approved, but the delivery window could not be stamped: ${result.error}`;
      stamped = { ...result.summary.sources, stamped: result.summary.stamped };
      return null;
    },
    audit: () => ({
      approved: true,
      recipients: ready?.recipients,
      sendWindow: stamped,
      scheduled: ready?.campaign.seriesId ? ready.campaign.scheduledAt : undefined,
    }),
  });
}

/** Draft or approved -> cancelled, the letter's send withdrawn first. */
export function cancelBroadcastRow(id: string, by: BroadcastActor): Promise<Result> {
  return moveBroadcast(id, by, {
    verb: "cancel",
    before: () => withdrawLetterSend(id, by, "the broadcast was cancelled"),
    audit: (found) => ({ cancelled: true, from: found.status }),
  });
}

/** The soft delete, from anything but sending; a letter's send is withdrawn first unless it already went out. */
export function deleteBroadcastRow(id: string, by: BroadcastActor): Promise<Result> {
  return moveBroadcast(id, by, {
    verb: "delete",
    before: (found) => (found.status === "sent" ? Promise.resolve(null) : withdrawLetterSend(id, by, "the broadcast was deleted")),
    columns: (now) => ({ archived_at: now, archived_by: by.email }),
    audit: (found) => ({ deleted: true, from: found.status }),
  });
}

/**
 * Approved -> sending. The letter's approval is asked first (a letter at ready,
 * or a scheduled one no longer the version approved, is refused before
 * anything is written); a started scheduled letter is then past its send, so
 * the agent driver never releases it a second time.
 */
export function startBroadcast(id: string, by: BroadcastActor): Promise<Result> {
  return moveBroadcast(id, by, {
    verb: "start",
    before: () => letterManualStart(id),
    after: () => letterSentByHand(id),
    audit: () => ({ sending: true }),
  });
}

/**
 * Sending -> approved. A letter still scheduled (the driver's release raced
 * this pause) is past its send now: a paused letter resumes only by a
 * person's Start sending.
 */
export function pauseBroadcastRow(id: string, by: BroadcastActor): Promise<Result> {
  return moveBroadcast(id, by, {
    verb: "pause",
    after: () => letterSentByHand(id),
    audit: () => ({ paused: true }),
  });
}

/** Draft or approved -> missed. */
export function markBroadcastMissedRow(id: string, by: BroadcastActor): Promise<Result> {
  return moveBroadcast(id, by, {
    verb: "missed",
    audit: (found) => ({ missed: true, from: found.status }),
  });
}
