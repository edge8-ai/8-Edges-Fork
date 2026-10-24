import type { Result } from "@/kernel/data/result";
import type { ApprovalSubject } from "@/kernel/approvals/vocabulary";
import { HIRING_APPROVER, type MessageKind } from "./steps";
import type { CandidateMessage, ChainApplication, ChainDeps, ChainRequisition, Proposal, Shortlist } from "./types";
import { decisionVersion, requisitionVersion, waitTick } from "./versions";

// Asking for a hiring approval, and asking again. Each ask opens the approval
// addressed to whoever holds hiring.approve and parks the run as a waiting
// routine run (ADR 0015: a wait on a person is a `waiting` row), so Settings
// -> Agents shows what the chain waits on. Asking again after an edit
// withdraws the pending approval first, so the new one is a new row: a click
// on the old page, bound to the old row's id and version, decides nothing.

export const KIND_LABEL: Record<MessageKind, string> = {
  invite: "Interview invitation",
  decline: "Decline",
  decision_hire: "Hire message",
  decision_reject: "Rejection message",
};

const NOBODY = "It waits. Nothing is sent or written until the approver decides.";

export type Ask = { subjectType: ApprovalSubject; subjectId: string; version: string; tick: string };

async function ask(
  deps: ChainDeps,
  a: Ask & { label: string; requestedBy: string | null; parkSummary: string; metadata: Record<string, unknown> },
): Promise<Result> {
  const opened = await deps.approvals.open({
    subjectType: a.subjectType,
    subjectId: a.subjectId,
    requestedBy: a.requestedBy,
    label: a.label,
    metadata: { version: a.version, run: a.tick, ifNobodyDecides: NOBODY, approver: HIRING_APPROVER, ...a.metadata },
  });
  if (!opened.ok) return opened;
  return deps.runs.park(a.tick, a.parkSummary);
}

/**
 * Withdraws whatever is pending on the subject and closes its wait, so the
 * next ask is a new approval. Used before asking again, and on Stop.
 */
export async function withdrawAsk(deps: ChainDeps, subjectType: ApprovalSubject, subjectId: string, epochOf: { id: string; epoch: string | null; what: string }, by: string | null, reason: string): Promise<Result> {
  const latest = await deps.approvals.latest(subjectType, subjectId);
  if (!latest || latest.state !== "pending") return { ok: true };
  const withdrawn = await deps.approvals.withdraw({ subjectType, subjectId, cancelledBy: by, reason });
  if (!withdrawn.ok) return withdrawn;
  const version = typeof latest.metadata.version === "string" ? latest.metadata.version : "";
  return deps.runs.close(waitTick(epochOf.id, epochOf.epoch, epochOf.what, version), { status: "skipped", summary: reason });
}

export async function askMessage(deps: ChainDeps, app: ChainApplication, msg: CandidateMessage): Promise<Result> {
  return ask(deps, {
    subjectType: "hiring_message",
    subjectId: msg.id,
    version: msg.version,
    tick: waitTick(app.id, app.epoch, `message-${msg.id}`, msg.version),
    label: `${KIND_LABEL[msg.kind]} to ${app.candidateName}`,
    requestedBy: null,
    parkSummary: `${KIND_LABEL[msg.kind]} to ${app.candidateName} waits on its approval.`,
    metadata: { applicationId: app.id, kind: msg.kind, reach: "one candidate" },
  });
}

export function decisionSubject(outcome: Proposal["outcome"]): "hiring_hire" | "hiring_reject" {
  return outcome === "hired" ? "hiring_hire" : "hiring_reject";
}

export async function askDecision(deps: ChainDeps, app: ChainApplication, proposal: Proposal, msg: CandidateMessage, roleTitle: string): Promise<Result> {
  const version = decisionVersion({ outcome: proposal.outcome, reason: proposal.reason, messageVersion: msg.version });
  const hire = proposal.outcome === "hired";
  return ask(deps, {
    subjectType: decisionSubject(proposal.outcome),
    subjectId: app.id,
    version,
    tick: waitTick(app.id, app.epoch, `decision-${proposal.proposedAt}`, version),
    label: `${hire ? "Hire" : "Reject"} ${app.candidateName} for ${roleTitle}`,
    requestedBy: proposal.proposedBy,
    parkSummary: `${hire ? "A hire" : "A rejection"} of ${app.candidateName} waits on its approval.`,
    metadata: {
      applicationId: app.id,
      outcome: proposal.outcome,
      reason: proposal.reason,
      messageId: msg.id,
      messageVersion: msg.version,
      reach: hire ? "commitment" : "one candidate",
    },
  });
}

export async function askShortlist(deps: ChainDeps, req: ChainRequisition, s: Shortlist): Promise<Result> {
  const count = (lane: string) => s.items.filter((i) => i.lane === lane).length;
  return ask(deps, {
    subjectType: "hiring_shortlist",
    subjectId: s.id,
    version: s.version,
    tick: waitTick(req.id, req.epoch, `shortlist-${s.id}`, s.version),
    label: `Shortlist for ${req.title}, round ${s.round}`,
    requestedBy: null,
    parkSummary: `Round ${s.round} of the shortlist for ${req.title} waits on its approval.`,
    metadata: {
      requisitionId: req.id,
      round: s.round,
      advance: count("advance"),
      decline: count("decline"),
      hold: count("hold"),
    },
  });
}

export async function askRequisition(deps: ChainDeps, req: ChainRequisition, requestedBy: string | null): Promise<Result> {
  const version = requisitionVersion(req.content);
  return ask(deps, {
    subjectType: "hiring_requisition",
    subjectId: req.id,
    version,
    tick: waitTick(req.id, req.epoch, "open", version),
    label: `Open the ${req.title} requisition`,
    requestedBy,
    parkSummary: `Opening ${req.title} waits on its approval.`,
    metadata: { requisitionId: req.id, reach: req.isPublic ? "public" : "commitment" },
  });
}
