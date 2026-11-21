"use server";

import { z } from "zod";
import { zodIssuesToMessage } from "@/kernel/config/schemas";
import type { Result } from "@/kernel/data/result";
import { requirePermission } from "@/kernel/identity/access-request";
import { Id, refresh } from "@/entities/reimbursements/lib/action-inputs";
import { cancelAdvanceUpload, confirmAdvanceUpload, signAdvanceFile, startAdvanceUpload } from "@/entities/reimbursements/lib/advance-files";
import { recordPayout, recordReturn } from "@/entities/reimbursements/lib/advance-ledger";
import { readAdvanceRow, type AdvanceRow } from "@/entities/reimbursements/lib/advance-lifecycle";
import { reinstateAdvance } from "@/entities/reimbursements/lib/advance-reinstate";
import { ownMoneyRefusal } from "@/entities/reimbursements/lib/advance-rules";
import { advancePayerOf, NO_PERSON_RECORD } from "@/entities/reimbursements/lib/deciders";
import { advancePaths } from "@/entities/reimbursements/lib/paths";

// Finance's actions on an advance (AD.7). Each asks for reimbursements.pay first, whose
// reach is every advance, then reads the advance unscoped. Whoever approved an advance may
// not record its transfer, and the ledger refuses that itself. Evidence is the owner's to
// add; the only file this surface can start is a bank receipt.

const NOT_FOUND = "Advance not found.";
const PERSON = { ok: false as const, error: NO_PERSON_RECORD };

async function rowOf(advanceId: string): Promise<AdvanceRow | null> {
  return Id.safeParse(advanceId).success ? readAdvanceRow(advanceId) : null;
}

const Transfer = z.object({
  // Zero reaches the ledger, which accepts it only to finish what is already recorded.
  amountVnd: z.number().int("Enter whole VND.").min(0, "Enter the VND that moved.").max(Number.MAX_SAFE_INTEGER),
  transferredOn: z.string().max(10),
  requestKey: z.string().uuid("Reload the page and try again."),
  receiptFileId: z.string().uuid("That bank receipt was not found.").nullable(),
});

/**
 * Records the transfer that pays an advance out, with the bank's receipt. A retry with the
 * same key records one transfer, and one finishing a transfer already on the ledger needs no
 * receipt: the ledger decides, so the receipt is only required here for a first recording.
 */
export async function payOutAdvance(advanceId: string, input: z.infer<typeof Transfer>): Promise<Result> {
  const access = await requirePermission("reimbursements.pay");
  if (!access.personId) return PERSON;
  const parsed = Transfer.safeParse(input);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const row = await rowOf(advanceId);
  if (!row) return { ok: false, error: NOT_FOUND };
  const result = await recordPayout({ row, ...parsed.data, actor: advancePayerOf(access) });
  if (result.ok) refresh(advancePaths(row.id));
  return result;
}

/** Records money that came back, whole or part, whether or not the person said they sent it: the bank is the truth. */
export async function recordAdvanceReturn(advanceId: string, input: z.infer<typeof Transfer>): Promise<Result> {
  const access = await requirePermission("reimbursements.pay");
  if (!access.personId) return PERSON;
  const parsed = Transfer.safeParse(input);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const row = await rowOf(advanceId);
  if (!row) return { ok: false, error: NOT_FOUND };
  const result = await recordReturn({ row, ...parsed.data, actor: advancePayerOf(access) });
  if (result.ok) refresh(advancePaths(row.id));
  return result;
}

const PutBack = z.string().trim().min(1, "Say what happened.").max(2000, "Keep it under 2,000 characters.");

/** Puts back an advance cancelled after the money had already gone, so its transfer can be recorded. */
export async function reinstateCancelledAdvance(advanceId: string, reason: string): Promise<Result> {
  const access = await requirePermission("reimbursements.pay");
  if (!access.personId) return PERSON;
  const parsed = PutBack.safeParse(reason);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const row = await rowOf(advanceId);
  if (!row) return { ok: false, error: NOT_FOUND };
  const result = await reinstateAdvance({ row, reason: parsed.data, actor: advancePayerOf(access) });
  if (result.ok) refresh(advancePaths(row.id));
  return result;
}

/** Begins an upload of the bank's receipt. The rules say when one may go on an advance. */
export async function startBankReceipt(advanceId: string, declared: { name: string; size: number; type: string }): Promise<{ ok: true; fileId: string; bucket: string; path: string; token: string } | { ok: false; error: string }> {
  const access = await requirePermission("reimbursements.pay");
  if (!access.personId) return PERSON;
  const row = await rowOf(advanceId);
  if (!row) return { ok: false, error: NOT_FOUND };
  const own = ownMoneyRefusal(row, { personId: access.personId });
  if (own) return { ok: false, error: own };
  return startAdvanceUpload({ advance: { id: row.id, status: row.status }, kind: "bank_receipt", personId: access.personId, declared: { name: String(declared.name), size: Number(declared.size), type: String(declared.type) } });
}

export async function confirmBankReceipt(advanceId: string, fileId: string): Promise<Result> {
  await requirePermission("reimbursements.pay");
  if (!Id.safeParse(advanceId).success || !Id.safeParse(fileId).success) return { ok: false, error: "File not found." };
  return confirmAdvanceUpload({ advanceId, fileId, onlyKind: "bank_receipt" });
}

export async function cancelBankReceipt(advanceId: string, fileId: string): Promise<Result> {
  await requirePermission("reimbursements.pay");
  if (!Id.safeParse(advanceId).success || !Id.safeParse(fileId).success) return { ok: false, error: "File not found." };
  return cancelAdvanceUpload({ advanceId, fileId, onlyKind: "bank_receipt" });
}

/** A fresh one-minute link to a file on the advance: the quote behind it, or a bank receipt. */
export async function openAdvanceFileToPay(advanceId: string, fileId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  await requirePermission("reimbursements.pay");
  if (!Id.safeParse(advanceId).success || !Id.safeParse(fileId).success) return { ok: false, error: "File not found." };
  return signAdvanceFile({ advanceId, fileId });
}
