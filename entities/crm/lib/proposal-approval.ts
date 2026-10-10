import { decidePendingApproval, openApproval, withdrawPendingApproval } from "@/kernel/approvals/requests";
import { contentVersion } from "@/kernel/approvals/version";
import { latestApproval, type SubjectApproval } from "@/kernel/approvals/waiting";
import { closeParkedRun, parkRun } from "@/kernel/audit/parked-runs";
import { stepTick } from "@/kernel/audit/step-driver";
import type { Result } from "@/kernel/data/result";
import { docOf, lineItemsOf, loadDraft, moveDraft, type DraftRow } from "./proposal-data";
import { PROPOSAL_APPROVER, PROPOSAL_ROUTINE_ID } from "./proposal-types";

// The proposal's Publish approval (Z.10, plan B6), the writer's pattern
// (entities/campaigns/lib/writer/publish-approval.ts) function for function.
// A drafted proposal parks at `ready` and waits on a proposal_publish approval
// addressed to whoever holds crm.proposal-approve: never a person named in
// code, never a timeout, never a backup. The approval carries the version of
// the proposal it is for, a hash of exactly what would go live (the sections,
// the price, the lines, the URL, the deal and the client). Approving decides
// that row only when the page, the proposal and the approval name the same
// version, then moves the run to publish; the publish step checks the latest
// approval against the proposal once more before anything goes live. An edit
// withdraws the pending approval and asks again for the new version. Rejecting
// closes the run, and nothing is published.
//
// Nothing here guards: the review page's actions call requirePermission first,
// inline (ADR 0007). No api/ route imports this file.

const SUBJECT = "proposal_publish" as const;

export type Decider = { personId: string | null; email: string };

type Versioned = Pick<DraftRow, "id" | "company_id" | "deal_id" | "slug" | "amount_cents" | "currency" | "sections" | "line_items">;

/** The version an approval is for: what the client would read, where, priced how, for whom. */
export function proposalVersion(row: Versioned): string {
  return contentVersion({
    sections: docOf(row),
    amountCents: row.amount_cents,
    currency: row.currency,
    lineItems: lineItemsOf(row),
    slug: row.slug,
    dealId: row.deal_id,
    companyId: row.company_id,
  });
}

/** The live page's address. */
export function proposalUrl(origin: string, slug: string): string {
  return `${origin.replace(/\/$/, "")}/proposals/d/${slug}/`;
}

