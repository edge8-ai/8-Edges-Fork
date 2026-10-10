"use server";

import { z } from "zod/v4";
import { requirePermission } from "@/kernel/identity/access-request";
import { revalidateSurfaces } from "@/kernel/shell/surface";
import type { Result } from "@/kernel/data/result";
import {
  approveFollowup as approve,
  markProposedItem,
  markShadowDraft,
  rejectFollowup as reject,
  retryMeetingRun,
  saveFollowupDraft as save,
  startMeetingRun,
  type Decider,
} from "./meeting-actions/decide";

// The meeting page's follow-up buttons (Z.13, spec section 6). Each action's
// first statement is its guard (rule 1, ADR 0007): crm.calls, the atom of the
// people who run client meetings. Approve, reject and save then check that the
// caller is the person the approval waits on, or holds its atom when it names
// nobody, inside meeting-actions/decide.ts. Inputs are parsed at this
// boundary; nothing a client sends is trusted as a recipient or a version.

const id = z.uuid();
const version = z.string().regex(/^[0-9a-f]{12}$/);

function refresh(meetingId?: string): void {
  revalidateSurfaces(meetingId ? `/revenue/meetings/${meetingId}` : "/revenue/meetings");
  revalidateSurfaces("/approvals");
}

function deciderOf(access: { personId: string | null; user: { email: string } }): Decider {
  return { personId: access.personId, email: access.user.email };
}

const BAD_INPUT: Result = { ok: false, error: "That request was not understood." };

/** "Start actions and follow-up" on a meeting with no run. */
export async function startMeetingFollowup(meetingId: string): Promise<Result> {
  await requirePermission("crm.calls");
  if (!id.safeParse(meetingId).success) return BAD_INPUT;
  const res = await startMeetingRun(meetingId);
  refresh(meetingId);
  return res;
}

/** Retry a stopped run, or run a closed one again. */
export async function retryMeetingFollowup(meetingId: string, runId: string): Promise<Result> {
  await requirePermission("crm.calls");
  if (!id.safeParse(meetingId).success || !id.safeParse(runId).success) return BAD_INPUT;
  const res = await retryMeetingRun(runId);
  refresh(meetingId);
  return res;
}

/** Approve and send the version the page showed. */
export async function approveFollowup(meetingId: string, runId: string, seenVersion: string): Promise<Result> {
  const access = await requirePermission("crm.calls");
  if (!id.safeParse(meetingId).success || !id.safeParse(runId).success || !version.safeParse(seenVersion).success) return BAD_INPUT;
  const res = await approve(runId, seenVersion, deciderOf(access));
  refresh(meetingId);
  return res;
}

/** Reject: nothing is sent, with the reason kept with the decision. */
export async function rejectFollowup(meetingId: string, runId: string, reason: string): Promise<Result> {
  const access = await requirePermission("crm.calls");
  if (!id.safeParse(meetingId).success || !id.safeParse(runId).success) return BAD_INPUT;
  const why = z.string().max(1000).safeParse(reason);
  if (!why.success) return BAD_INPUT;
  const res = await reject(runId, deciderOf(access), why.data.trim() || null);
  refresh(meetingId);
  return res;
}

const draftEdit = z.object({
  subject: z.string().max(300),
  bodyMd: z.string().max(20_000),
  toPersonIds: z.array(z.uuid()).max(50),
});

/** Save edits to the subject, the body or the recipients; a new version asks for a new approval. */
export async function saveFollowupDraft(meetingId: string, runId: string, edit: { subject: string; bodyMd: string; toPersonIds: string[] }): Promise<Result> {
  const access = await requirePermission("crm.calls");
  if (!id.safeParse(meetingId).success || !id.safeParse(runId).success) return BAD_INPUT;
  const parsed = draftEdit.safeParse(edit);
  if (!parsed.success) return BAD_INPUT;
  const res = await save(runId, parsed.data, deciderOf(access));
  refresh(meetingId);
  return res.ok ? { ok: true } : res;
}

/** Useful / Not useful on a shadow run's proposed item. */
export async function markFollowupItem(meetingId: string, itemId: string, mark: "useful" | "not_useful"): Promise<Result> {
  await requirePermission("crm.calls");
  if (!id.safeParse(meetingId).success || !id.safeParse(itemId).success || !z.enum(["useful", "not_useful"]).safeParse(mark).success) return BAD_INPUT;
  const res = await markProposedItem(itemId, mark);
  refresh(meetingId);
  return res;
}

/** Would send / Would not on a shadow run's draft. */
export async function markFollowupDraft(meetingId: string, verdict: "would_send" | "would_not"): Promise<Result> {
  await requirePermission("crm.calls");
  if (!id.safeParse(meetingId).success || !z.enum(["would_send", "would_not"]).safeParse(verdict).success) return BAD_INPUT;
  const res = await markShadowDraft(meetingId, verdict);
  refresh(meetingId);
  return res;
}
