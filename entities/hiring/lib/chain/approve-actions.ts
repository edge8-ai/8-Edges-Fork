"use server";

import { z } from "zod";
import { requirePermission } from "@/kernel/identity/access-request";
import { actorOf, refreshChainPages, refuseUnlessLive, runNext } from "./action-support";
import {
  approveDecision,
  approveMessage,
  approveRequisition,
  approveShortlist,
  dontSendMessage,
  editMessage,
  moveLane,
  rejectDecision,
  rejectRequisition,
  rejectShortlist,
  settleStuckMessage,
  type ActionResult,
} from "./approvals";
import { chainDeps } from "./deps";

// The approver's side of the hiring chain (Z.9, spec section 3c). Every
// action needs hiring.approve, and every approve is bound to the version the
// page showed: a stale page decides nothing and asks again. Approving runs
// the step it unblocks at once (the send, the decision, opening the
// requisition, applying the shortlist); the hiring driver retries it if it
// fails. Nothing is approved while the chain is in shadow.

const id = z.string().uuid();
const version = z.string().regex(/^[0-9a-f]{12}$/);
const reason = z.string().max(500).nullable();

function bad(what: string): ActionResult {
  return { ok: false, error: `Unknown ${what}.` };
}

export async function approveCandidateMessage(messageId: string, seenVersion: string): Promise<ActionResult> {
  const access = await requirePermission("hiring.approve");
  if (!id.safeParse(messageId).success || !version.safeParse(seenVersion).success) return bad("message");
  const refused = await refuseUnlessLive();
  if (refused) return { ok: false, error: refused };
  return runNext(await approveMessage(chainDeps, messageId, seenVersion, actorOf(access)));
}

export async function dontSendCandidateMessage(messageId: string, why: string | null): Promise<ActionResult> {
  const access = await requirePermission("hiring.approve");
  if (!id.safeParse(messageId).success || !reason.safeParse(why).success) return bad("message");
  const res = await dontSendMessage(chainDeps, messageId, actorOf(access), why);
  refreshChainPages();
  return res;
}

export async function editCandidateMessage(messageId: string, input: { subject: string; body: string }): Promise<ActionResult> {
  const access = await requirePermission("hiring.approve");
  const parsed = z.object({ subject: z.string().max(200), body: z.string().max(4000) }).safeParse(input);
  if (!id.safeParse(messageId).success || !parsed.success) return { ok: false, error: "Keep the subject under 200 characters and the message under 4000." };
  const res = await editMessage(chainDeps, messageId, parsed.data, actorOf(access));
  refreshChainPages();
  return res;
}

/** A message stuck in "sending" past the provider's duplicate window: mark it sent, or send it again. */
export async function settleStuckCandidateMessage(messageId: string, outcome: string): Promise<ActionResult> {
  const access = await requirePermission("hiring.approve");
  const parsed = z.enum(["sent", "resend"]).safeParse(outcome);
  if (!id.safeParse(messageId).success || !parsed.success) return bad("message");
  if (parsed.data === "resend") {
    const refused = await refuseUnlessLive();
    if (refused) return { ok: false, error: refused };
  }
  return runNext(await settleStuckMessage(chainDeps, messageId, parsed.data, actorOf(access)));
}

export async function approveApplicationDecision(applicationId: string, seenVersion: string): Promise<ActionResult> {
  const access = await requirePermission("hiring.approve");
  if (!id.safeParse(applicationId).success || !version.safeParse(seenVersion).success) return bad("application");
  const refused = await refuseUnlessLive();
  if (refused) return { ok: false, error: refused };
  return runNext(await approveDecision(chainDeps, applicationId, seenVersion, actorOf(access)));
}

export async function rejectApplicationDecision(applicationId: string, why: string | null): Promise<ActionResult> {
  const access = await requirePermission("hiring.approve");
  if (!id.safeParse(applicationId).success || !reason.safeParse(why).success) return bad("application");
  const res = await rejectDecision(chainDeps, applicationId, actorOf(access), why);
  refreshChainPages();
  return res;
}

export async function approveHiringShortlist(shortlistId: string, seenVersion: string): Promise<ActionResult> {
  const access = await requirePermission("hiring.approve");
  if (!id.safeParse(shortlistId).success || !version.safeParse(seenVersion).success) return bad("shortlist");
  const refused = await refuseUnlessLive();
  if (refused) return { ok: false, error: refused };
  return runNext(await approveShortlist(chainDeps, shortlistId, seenVersion, actorOf(access)));
}

export async function rejectHiringShortlist(shortlistId: string, why: string | null): Promise<ActionResult> {
  const access = await requirePermission("hiring.approve");
  if (!id.safeParse(shortlistId).success || !reason.safeParse(why).success) return bad("shortlist");
  const res = await rejectShortlist(chainDeps, shortlistId, actorOf(access), why);
  refreshChainPages();
  return res;
}

export async function moveShortlistLane(shortlistId: string, applicationId: string, lane: string): Promise<ActionResult> {
  const access = await requirePermission("hiring.approve");
  const parsedLane = z.enum(["advance", "decline", "hold"]).safeParse(lane);
  if (!id.safeParse(shortlistId).success || !id.safeParse(applicationId).success || !parsedLane.success) return bad("lane");
  const res = await moveLane(chainDeps, shortlistId, applicationId, parsedLane.data, actorOf(access));
  refreshChainPages();
  return res;
}

export async function approveRequisitionOpening(requisitionId: string, seenVersion: string): Promise<ActionResult> {
  const access = await requirePermission("hiring.approve");
  if (!id.safeParse(requisitionId).success || !version.safeParse(seenVersion).success) return bad("requisition");
  const refused = await refuseUnlessLive();
  if (refused) return { ok: false, error: refused };
  return runNext(await approveRequisition(chainDeps, requisitionId, seenVersion, actorOf(access)));
}

export async function rejectRequisitionOpening(requisitionId: string, why: string | null): Promise<ActionResult> {
  const access = await requirePermission("hiring.approve");
  if (!id.safeParse(requisitionId).success || !reason.safeParse(why).success) return bad("requisition");
  const res = await rejectRequisition(chainDeps, requisitionId, actorOf(access), why);
  refreshChainPages();
  return res;
}
