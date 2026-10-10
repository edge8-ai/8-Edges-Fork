import { decidePendingApproval, withdrawPendingApproval } from "@/kernel/approvals/requests";
import { latestApproval, type SubjectApproval } from "@/kernel/approvals/waiting";
import { closeParkedRun } from "@/kernel/audit/parked-runs";
import { decideRunMode } from "@/kernel/audit/routine-runs";
import type { Result } from "@/kernel/data/result";
import { companyDomain, draftProblems } from "./checks";
import { loadRun, loadRunForMeeting, openRun, updateRunAt, type FollowupRun } from "./data";
import { chainItems, markItem } from "./items";
import { companyContacts, loadChainMeeting, peopleByIds } from "./sources";
import { recipientEmails, senderFor } from "./people";
import { runFollowupStepNow } from "./run";
import { MEETING_FOLLOWUP } from "./step-kit";
import { MEETING_ACTIONS_ROUTINE_ID, type FollowupState } from "./steps";
import { followupVersion } from "./version";

// What a person does to a follow-up on the meeting page (spec sections 3 and
// 6), after the server action has guarded (ADR 0007: nothing here guards).
// Approve decides only the version the page showed, and only the call that
// closes the pending approval moves the run to send, so a double click sends
// once. An edit makes a new version, withdraws the approval for the old one
// and asks again. Reject sends nothing and leaves the cards. The model's own
// draft (ai_subject, ai_body_md) is never written here.

export type Decider = { personId: string | null; email: string };

