"use server";

import { z } from "zod";
import { requirePermission, type RequestAccess } from "@/kernel/identity/access-request";
import { zodIssuesToMessage } from "@/kernel/config/schemas";
import type { Result } from "@/kernel/data/result";
import { claimWriterFor, declineClaimItem, transitionClaim } from "./claim-lifecycle";
import { DECIDER_MOVES, type ClaimMove } from "./claim-rules";
import { deciderOf, NO_PERSON_RECORD } from "./deciders";
import { readClaimRow } from "./own-claims";
import { signClaimDocumentDownload } from "./claim-files";
import { enterItemRateByHand } from "./claim-items";
import { rereadItem } from "./receipt-reading";
import { claimPaths } from "./paths";
import { Id, Reason, refresh } from "./action-inputs";

// The deciders' actions on a claim (design §1.5), shared by the Team Finance
// pages and their Admin mirrors, so a rule lives once whichever surface the
// decider works on. Each export asks for its own permission first, whose
// reach is every claim: reimbursements.check for the checker's moves and the
// receipts they work on, reimbursements.approve for the approver's, and
// reimbursements.view for opening a document from Admin's claim page. The
// claim is then read unscoped and handed to the lifecycle module with an
// unscoped writer. What a permission cannot say — never your own claim,
// unless you hold the Employer's reimbursements.decide-own — the lifecycle
// module refuses, for every decision and every declined receipt.

type Opened = { ok: true; url: string } | { ok: false; error: string };

const NO_PERSON = { ok: false as const, error: NO_PERSON_RECORD };
const CheckerMove = z.enum(DECIDER_MOVES.checker);
const ApproverMove = z.enum(DECIDER_MOVES.approver);

const UNKNOWN_MOVE = { ok: false as const, error: "Unknown move." };

/** One decision by a checker or the approver, after the caller's guard and its move's whitelist. */
async function decide(access: RequestAccess, kind: "checker" | "approver", claimId: string, move: ClaimMove, reason: unknown): Promise<Result> {
  const actor = deciderOf(access, kind);
  if (!actor) return NO_PERSON;
  const id = Id.safeParse(claimId);
  if (!id.success) return { ok: false, error: zodIssuesToMessage(id.error.issues) };
  const why = Reason.optional().safeParse(reason);
  if (!why.success) return { ok: false, error: zodIssuesToMessage(why.error.issues) };
  const claim = await readClaimRow(id.data, {});
  if (!claim.ok) return claim;
  const moved = await transitionClaim({ row: claim.value, move, actor, write: claimWriterFor(id.data, {}), reason: why.data });
  if (moved.ok) refresh(claimPaths(id.data));
  return moved;
}

/** Check a claim (it goes on to the approver), send it back to its owner to fix, or reject it. The last two need a reason. */
export async function decideClaim(claimId: string, move: z.infer<typeof CheckerMove>, reason?: string): Promise<Result> {
  const access = await requirePermission("reimbursements.check");
  const which = CheckerMove.safeParse(move);
  if (!which.success) return UNKNOWN_MOVE;
  return decide(access, "checker", claimId, which.data, reason);
}

/** Approve a checked claim (it goes into the next payment run), send it back to its owner to fix, or reject it. The last two need a reason. Approve freezes the kept total in the lifecycle module. */
export async function approverDecides(claimId: string, move: z.infer<typeof ApproverMove>, reason?: string): Promise<Result> {
  const access = await requirePermission("reimbursements.approve");
  const which = ApproverMove.safeParse(move);
  if (!which.success) return UNKNOWN_MOVE;
  return decide(access, "approver", claimId, which.data, reason);
}

/**
 * Enter one receipt's rate by hand (RB.10): VND per one unit of its currency,
 * as the checker reads it from the bank. The receipt is valued at it, the
 * rate is kept with who entered it, and a rate-pending receipt can then be
 * checked. The lifecycle's own-claim rule holds here too.
 */
export async function enterItemRate(claimId: string, itemId: string, rate: string): Promise<Result> {
  const access = await requirePermission("reimbursements.check");
  const actor = deciderOf(access, "checker");
  if (!actor) return NO_PERSON;
  const id = Id.safeParse(claimId);
  if (!id.success) return { ok: false, error: zodIssuesToMessage(id.error.issues) };
  const item = Id.safeParse(itemId);
  if (!item.success) return { ok: false, error: "Receipt not found." };
  const claim = await readClaimRow(id.data, {});
  if (!claim.ok) return claim;
  const entered = await enterItemRateByHand({ row: claim.value, itemId: item.data, actor, rate: String(rate ?? "") });
  if (entered.ok) refresh(claimPaths(id.data));
  return entered;
}

/** Decline one receipt with the reason its owner reads, or restore it (`reason: null`). */
export async function declineItem(claimId: string, itemId: string, reason: string | null): Promise<Result> {
  const access = await requirePermission("reimbursements.check");
  const actor = deciderOf(access, "checker");
  if (!actor) return NO_PERSON;
  const id = Id.safeParse(claimId);
  if (!id.success) return { ok: false, error: zodIssuesToMessage(id.error.issues) };
  const item = Id.safeParse(itemId);
  if (!item.success) return { ok: false, error: "Receipt not found." };
  const why = Reason.nullable().safeParse(reason);
  if (!why.success) return { ok: false, error: zodIssuesToMessage(why.error.issues) };
  const claim = await readClaimRow(id.data, {});
  if (!claim.ok) return claim;
  const declined = await declineClaimItem({ row: claim.value, itemId: item.data, actor, reason: why.data });
  if (declined.ok) refresh(claimPaths(id.data));
  return declined;
}

/**
 * Reads one receipt again with the AI (RB.9): its red invoice when it has
 * one, else its newest receipt. On a claim being checked the reading and its
 * warnings change and the owner's fields never do (receipt-reading.ts). Any
 * claim, the checker's own included: a re-read decides nothing.
 */
export async function rereadReceipt(claimId: string, itemId: string): Promise<Result> {
  await requirePermission("reimbursements.check");
  const id = Id.safeParse(claimId);
  if (!id.success) return { ok: false, error: zodIssuesToMessage(id.error.issues) };
  const item = Id.safeParse(itemId);
  if (!item.success) return { ok: false, error: "Receipt not found." };
  const read = await rereadItem({ claimId: id.data, itemId: item.data });
  if (!read.ok) return read;
  refresh(claimPaths(id.data));
  return { ok: true };
}

/** A fresh one-minute link to a receipt or red invoice on a claim, after the caller's guard. */
async function openFile(claimId: string, fileId: string): Promise<Opened> {
  const id = Id.safeParse(claimId);
  const file = Id.safeParse(fileId);
  if (!id.success || !file.success) return { ok: false, error: "File not found." };
  return signClaimDocumentDownload({ claimId: id.data, fileId: file.data });
}

/** The checker opens a receipt or red invoice on a claim, signed when asked for. */
export async function openClaimFile(claimId: string, fileId: string): Promise<Opened> {
  await requirePermission("reimbursements.check");
  return openFile(claimId, fileId);
}

/**
 * Admin's claim page opens a receipt or red invoice behind its own permission,
 * reimbursements.view: every Admin viewer of a claim may read its documents,
 * whether or not they also check or approve it. A receipt carries no bank
 * detail; a payment's bank receipt is never opened from here.
 */
export async function openClaimFileInAdmin(claimId: string, fileId: string): Promise<Opened> {
  await requirePermission("reimbursements.view");
  return openFile(claimId, fileId);
}
