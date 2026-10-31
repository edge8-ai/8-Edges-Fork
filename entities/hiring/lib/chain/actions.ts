"use server";

import { z } from "zod";
import { requirePermission } from "@/kernel/identity/access-request";
import { recordAudit } from "@/kernel/audit/audit";
import { actorOf, refreshChainPages, refuseUnlessLive, runNext } from "./action-support";
import { askToOpen, proposeDecision, retryApplication, retryRequisition, startShortlist, withdrawDecision, type ActionResult } from "./approvals";
import { chainDeps } from "./deps";

// The recruiter's side of the hiring chain (Z.9): ask to open a requisition,
// ask for a shortlist now, propose a hire or a rejection, take a proposal
// back, and retry a stopped run. Each needs hiring.ats; none decides anything:
// the approver's actions live in ./approve-actions under hiring.approve.

const id = z.string().uuid();

export async function askToOpenRequisition(requisitionId: string): Promise<ActionResult> {
  const access = await requirePermission("hiring.ats");
  if (!id.safeParse(requisitionId).success) return { ok: false, error: "Unknown requisition." };
  const refused = await refuseUnlessLive();
  if (refused) return { ok: false, error: refused };
  const by = actorOf(access);
  const res = await askToOpen(chainDeps, requisitionId);
  if (res.ok) await recordAudit({ table: "job_requisitions", recordId: requisitionId, operation: "update", actor: by.email, newData: { chain_step: "ask-open" } });
  return runNext(res, by.personId);
}

/** Propose a shortlist now. Allowed in shadow too, where it records the round the chain would have proposed. */
export async function proposeShortlistNow(requisitionId: string): Promise<ActionResult> {
  const access = await requirePermission("hiring.ats");
  if (!id.safeParse(requisitionId).success) return { ok: false, error: "Unknown requisition." };
  const res = await startShortlist(chainDeps, requisitionId);
  if (res.ok) await recordAudit({ table: "job_requisitions", recordId: requisitionId, operation: "update", actor: actorOf(access).email, newData: { chain_step: "shortlist" } });
  return runNext(res);
}

const proposal = z.object({
  outcome: z.enum(["hired", "rejected"]),
  reason: z.string().max(500),
});

export async function proposeApplicationDecision(applicationId: string, input: { outcome: string; reason: string }): Promise<ActionResult> {
  const access = await requirePermission("hiring.ats");
  if (!id.safeParse(applicationId).success) return { ok: false, error: "Unknown application." };
  const parsed = proposal.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Pick hire or reject, with a reason of at most 500 characters." };
  const refused = await refuseUnlessLive();
  if (refused) return { ok: false, error: refused };
  const by = actorOf(access);
  const res = await proposeDecision(chainDeps, applicationId, parsed.data, by);
  if (res.ok) {
    await recordAudit({ table: "applications", recordId: applicationId, operation: "update", actor: by.email, newData: { chain_step: "ask-decision", proposed: parsed.data.outcome } });
  }
  return runNext(res);
}

export async function withdrawApplicationDecision(applicationId: string): Promise<ActionResult> {
  const access = await requirePermission("hiring.ats");
  if (!id.safeParse(applicationId).success) return { ok: false, error: "Unknown application." };
  const res = await withdrawDecision(chainDeps, applicationId, actorOf(access));
  refreshChainPages();
  return res;
}

export async function retryApplicationRun(applicationId: string): Promise<ActionResult> {
  await requirePermission("hiring.ats");
  if (!id.safeParse(applicationId).success) return { ok: false, error: "Unknown application." };
  return runNext(await retryApplication(chainDeps, applicationId));
}

export async function retryRequisitionRun(requisitionId: string): Promise<ActionResult> {
  await requirePermission("hiring.ats");
  if (!id.safeParse(requisitionId).success) return { ok: false, error: "Unknown requisition." };
  return runNext(await retryRequisition(chainDeps, requisitionId));
}