function str(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

/** Whether this person may decide the run's approval: the approver it names, or anyone holding its atom when it names none. */
function mayDecide(run: FollowupRun, by: Decider): boolean {
  return run.approverPersonId === null || run.approverPersonId === by.personId;
}

const NOT_YOURS = "This follow-up waits on the meeting's owner; only they can decide it.";

async function readLatest(id: string): Promise<{ ok: true; latest: SubjectApproval | null } | { ok: false; error: string }> {
  try {
    return { ok: true, latest: await latestApproval(MEETING_FOLLOWUP, id) };
  } catch (err) {
    return { ok: false, error: `Could not read the approval: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** Withdraw the pending approval of a stale version and close its wait. */
async function withdrawStale(run: FollowupRun, latest: SubjectApproval | null, by: Decider, why: string): Promise<Result> {
  if (latest?.state !== "pending") return { ok: true };
  const withdrawn = await withdrawPendingApproval({ subjectType: MEETING_FOLLOWUP, subjectId: run.id, cancelledBy: by.personId, reason: why }, by.email);
  if (!withdrawn.ok) return withdrawn;
  const tick = str(latest.metadata.run);
  if (tick) await closeParkedRun(MEETING_ACTIONS_ROUTINE_ID, tick, { status: "skipped", summary: `superseded: ${why}` });
  return { ok: true };
}

/**
 * Move a ready run back to ask and run the ask step now, so the new version's
 * approval opens at once. The run gets a new start time: its ask tick of this
 * start already passed, and a passed tick never runs again.
 */
async function askAgain(run: FollowupRun): Promise<Result> {
  if (!(await updateRunAt(run.id, "ready", { step: "ask", started_at: new Date().toISOString() }))) {
    return { ok: false, error: "The follow-up moved a moment ago. Reload and read it again." };
  }
  const asked = await runFollowupStepNow(run.id);
  if ("skipped" in asked) return { ok: true };
  return asked.ok ? { ok: true } : { ok: false, error: asked.error };
}

/** The approver's Approve, for the version the page showed. Sends at once when it is the one that decided. */
export async function approveFollowup(id: string, seenVersion: string, by: Decider): Promise<Result> {
  const run = await loadRun(id);
  if (!run) return { ok: false, error: "No such follow-up." };
  if (!mayDecide(run, by)) return { ok: false, error: NOT_YOURS };
  if (run.step !== "ready") return { ok: false, error: run.step === "sent" ? "Already sent." : "This follow-up is not waiting on an approval." };
  if (run.toPersonIds.length === 0) return { ok: false, error: "Tick at least one person to send to, and save, before approving." };
  if (!run.version || seenVersion !== run.version) return { ok: false, error: "The follow-up changed since this page loaded. Reload, read it again, and approve." };
  const read = await readLatest(id);
  if (!read.ok) return read;
  const latest = read.latest;
  if (latest?.state !== "pending" || str(latest.metadata.version) !== seenVersion) {
    const withdrawn = await withdrawStale(run, latest, by, "the follow-up changed after approval was asked for");
    if (!withdrawn.ok) return withdrawn;
    const asked = await askAgain(run);
    if (!asked.ok) return asked;
    return { ok: false, error: "No approval was open for this version; one is open now. Read it again and approve." };
  }
  const decided = await decidePendingApproval(
    { subjectType: MEETING_FOLLOWUP, subjectId: id, state: "approved", decidedBy: by.personId, metadata: { approvedBy: by.email }, expect: { id: latest.id, version: seenVersion } },
    by.email,
  );
  if (!decided.ok) return { ok: false, error: `Could not record the approval: ${decided.error}` };
  if (!decided.decided) return { ok: false, error: "This approval was decided or asked again a moment ago. Reload and read it again." };
  if (!(await updateRunAt(id, "ready", { step: "send" }))) return { ok: false, error: "Approved, but the run had moved; reload to see where it is." };
  const tick = str(latest.metadata.run);
  if (tick) await closeParkedRun(MEETING_ACTIONS_ROUTINE_ID, tick, { status: "ok", summary: `approved by ${by.email}` });
  const sent = await runFollowupStepNow(id);
  if ("skipped" in sent) return { ok: true };
  if (!sent.ok) return { ok: false, error: `Approved, but the send failed and is tried again within minutes: ${sent.error}` };
  return { ok: true };
}

/** The approver's Reject: nothing is sent, the run closes, the cards stay. */
export async function rejectFollowup(id: string, by: Decider, reason: string | null): Promise<Result> {
  const run = await loadRun(id);
  if (!run) return { ok: false, error: "No such follow-up." };
  if (!mayDecide(run, by)) return { ok: false, error: NOT_YOURS };
  if (run.step !== "ready") return { ok: false, error: "This follow-up is not waiting on an approval." };
  const read = await readLatest(id);
  if (!read.ok) return read;
  const decided = await decidePendingApproval({ subjectType: MEETING_FOLLOWUP, subjectId: id, state: "rejected", decidedBy: by.personId, reason }, by.email);
  if (!decided.ok) return { ok: false, error: `Could not record the rejection: ${decided.error}` };
  if (!decided.decided) return { ok: false, error: "There is no approval waiting to reject; it was decided a moment ago." };
  if (!(await updateRunAt(id, "ready", { step: "rejected" }))) return { ok: false, error: "Rejected, but the run had moved; reload to see where it is." };
  const tick = read.latest ? str(read.latest.metadata.run) : null;
  if (tick) await closeParkedRun(MEETING_ACTIONS_ROUTINE_ID, tick, { status: "ok", summary: "rejected" });
  return { ok: true };
}

export type DraftEdit = { subject: string; bodyMd: string; toPersonIds: string[] };

/**
 * Save the approver's edits. Recipients only from the company's current
 * contacts (no typed address, decision 12); the body passes the same checks
 * as the model's draft. A changed version withdraws the approval for the old
 * one and asks for the new one.
 */
export async function saveFollowupDraft(id: string, edit: DraftEdit, by: Decider): Promise<Result & { version?: string }> {
  const run = await loadRun(id);
  if (!run) return { ok: false, error: "No such follow-up." };
  if (!mayDecide(run, by)) return { ok: false, error: NOT_YOURS };
  if (run.step !== "ready") return { ok: false, error: "Only a follow-up waiting on approval can be edited." };
  const meeting = await loadChainMeeting(run.meetingId);
  if (!meeting?.companyId || meeting.archivedAt) return { ok: false, error: "The meeting is no longer a live client meeting." };
  const contacts = await companyContacts(meeting.companyId);
  const toPersonIds = [...new Set(edit.toPersonIds)];
  const { emails, missing } = recipientEmails(toPersonIds, contacts);
  if (missing.length > 0) return { ok: false, error: "Recipients must be this client's contacts in the CRM, with an address." };
  const subject = edit.subject.trim();
  const bodyMd = edit.bodyMd.trim();
  const problems = draftProblems({ subject, bodyMd }, companyDomain(meeting.companyWebsite));
  if (problems.length > 0) return { ok: false, error: problems.join(" ") };
  const approver = run.approverPersonId ? (await peopleByIds([run.approverPersonId]))[0] : null;
  const version = followupVersion({ from: senderFor(approver?.email ?? null).from, to: emails, subject, bodyMd });
  if (version === run.version) return { ok: true, version };
  const read = await readLatest(id);
  if (!read.ok) return read;
  if (!(await updateRunAt(id, "ready", { subject, body_md: bodyMd, to_person_ids: toPersonIds, version }))) {
    return { ok: false, error: "The follow-up moved a moment ago. Reload and read it again." };
  }
  const withdrawn = await withdrawStale(run, read.latest, by, "the follow-up was edited");
  if (!withdrawn.ok) return withdrawn;
  const asked = await askAgain({ ...run, version });
  if (!asked.ok) return asked;
  return { ok: true, version };
}

/**
 * Start the chain for one meeting from its page, in scope or not (spec
 * section 2, "a button"): open the run if it has none, in the mode the
 * chain's switch is in, and run its first step now.
 */
export async function startMeetingRun(meetingId: string): Promise<Result> {
  const meeting = await loadChainMeeting(meetingId);
  if (!meeting?.companyId || meeting.archivedAt) return { ok: false, error: "Only a live client meeting can start the chain." };
  if (!meeting.summary?.trim()) return { ok: false, error: "The meeting has no summary yet." };
  const decided = await decideRunMode(MEETING_ACTIONS_ROUTINE_ID, { honourPause: false, shadowCapable: true });
  if ("skip" in decided) return { ok: false, error: `The chain cannot start now: ${decided.skip}.` };
  const { run, opened } = await openRun(meetingId, decided.run);
  if (!opened) return { ok: false, error: "This meeting already has a run." };
  const first = await runFollowupStepNow(run.id);
  if (!("skipped" in first) && !first.ok) return { ok: false, error: first.error };
  return { ok: true };
}

/**
 * Where a stopped or closed run resumes: the send when an approval for its
 * version stands, the ask when it has a draft, the extract when it has items
 * (which it keeps), else the start. A retry never drafts over an approver's
 * edits, and never asks the model for items it already has.
 */
async function resumeAt(run: FollowupRun): Promise<FollowupState> {
  if (run.version && !run.sentAt) {
    const latest = await latestApproval(MEETING_FOLLOWUP, run.id);
    if (latest?.state === "approved" && str(latest.metadata.version) === run.version) return "send";
  }
  if (run.aiBodyMd && run.mode === "live") return "ask";
  if ((await chainItems(run.meetingId)).length > 0) return "extract";
  return "gather";
}

/** Retry a stopped run, or run a closed one again: a new start time, so its steps are new ticks. */
export async function retryMeetingRun(id: string): Promise<Result> {
  const run = await loadRun(id);
  if (!run) return { ok: false, error: "No such follow-up." };
  if (run.step !== "stopped" && run.step !== "skipped") return { ok: false, error: "Only a stopped or closed run can be retried." };
  const at = await resumeAt(run);
  // A retry at the send step is a person's decision to send again (they were
  // told to check first), so the old claim is cleared and the send starts
  // from a fresh claim.
  const landed = await updateRunAt(id, run.step, {
    step: at,
    error: null,
    skip_reason: null,
    started_at: new Date().toISOString(),
    ...(at === "send" ? { send_claimed_at: null } : {}),
  });
  if (!landed) return { ok: false, error: "The run moved a moment ago. Reload to see where it is." };
  const first = await runFollowupStepNow(id);
  if (!("skipped" in first) && !first.ok) return { ok: false, error: first.error };
  return { ok: true };
}

/** A person's Useful / Not useful on a shadow run's proposed item. */
export async function markProposedItem(itemId: string, mark: "useful" | "not_useful"): Promise<Result> {
  return (await markItem(itemId, mark)) ? { ok: true } : { ok: false, error: "Only a shadow run's proposed item can be marked." };
}

/** A person's Would send / Would not on a shadow run's draft. */
export async function markShadowDraft(meetingId: string, verdict: "would_send" | "would_not"): Promise<Result> {
  const run = await loadRunForMeeting(meetingId);
  if (!run || run.step !== "shadowed") return { ok: false, error: "Only a shadow run's draft can be marked." };
  return (await updateRunAt(run.id, "shadowed", { shadow_verdict: verdict })) ? { ok: true } : { ok: false, error: "The run moved a moment ago. Reload." };
}
