// The version-checked decision (A.38). Five flows ask a person to approve one
// exact version of something before it goes out: the writer's post, the
// letter's send, the proposal, the meeting follow-up and the hiring chain's
// messages. Each records the version it asked about in the approval's
// metadata and must decide only that version. Each wrote that check itself,
// and the copies drifted: the meeting follow-up and the hiring chain had no
// resume for an approval that landed when the move after it did not, so a
// second press asked again for a version already approved.
//
// What differs between the flows stays in them, because it genuinely differs:
// how each asks, its preconditions, how its run moves on, how it rejects, the
// letter's frozen copy. A gate that took all of that as callbacks needed nine
// or ten per flow (A.38's diff), the shape A.18 refused. What is identical is
// below, with no callbacks: read the subject's latest approval, compare
// versions, decide bound to that row and version, and withdraw a stale
// request with the run that waits on it.
import type { Result } from "@/kernel/data/result";
import { closeParkedRun } from "@/kernel/audit/parked-runs";
import { decidePendingApproval, withdrawPendingApproval, type ApprovalRef } from "./requests";
import { latestApproval, type SubjectApproval } from "./waiting";
import type { ApprovalDecision } from "./vocabulary";

export type Decider = { personId: string | null; email: string };

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** The version an approval row was asked about. */
export const versionOf = (approval: SubjectApproval | null): string | null => (approval ? str(approval.metadata.version) : null);

/** The routine tick parked on an approval row, if one was. */
export const parkedTickOf = (approval: SubjectApproval | null): string | null => (approval ? str(approval.metadata.run) : null);

/**
 * What a press of Approve (or a hiring decision) found:
 * - `decided`: the pending approval for the current version is now decided.
 * - `already-approved`: the current version was approved and the flow's run
 *   never moved on; the flow resumes, it does not ask twice.
 * - `reload`: the page showed an older version, but the approval waiting is
 *   already for the current one; nothing changed and nothing is asked again.
 * - `ask-again`: nothing waits for the current version; `stalePending` is the
 *   request for an older one, to withdraw first, and `pageStale` says whether
 *   the page was old as well.
 * - `lost`: another decision, or a new ask, took the row between the read and
 *   the write; nothing was decided.
 * - `failed`: the approvals could not be read or written.
 */
export type VersionedDecision =
  | { outcome: "decided"; latest: SubjectApproval }
  | { outcome: "already-approved"; latest: SubjectApproval }
  | { outcome: "reload"; latest: SubjectApproval }
  | { outcome: "ask-again"; stalePending: SubjectApproval | null; pageStale: boolean }
  | { outcome: "lost"; latest: SubjectApproval }
  | { outcome: "failed"; error: string };

/**
 * The pure core: what the latest row says a decision for `current`, from a
 * page that showed `seen`, should do. `decide` means the latest row is the
 * pending request for `current` and may be decided. The hiring chain reads and
 * decides through its own port (its tests run on a fake), so it asks this
 * directly; every other flow calls decideForVersion.
 */
export type VersionClass =
  | { outcome: "already-approved"; latest: SubjectApproval }
  | { outcome: "reload"; latest: SubjectApproval }
  | { outcome: "ask-again"; stalePending: SubjectApproval | null; pageStale: boolean }
  | { outcome: "decide"; pending: SubjectApproval };

export function classifyForVersion(latest: SubjectApproval | null, seen: string, current: string): VersionClass {
  const latestVersion = versionOf(latest);
  if (latest?.state === "approved" && latestVersion === current) return { outcome: "already-approved", latest };
  const pendingIsCurrent = latest?.state === "pending" && latestVersion === current;
  if (!pendingIsCurrent) return { outcome: "ask-again", stalePending: latest?.state === "pending" ? latest : null, pageStale: seen !== current };
  const pending = latest as SubjectApproval;
  return seen !== current ? { outcome: "reload", latest: pending } : { outcome: "decide", pending };
}

/** The subject's latest approval row, or why it could not be read. */
export async function readLatestApproval(ref: ApprovalRef): Promise<{ ok: true; latest: SubjectApproval | null } | { ok: false; error: string }> {
  try {
    return { ok: true, latest: await latestApproval(ref.subjectType, ref.subjectId) };
  } catch (err) {
    return { ok: false, error: `Could not read the approval: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Decide the subject's pending approval for `current`, the version the flow
 * would act on now, from a page that showed `seen`. The decision is bound to
 * the row read and to `current` (`expect`), so an ask for a newer version
 * between the read and the write leaves it undecided rather than approved for
 * what nobody read.
 */
export async function decideForVersion(input: {
  ref: ApprovalRef;
  seen: string;
  current: string;
  by: Decider;
  state?: ApprovalDecision;
  reason?: string | null;
  metadata?: Record<string, unknown>;
  // The row the caller checked something else about before deciding (the
  // letter: its recipients and window). Another row, even one for the same
  // version, was asked about a send the decider never saw.
  expectId?: string;
}): Promise<VersionedDecision> {
  const read = await readLatestApproval(input.ref);
  if (!read.ok) return { outcome: "failed", error: read.error };
  const found = classifyForVersion(read.latest, input.seen, input.current);
  if (found.outcome !== "decide") return found;
  const pending = found.pending;
  if (input.expectId !== undefined && pending.id !== input.expectId) return { outcome: "lost", latest: pending };
  const decided = await decidePendingApproval(
    {
      ...input.ref,
      state: input.state ?? "approved",
      decidedBy: input.by.personId,
      reason: input.reason ?? null,
      metadata: input.metadata,
      expect: { id: pending.id, version: input.current },
    },
    input.by.email,
  );
  if (!decided.ok) return { outcome: "failed", error: `Could not record the decision: ${decided.error}` };
  return decided.decided ? { outcome: "decided", latest: pending } : { outcome: "lost", latest: pending };
}

/**
 * Withdraw the subject's pending approval and close the routine run parked on
 * it, as skipped. Hand in the latest row when the caller has just read it;
 * otherwise it is read here. A subject with nothing pending writes nothing.
 */
export async function withdrawAndClose(input: {
  ref: ApprovalRef;
  latest?: SubjectApproval | null;
  routineId: string;
  by: Decider;
  reason: string;
  summary?: string;
}): Promise<Result> {
  let latest = input.latest;
  if (latest === undefined) {
    const read = await readLatestApproval(input.ref);
    if (!read.ok) return read;
    latest = read.latest;
  }
  if (latest?.state !== "pending") return { ok: true };
  const withdrawn = await withdrawPendingApproval({ ...input.ref, cancelledBy: input.by.personId, reason: input.reason }, input.by.email);
  if (!withdrawn.ok) return withdrawn;
  const tick = parkedTickOf(latest);
  if (tick) await closeParkedRun(input.routineId, tick, { status: "skipped", summary: input.summary ?? input.reason });
  return { ok: true };
}
