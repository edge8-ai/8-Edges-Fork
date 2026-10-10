"use server";

import { z } from "zod";
import { requirePermission } from "@/kernel/identity/access-request";
import { zodIssuesToMessage } from "@/kernel/config/schemas";
import type { Result } from "@/kernel/data/result";
import { formatDate, formatVndWhole } from "@/kernel/ui/format";
import { buildPaymentRun } from "./payment-runs";
import { confirmBankReceiptUpload, recordPayment, returnPayment, signPaymentReceipt, startBankReceiptUpload } from "./payments";
import { actorLabel, payerOf } from "./deciders";
import { runPaths } from "./paths";
import type { BuildAnswerView } from "./run-rules";
import { Reason, refresh } from "./action-inputs";

// The payer's actions on payment runs (design §1.5), shared by the Team
// Finance run pages and their Admin mirrors: every one asks for
// reimbursements.pay first, whose reach is every run.

const RunDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.");
const PaymentId = z.string().uuid("Payment not found.");
const FileId = z.string().uuid("File not found.");
const Declared = z.object({ name: z.string().min(1).max(500), size: z.number().int().nonnegative(), type: z.string().max(200) });

/**
 * Build the run for a 1st or a 15th the cron missed (decision 6), or bring an
 * existing one up to date. The same idempotent function the cron calls, so
 * pressing it twice builds one run.
 */
export async function buildRunFor(runDate: string): Promise<BuildAnswerView> {
  const access = await requirePermission("reimbursements.pay");
  const date = RunDate.safeParse(runDate);
  if (!date.success) return { ok: false, error: "Pick a date." };
  const built = await buildPaymentRun(date.data, { by: actorLabel(access) });
  if (!built.ok) return built;
  if (!built.built) return { ok: true, built: false, message: built.reason, runId: null };
  refresh(runPaths(built.runId));
  const what = `${built.people} ${built.people === 1 ? "person" : "people"}, ${formatVndWhole(built.totalVnd)}`;
  const message =
    built.entered > 0
      ? `The run for ${formatDate(built.runDate)} is built: ${what}.`
      : `The run for ${formatDate(built.runDate)} was already built (${what}); nothing new was approved before its cut-off.`;
  return { ok: true, built: true, message, runId: built.runId };
}

/** Begins the upload of one person's bank receipt (RB.7): an unconfirmed row and a signed token. */
export async function startBankReceipt(paymentId: string, declared: { name: string; size: number; type: string }) {
  const access = await requirePermission("reimbursements.pay");
  const id = PaymentId.safeParse(paymentId);
  if (!id.success) return { ok: false as const, error: "Payment not found." };
  const file = Declared.safeParse(declared);
  if (!file.success) return { ok: false as const, error: zodIssuesToMessage(file.error.issues) };
  return startBankReceiptUpload({ paymentId: id.data, uploaderPersonId: access.personId, declared: file.data });
}

/** Confirms a bank receipt once the server has looked at what arrived. */
export async function confirmBankReceipt(paymentId: string, fileId: string) {
  await requirePermission("reimbursements.pay");
  const id = PaymentId.safeParse(paymentId);
  const file = FileId.safeParse(fileId);
  if (!id.success || !file.success) return { ok: false as const, error: "File not found." };
  return confirmBankReceiptUpload({ paymentId: id.data, fileId: file.data });
}

/** Records one payment as paid with its bank receipt and the VND actually sent (decision 4). */
export async function recordPaid(paymentId: string, paidVnd: number, receiptFileId: string): Promise<Result> {
  const access = await requirePermission("reimbursements.pay");
  const id = PaymentId.safeParse(paymentId);
  const file = FileId.safeParse(receiptFileId);
  if (!id.success) return { ok: false, error: "Payment not found." };
  if (!file.success) return { ok: false, error: "Upload this person's bank receipt first: a payment is recorded with its receipt." };
  const recorded = await recordPayment({ paymentId: id.data, paidVnd: Number(paidVnd), receiptFileId: file.data, actor: payerOf(access) });
  // A payment that landed but left its run unsettled still changed the page.
  refresh(runPaths());
  return recorded;
}

/** Returns a payment whose transfer failed to approved, for the next run, with the reason the person is told (decision 5). */
export async function returnToApproved(paymentId: string, reason: string): Promise<Result> {
  const access = await requirePermission("reimbursements.pay");
  const id = PaymentId.safeParse(paymentId);
  if (!id.success) return { ok: false, error: "Payment not found." };
  const why = Reason.safeParse(String(reason ?? ""));
  if (!why.success) return { ok: false, error: zodIssuesToMessage(why.error.issues) };
  const returned = await returnPayment({ paymentId: id.data, reason: why.data, actor: payerOf(access) });
  // As with a recorded payment: one that landed but left its run unsettled still changed the page.
  refresh(runPaths());
  return returned;
}

/** A fresh one-minute link to the bank receipt a payment was recorded with. */
export async function openPaymentReceipt(paymentId: string, fileId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  await requirePermission("reimbursements.pay");
  const id = PaymentId.safeParse(paymentId);
  const file = FileId.safeParse(fileId);
  if (!id.success || !file.success) return { ok: false, error: "File not found." };
  return signPaymentReceipt(id.data, file.data);
}