// The waiting row's tick: one per version asked for, so a new approval after an
// edit is a new wait, and the old one closes as superseded.
export function waitTick(row: Pick<DraftRow, "id" | "started_at">, version: string): string {
  return stepTick({ id: row.id, epoch: row.started_at, step: `approval-${version}` });
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

export type AskContext = { companyName: string; meetingTitle: string | null; url: string };

/**
 * Ask for approval of the proposal as it is now, and park the run on it.
 * Opening is idempotent: an approval already pending is refreshed with this
 * version rather than joined by a second.
 */
export async function askForApproval(row: DraftRow, ctx: AskContext): Promise<Result & { version?: string }> {
  const version = proposalVersion(row);
  const tick = waitTick(row, version);
  const opened = await openApproval({
    subjectType: SUBJECT,
    subjectId: row.id,
    approverPermission: PROPOSAL_APPROVER,
    requestedBy: null,
    label: `Publish the proposal for ${ctx.companyName}`,
    metadata: {
      version,
      reach: "commitment",
      where: ctx.url,
      run: tick,
      meetingId: row.meeting_id,
      meetingTitle: ctx.meetingTitle,
      companyName: ctx.companyName,
      amountCents: row.amount_cents,
      currency: row.currency,
    },
  });
  if (!opened.ok) return opened;
  // The approval row is what the run waits on; the waiting row is how
  // Settings -> Agents shows the wait. A wait it cannot show is logged.
  const parked = await parkRun(PROPOSAL_ROUTINE_ID, tick, `Waiting on a Publish approval for version ${version}.`);
  if (!parked.ok) console.error(`[crm/proposal] ${row.id}: approval opened but the wait was not recorded: ${parked.error}`);
  return { ok: true, version };
}

export type PublishGate = { ok: true; version: string } | { ok: false; reason: string; state: string | null };

/**
 * May the publish step publish this proposal? Only when its latest approval is
 * approved and is for exactly this version. Raises when the approval cannot be
 * read, so the step fails and is retried rather than publishing on a guess.
 */
export async function proposalPublishGate(row: Versioned): Promise<PublishGate> {
  const version = proposalVersion(row);
  const latest = await latestApproval(SUBJECT, row.id);
  if (!latest) return { ok: false, reason: "No Publish approval is on record for this proposal.", state: null };
  if (latest.state !== "approved") return { ok: false, reason: `The Publish approval is ${latest.state}, not approved.`, state: latest.state };
  if (str(latest.metadata.version) !== version) return { ok: false, reason: "The proposal changed after it was approved.", state: latest.state };
  return { ok: true, version };
}

async function readLatest(id: string): Promise<{ ok: true; latest: SubjectApproval | null } | { ok: false; error: string }> {
  try {
    return { ok: true, latest: await latestApproval(SUBJECT, id) };
  } catch (err) {
    return { ok: false, error: `Could not read the Publish approval: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** Withdraw a pending approval, closing its wait; a decided one is left as it is. */
async function withdrawPending(latest: SubjectApproval | null, id: string, by: Decider, why: string): Promise<Result> {
  if (latest?.state !== "pending") return { ok: true };
  const withdrawn = await withdrawPendingApproval({ subjectType: SUBJECT, subjectId: id, cancelledBy: by.personId, reason: why }, by.email);
  if (!withdrawn.ok) return withdrawn;
  const run = str(latest.metadata.run);
  if (run) await closeParkedRun(PROPOSAL_ROUTINE_ID, run, { status: "skipped", summary: `superseded: ${why}` });
  return { ok: true };
}

/**
 * The proposal changed (an edit, a deal chosen): withdraw what is pending and
 * ask again for the proposal as it is. A run already approved but not yet
 * published goes back to ready, the writer's rule. A run at any other step is
 * left alone: its next ask will name the new version.
 */
export async function reaskAfterChange(id: string, ctx: AskContext, by: Decider, why: string): Promise<Result & { version?: string }> {
  const row = await loadDraft(id);
  if (!row) return { ok: false, error: "Proposal not found." };
  if (row.step !== "ready" && row.step !== "publish") return { ok: true };
  const read = await readLatest(id);
  if (!read.ok) return read;
  const withdrawn = await withdrawPending(read.latest, id, by, why);
  if (!withdrawn.ok) return withdrawn;
  if (row.step === "publish") {
    const moved = await moveDraft(id, "publish", { step: "ready", error: null });
    if (!moved) return { ok: false, error: "The proposal moved on a moment ago. Reload to see where it is." };
  }
  return askForApproval({ ...row, step: "ready" }, ctx);
}

/**
 * The approver's Approve and publish. `seenVersion` is the version the page
 * showed them; it must be the proposal's version now and the version the
 * pending approval asks about. When either differs, the stale approval is
 * withdrawn, a new one is opened, and the click decides nothing. Only the call
 * that closes the pending row moves the run, so a double click or two
 * approvers at once publish once.
 */
export async function approveProposal(id: string, seenVersion: string, by: Decider, ctx: AskContext): Promise<Result> {
  const row = await loadDraft(id);
  if (!row) return { ok: false, error: "Proposal not found." };
  if (row.step !== "ready") {
    return { ok: false, error: row.step === "publish" ? "Already approved; the proposal is being published." : "This proposal is not waiting on an approval." };
  }
  if (!row.deal_id) {
    return { ok: false, error: "The proposal has no deal, so it would reach no client portal. Apply the CRM change that creates the deal first, then approve." };
  }
  const current = proposalVersion(row);
  const read = await readLatest(id);
  if (!read.ok) return read;
  const latest = read.latest;

  // Approved for this very version with the run still at ready: the decision
  // landed and the move after it did not. Resume rather than ask again.
  if (latest?.state === "approved" && str(latest.metadata.version) === current) return moveToPublish(row, latest, by);

  const pendingVersion = latest?.state === "pending" ? str(latest.metadata.version) : null;
  if (seenVersion !== current || pendingVersion !== current) {
    const withdrawn = await withdrawPending(latest, id, by, "The proposal changed after approval was asked for.");
    if (!withdrawn.ok) return { ok: false, error: `The approval could not be asked for again: ${withdrawn.error}` };
    const asked = await askForApproval(row, ctx);
    if (!asked.ok) return { ok: false, error: `The approval could not be asked for again: ${asked.error}` };
    if (seenVersion !== current) return { ok: false, error: "The proposal changed since this page loaded. Reload, read it again, and approve." };
    return {
      ok: false,
      error: pendingVersion
        ? "The proposal changed after approval was asked for, so that approval is withdrawn and a new one is open for the proposal as it is now. Read it again and approve."
        : "No approval was open for this proposal; one is open now for the version on this page. Approve again to decide it.",
    };
  }

  const decided = await decidePendingApproval(
    {
      subjectType: SUBJECT,
      subjectId: id,
      state: "approved",
      decidedBy: by.personId,
      metadata: { approvedBy: by.email },
      expect: { id: (latest as SubjectApproval).id, version: current },
    },
    by.email,
  );
  if (!decided.ok) return { ok: false, error: `Could not record the approval: ${decided.error}` };
  if (!decided.decided) return { ok: false, error: "This approval was decided or asked again a moment ago. Reload and read it again." };
  return moveToPublish(row, latest, by);
}

async function moveToPublish(row: DraftRow, approval: SubjectApproval | null, by: Decider): Promise<Result> {
  const moved = await moveDraft(row.id, "ready", { step: "publish", error: null });
  if (!moved) return { ok: false, error: "Approved, but the run did not move on to publish. Reload: it may have moved a moment ago." };
  const run = approval ? str(approval.metadata.run) : null;
  if (run) await closeParkedRun(PROPOSAL_ROUTINE_ID, run, { status: "ok", summary: `approved by ${by.email}` });
  return { ok: true };
}

/** The approver's Reject: decides the pending approval and closes the run. Nothing is published. */
export async function rejectProposal(id: string, by: Decider, reason: string | null): Promise<Result> {
  const row = await loadDraft(id);
  if (!row) return { ok: false, error: "Proposal not found." };
  if (row.step !== "ready") return { ok: false, error: "This proposal is not waiting on an approval." };
  const read = await readLatest(id);
  if (!read.ok) return read;
  const decided = await decidePendingApproval({ subjectType: SUBJECT, subjectId: id, state: "rejected", decidedBy: by.personId, reason }, by.email);
  if (!decided.ok) return { ok: false, error: `Could not record the rejection: ${decided.error}` };
  if (!decided.decided) return { ok: false, error: "There is no approval waiting to reject; it was decided a moment ago, or none was open." };
  const closed = await moveDraft(id, "ready", { step: "rejected", error: null, finished_at: new Date().toISOString() });
  if (!closed) return { ok: false, error: "Rejected, but the run did not close. Reload and press Stop to end it." };
  const run = read.latest ? str(read.latest.metadata.run) : null;
  if (run) await closeParkedRun(PROPOSAL_ROUTINE_ID, run, { status: "ok", summary: "rejected" });
  return { ok: true };
}

/** Withdraw a pending approval when its run ends without a decision (Stop, a new run, the meeting gone). */
export async function withdrawProposal(id: string, by: Decider, why: string): Promise<Result> {
  const read = await readLatest(id);
  if (!read.ok) return read;
  return withdrawPending(read.latest, id, by, why);
}

/** What the review page shows beside the decision. */
export type ProposalApprovalView = { currentVersion: string; pendingVersion: string | null; latestState: string | null; where: string | null; decidedAt: string | null };

export async function proposalApprovalView(row: DraftRow): Promise<ProposalApprovalView> {
  const latest = await latestApproval(SUBJECT, row.id);
  return {
    currentVersion: proposalVersion(row),
    pendingVersion: latest?.state === "pending" ? str(latest.metadata.version) : null,
    latestState: latest?.state ?? null,
    where: latest ? str(latest.metadata.where) : null,
    decidedAt: latest?.decidedAt ?? null,
  };
}
