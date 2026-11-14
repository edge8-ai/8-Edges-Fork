import type { ApprovalSubject } from "@/kernel/approvals/vocabulary";
import { currentRunMode } from "@/kernel/audit/run-context";
import type { StepResult } from "@/kernel/audit/run-loop";
import { stepTick } from "@/kernel/audit/step-driver";
import { updateRunAt, type FollowupRun } from "./data";
import type { ChainMeeting } from "./sources";
import type { FollowupState, FollowupStep } from "./steps";

// What every step of the meeting-to-actions run shares (Z.13): the approval
// subject, the effect keys, how a step reports, and the shadow test.

export const MEETING_FOLLOWUP = "meeting_followup" as const satisfies ApprovalSubject;

export type Result = StepResult<FollowupStep, FollowupState>;

/** The followup's send key, the Resend Idempotency-Key, one per meeting. */
export const followupKey = (meetingId: string) => `crm:followup:${meetingId}`;
/** The approver's one Lark DM, through the effect ledger. */
export const readyDmKey = (meetingId: string) => `crm:followup-ready:${meetingId}`;
/** The waiting row of one version's approval. */
export const approvalTick = (run: Pick<FollowupRun, "id" | "startedAt">, version: string) => stepTick({ id: run.id, epoch: run.startedAt, step: `approval-${version}` });

/** Whether this run acts or only records: a shadow run stays one, and a shadow tick makes one. */
export function inShadow(run: Pick<FollowupRun, "mode">): boolean {
  return run.mode === "shadow" || currentRunMode() === "shadow";
}

export const ok = (run: FollowupRun, step: FollowupStep, next: FollowupState, summary: string): Result => ({ ok: true, id: run.id, step, next, summary });
export const fail = (run: FollowupRun, step: FollowupStep, error: string): Result => ({ ok: false, id: run.id, step, error });

// A run that moved under this step (a person's click, the other mode's tick)
// is not this step's to finish. Recorded as a failure that says so; the tick
// stays free and the next one finds the run where it is.
export const moved = (run: FollowupRun, step: FollowupStep): Result => fail(run, step, "The run moved while this step ran; nothing more was done.");

/** Close a run whose meeting is gone, archived or no longer a client meeting. */
export async function closeGone(run: FollowupRun, step: FollowupStep, reason: string): Promise<Result> {
  if (!(await updateRunAt(run.id, step, { step: "skipped", skip_reason: reason }))) return moved(run, step);
  return ok(run, step, "skipped", reason);
}

export function meetingGone(meeting: ChainMeeting | null): string | null {
  if (!meeting) return "The meeting is gone.";
  if (meeting.archivedAt) return "The meeting was archived.";
  if (!meeting.companyId) return "The meeting is no longer linked to a client.";
  return null;
}
