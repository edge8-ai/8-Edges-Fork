import { cancelApproval, decidePendingApproval, openApproval, withdrawPendingApproval } from "@/kernel/approvals/requests";
import { latestApproval, type SubjectApproval } from "@/kernel/approvals/waiting";
import { contentVersion } from "@/kernel/approvals/version";
import type { ApprovalSubject } from "@/kernel/approvals/vocabulary";
import { closeParkedRun, parkRun } from "@/kernel/audit/parked-runs";
import { stepTick } from "@/kernel/audit/step-driver";
import type { Result } from "@/kernel/data/result";
import { getBroadcast, type BroadcastRow } from "../broadcasts";
import { materializeRecipients } from "../recipients";
import { describeWindow, TUESDAY_FRIDAY_EIGHT, type SendWindow } from "../send-window";
import {
  cancelLetterBroadcast,
  loadLetter,
  lockLetterCopy,
  pendingRecipientCount,
  pinSendWindow,
  setAgentState,
  stampLetterSend,
  unlockLetterCopy,
  type Letter,
} from "./data";
import {
  LETTER_CANCELLED,
  LETTER_READY,
  LETTER_REJECTED,
  LETTER_RELEASED,
  LETTER_ROUTINE_ID,
  LETTER_SCHEDULED,
} from "./steps";
import type { StepRunner } from "./types";

// The letter's approval and its timed send (Y.17, decision Y.54: the letter
// waits for an approval before it mails the list).
//
// The run's last writing step, ask, builds the recipient list, pins the send
// window and opens a letter_send approval addressed to whoever holds the
// marketing permission, carrying the version of the letter (a hash of its
// subject, preheader, body and blocks), how many people it reaches and when.
// The run parks at ready, as a waiting row on Settings -> Agents. Approving on
// the broadcast page decides that row for the version the page showed, approves
// the broadcast (its copy is frozen from then), stamps each recipient's moment
// and writes the first of them as the send's due time; the run moves to
// scheduled. The first agent-driver tick after the due time runs the send step,
// which reads the approval row again and releases the letter to the send
// routine only if it still stands; a cancel before then is a cancelled row and
// a cancelled broadcast, and the step sends nothing. Nothing approves on a
// timeout, and no route takes a token.
//
// Nothing here guards: the actions that call it do, inline (ADR 0007).

export const LETTER_SEND = "letter_send" as const satisfies ApprovalSubject;

// Who may approve the letter going to the list: the holders of the atom that
// runs marketing, who could press Approve and Start sending on the broadcast
// before there was an approval row. The row adds the record and the version
// check; it moves nobody's authority.
export const SEND_APPROVER = "campaigns.marketing";

export type Decider = { personId: string | null; email: string };

type LetterContent = Pick<Letter, "subject" | "preheader" | "bodyMd" | "blocks">;

/** The version of the letter that would be mailed, as the approver reads it. */
export function letterVersion(letter: LetterContent): string {
  return contentVersion({ subject: letter.subject, preheader: letter.preheader, bodyMd: letter.bodyMd, blocks: letter.blocks });
}

export function str(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

// One waiting row per version asked for, and one for the timed send; neither
// may share a tick with a step, which claim_tick would then refuse.
// The approval's wait is keyed by everything it names (the letter's version,
// how many people, the window), so asking again about a changed send opens a
// new wait instead of finding the old one's closed row.
const approvalTick = (id: string, epoch: string | null, named: { version: string; recipients: number; window: string }) =>
  stepTick({ id, epoch, step: `send-approval-${contentVersion(named)}` });
// A letter is scheduled at most once, so its send wait is keyed by the letter
// alone: a Retry gives the run a new start time, and the wait must still close.
export const dueTick = (id: string) => stepTick({ id, epoch: null, step: "send-due" });

/**
 * Build the list, pin the window and open the approval for the letter as it is
 * now. Idempotent: the list only gains newcomers, a pending approval is
 * refreshed rather than doubled, and the waiting row is one per version.
 */
async function askToSend(letter: Letter, campaign: BroadcastRow): Promise<{ ok: true; summary: string } | { ok: false; error: string }> {
  if (campaign.status !== "draft") return { ok: false, error: `The broadcast is ${campaign.status}; only a draft is asked about.` };
  const window: SendWindow = campaign.segment.sendWindow ?? TUESDAY_FRIDAY_EIGHT;
  if (!campaign.segment.sendWindow) {
    const pinned = await pinSendWindow(letter.id, campaign.segment, window);
    if (!pinned.ok) return { ok: false, error: `the send window could not be set: ${pinned.error}` };
  }
  const built = await materializeRecipients(campaign);
  if (!built.ok) return { ok: false, error: `the recipient list could not be built: ${built.error}` };
  const counted = await pendingRecipientCount(letter.id);
  if (!counted.ok) return { ok: false, error: `the recipients could not be counted: ${counted.error}` };
  if (counted.count === 0) return { ok: false, error: "nobody on the list is still to be mailed." };

  const version = letterVersion(letter);
  const tick = approvalTick(letter.id, letter.agentStartedAt, { version, recipients: counted.count, window: describeWindow(window) });
  const opened = await openApproval({
    subjectType: LETTER_SEND,
    subjectId: letter.id,
    approverPermission: SEND_APPROVER,
    requestedBy: null,
    label: `Send "${letter.subject}"`,
    metadata: { version, reach: "the letter's list, by email", recipients: counted.count, sendWindow: describeWindow(window), run: tick, subject: letter.subject },
  });
  if (!opened.ok) return { ok: false, error: `the approval could not be opened: ${opened.error}` };
  const parked = await parkRun(LETTER_ROUTINE_ID, tick, `Waiting on a send approval for version ${version}, ${counted.count} recipients.`);
  if (!parked.ok) console.error(`[letter] ${letter.id}: approval opened but the wait was not recorded: ${parked.error}`);
  return { ok: true, summary: `Asked for approval to send to ${counted.count} recipients, ${describeWindow(window)}.` };
}

/** Step 7: ask for the approval, and park at ready on it. */
export const runAsk: StepRunner = async ({ letter }) => {
  const campaign = await getBroadcast(letter.id);
  if (!campaign) return { ok: false, error: "Ask approval: the broadcast could not be read." };
  const asked = await askToSend(letter, campaign);
  if (!asked.ok) return { ok: false, error: `Ask approval: ${asked.error}` };
  return asked;
};

/** What the broadcast page shows beside Approve. */
export type SendApprovalView = {
  pendingVersion: string | null;
  currentVersion: string;
  recipients: number | null;
  sendWindow: string | null;
};

export async function sendApprovalView(letter: Letter): Promise<SendApprovalView> {
  const latest = await latestApproval(LETTER_SEND, letter.id);
  const pending = latest?.state === "pending" ? latest : null;
  const recipients = pending && typeof pending.metadata.recipients === "number" ? pending.metadata.recipients : null;
  return { pendingVersion: pending ? str(pending.metadata.version) : null, currentVersion: letterVersion(letter), recipients, sendWindow: pending ? str(pending.metadata.sendWindow) : null };
}

export async function readLatest(id: string): Promise<{ ok: true; latest: SubjectApproval | null } | { ok: false; error: string }> {
  try {
    return { ok: true, latest: await latestApproval(LETTER_SEND, id) };
  } catch (err) {
    return { ok: false, error: `Could not read the send approval: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * The approver's Approve. `seenVersion` is the version the page showed; it must
 * be the letter's version now and the version the pending approval asks about.
 * When either differs, the stale approval is withdrawn, a new one is asked for
 * the letter as it is now, and the click decides nothing.
 *
 * The copy is frozen before the decision (Y.17 review): draft -> approved in
 * one conditional write, then the version is read again, then the approval is
 * decided bound to that row and that version. An edit that lands between the
 * page and the click is caught by the version, one that would land after the
 * freeze is refused by the editor, and a decision that does not happen thaws
 * the copy again. Only the call that closes the pending row schedules the
 * send, so a double click schedules once.
 */
export async function approveSend(id: string, seenVersion: string, by: Decider): Promise<Result> {
  const loaded = await loadLetter(id);
  if (!loaded.ok) return loaded;
  const letter = loaded.data;
  if (letter.agentStep !== LETTER_READY) {
    return { ok: false, error: letter.agentStep === LETTER_SCHEDULED ? "Already approved; the letter is scheduled." : "The letter is not waiting on a send approval." };
  }
  const current = letterVersion(letter);
  const read = await readLatest(id);
  if (!read.ok) return read;
  const latest = read.latest;

  // Approved for this very version with the run still at ready: the decision
  // landed and the schedule after it did not (the copy may already be frozen).
  // Resume rather than ask again; this comes before the status check, because
  // a half-done schedule leaves the broadcast approved.
  if (latest?.state === "approved" && str(latest.metadata.version) === current && (letter.status === "draft" || letter.status === "approved")) {
    const locked = await lockLetterCopy(id, by.email);
    if (!locked.ok) return { ok: false, error: `Approved, but the copy could not be frozen: ${locked.error}` };
    return schedule(letter, latest, by);
  }
  if (letter.status !== "draft") return { ok: false, error: `The broadcast is ${letter.status}; only a draft letter is approved here.` };

  // The approval also names how many people and when; a list rebuilt or a
  // window changed since it was asked for is a different send, asked again.
  const named = await stillNamed(letter, latest);
  if (!named.ok) return named;
  const pendingVersion = latest?.state === "pending" ? str(latest.metadata.version) : null;
  if (seenVersion !== current || pendingVersion !== current || !named.same) {
    const asked = await askAgain(letter, latest, by);
    if (!asked.ok) return { ok: false, error: `The approval could not be asked for again: ${asked.error}` };
    if (seenVersion !== current) return { ok: false, error: "The letter changed since this page loaded. Reload, read it again, and approve." };
    if (!pendingVersion) return { ok: false, error: "No send approval was open for this letter; one is open now for the version on this page. Approve again to schedule it." };
    return {
      ok: false,
      error:
        pendingVersion !== current
          ? "The letter changed after approval was asked for, so that approval is withdrawn and a new one is open for the letter as it is now. Read it again and approve."
          : "The recipient list or the send window changed after approval was asked for, so a new approval is open naming them as they are now. Read it again and approve.",
    };
  }

  const locked = await lockLetterCopy(id, by.email);
  if (!locked.ok) return { ok: false, error: `The copy could not be frozen for approval: ${locked.error}` };
  const thaw = async () => {
    if (locked.locked) await unlockLetterCopy(id);
  };
  const frozen = await loadLetter(id);
  if (!frozen.ok || letterVersion(frozen.data) !== seenVersion) {
    await thaw();
    return { ok: false, error: "The letter changed as you approved it. Reload, read it again, and approve." };
  }
  const decided = await decidePendingApproval(
    {
      subjectType: LETTER_SEND,
      subjectId: id,
      state: "approved",
      decidedBy: by.personId,
      metadata: { approvedBy: by.email },
      expect: { id: (latest as SubjectApproval).id, version: seenVersion },
    },
    by.email,
  );
  if (!decided.ok) {
    await thaw();
    return { ok: false, error: `Could not record the approval: ${decided.error}` };
  }
  if (!decided.decided) {
    // Two presses at once: the other one may have decided this very version
    // while this one froze the copy. Thawing then would leave an approved
    // letter as a draft its scheduled send can never release.
    const after = await readLatest(id);
    if (after.ok && after.latest?.state === "approved" && str(after.latest.metadata.version) === seenVersion) {
      return { ok: false, error: "This letter was approved a moment ago, by another press; it is being scheduled." };
    }
    await thaw();
    return { ok: false, error: "This approval was decided or asked again a moment ago. Reload and read it again." };
  }
  return schedule(frozen.data, latest, by);
}

// Whether the pending approval still names this send's reach and window.
async function stillNamed(letter: Letter, pending: SubjectApproval | null): Promise<{ ok: true; same: boolean } | { ok: false; error: string }> {
  if (pending?.state !== "pending") return { ok: true, same: false };
  const campaign = await getBroadcast(letter.id);
  if (!campaign) return { ok: false, error: "The broadcast could not be read." };
  const counted = await pendingRecipientCount(letter.id);
  if (!counted.ok) return { ok: false, error: `The recipients could not be counted: ${counted.error}` };
  const window = describeWindow(campaign.segment.sendWindow ?? TUESDAY_FRIDAY_EIGHT);
  return { ok: true, same: pending.metadata.recipients === counted.count && pending.metadata.sendWindow === window };
}

async function askAgain(letter: Letter, stale: SubjectApproval | null, by: Decider): Promise<{ ok: true } | { ok: false; error: string }> {
  if (stale?.state === "pending") {
    const withdrawn = await withdrawPendingApproval(
      { subjectType: LETTER_SEND, subjectId: letter.id, cancelledBy: by.personId, reason: "The letter changed after approval was asked for." },
      by.email,
    );
    if (!withdrawn.ok) return withdrawn;
    const run = str(stale.metadata.run);
    if (run) await closeParkedRun(LETTER_ROUTINE_ID, run, { status: "skipped", summary: "superseded: the letter changed" });
  }
  const campaign = await getBroadcast(letter.id);
  if (!campaign) return { ok: false, error: "The broadcast could not be read." };
  const asked = await askToSend(letter, campaign);
  return asked.ok ? { ok: true } : asked;
}

// The copy is frozen and the approval decided: stamp each recipient's moment
// and write the due time. A failure leaves the broadcast approved but the run at
// ready, which Start sending refuses, so nothing mails an unstamped list; the
// next Approve resumes here.
async function schedule(letter: Letter, approval: SubjectApproval | null, by: Decider): Promise<Result> {
  const campaign = await getBroadcast(letter.id);
  if (!campaign) return { ok: false, error: "Approved, but the broadcast could not be read to schedule it. Approve again to resume." };
  const window = campaign.segment.sendWindow ?? TUESDAY_FRIDAY_EIGHT;
  const scheduled = await stampLetterSend(letter.id, window);
  if (!scheduled.ok) return { ok: false, error: `Approved, but the send was not scheduled (${scheduled.error}). Approve again to resume.` };
  const run = approval ? str(approval.metadata.run) : null;
  if (run) await closeParkedRun(LETTER_ROUTINE_ID, run, { status: "ok", summary: `approved by ${by.email}` });
  const parked = await parkRun(LETTER_ROUTINE_ID, dueTick(letter.id), `Scheduled: sends from ${scheduled.firstSendAt} to ${scheduled.recipients} recipients.`);
  if (!parked.ok) console.error(`[letter] ${letter.id}: scheduled but the wait was not recorded: ${parked.error}`);
  return { ok: true };
}

/** The approver's Reject: nothing is sent, the broadcast is cancelled, the run closes. */
export async function rejectSend(id: string, by: Decider, reason: string | null = null): Promise<Result> {
  const loaded = await loadLetter(id);
  if (!loaded.ok) return loaded;
  if (loaded.data.agentStep !== LETTER_READY) return { ok: false, error: "The letter is not waiting on a send approval." };
  const read = await readLatest(id);
  if (!read.ok) return read;
  const decided = await decidePendingApproval({ subjectType: LETTER_SEND, subjectId: id, state: "rejected", decidedBy: by.personId, reason }, by.email);
  if (!decided.ok) return { ok: false, error: `Could not record the rejection: ${decided.error}` };
  if (!decided.decided) return { ok: false, error: "There is no send approval waiting to reject; it was decided a moment ago, or none was open." };
  const cancelled = await cancelLetterBroadcast(id);
  if (!cancelled.ok) return { ok: false, error: `Rejected, but the broadcast was not cancelled (${cancelled.error}). Cancel it below.` };
  const closed = await setAgentState(id, { step: LETTER_REJECTED, error: null });
  if (!closed.ok) return { ok: false, error: `Rejected, but the run did not close (${closed.error}).` };
  const run = read.latest ? str(read.latest.metadata.run) : null;
  if (run) await closeParkedRun(LETTER_ROUTINE_ID, run, { status: "ok", summary: "rejected" });
  return { ok: true };
}

/**
 * A cancel of the letter's run before it sends: the broadcast's Cancel or
 * Delete, a Stop, or a restart. A pending approval is withdrawn; an approved one
 * gets a cancellation after it, which is what the send step reads. The run
 * closes as cancelled when it was waiting; a run still writing is left to the
 * caller. Nothing is written for a letter with no approval on record.
 */
export async function cancelSend(id: string, by: Decider, why: string): Promise<Result> {
  const loaded = await loadLetter(id);
  if (!loaded.ok) return loaded;
  const letter = loaded.data;
  const read = await readLatest(id);
  if (!read.ok) return read;
  const latest = read.latest;
  // A letter already released keeps its approval: what went out was approved.
  if ((latest?.state === "pending" || latest?.state === "approved") && letter.agentStep !== LETTER_RELEASED) {
    const cancelled = await cancelApproval({ subjectType: LETTER_SEND, subjectId: id, cancelledBy: by.personId }, by.email);
    if (!cancelled.ok) return cancelled;
  }
  // A letter frozen for an approval whose schedule never finished (approved,
  // still at ready) goes back to a draft with its approval: nothing approved
  // stands behind its copy any more, and only a draft is edited and asked again.
  if (letter.agentStep === LETTER_READY && letter.status === "approved") {
    const thawed = await unlockLetterCopy(id);
    if (!thawed.ok) return thawed;
  }
  if (letter.agentStep === LETTER_READY || letter.agentStep === LETTER_SCHEDULED) {
    const closed = await setAgentState(id, { step: LETTER_CANCELLED, error: null });
    if (!closed.ok) return closed;
    const run = latest ? str(latest.metadata.run) : null;
    if (run) await closeParkedRun(LETTER_ROUTINE_ID, run, { status: "skipped", summary: why });
    await closeParkedRun(LETTER_ROUTINE_ID, dueTick(id), { status: "skipped", summary: why });
  }
  return { ok: true };
}
