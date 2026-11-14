// Recording payments (design §2.4, RB.7): Finance pays each person in the bank
// by hand, one transfer per person, then records that payment here with the
// bank's receipt and the VND actually sent. One payment at a time (decision
// 4): "Mark selected paid" on the run page is a sequence of these, asking for
// each person's receipt in turn. No receipt, no Paid — the database's shape
// check on reimbursement_payments refuses a paid row without one as well.
//
// A transfer that failed (a wrong account, a bounce) is returned instead
// (decision 5): its claims go back to approved for the next run, with the
// reason on their history, and the owner is emailed to check their bank
// details. The payment stays on the run with no claims, as the record that it
// was tried.
//
// The bank receipt is a file of kind bank_receipt on the payment, taken through
// the document store's steps (document-store.ts) like a claim's receipts. The
// database never lets a bank receipt be deleted, so its records state no way to
// drop a row: an upload refused at confirm loses its object and keeps an
// unconfirmed row nobody is shown; the receipt-sweep cron never touches one (it
// reads none).
//
// Not a "use server" file: every caller is an action whose first statement is
// its guard (reimbursements.pay, or reimbursements.mine for the owner's own
// download).
import { recordAudit } from "@/kernel/audit/audit";
import type { Result } from "@/kernel/data/result";
import { mustRows, ReadFailure } from "@/kernel/data/read";
import { confirmUpload, openDocument, startUpload, type DocumentRecords } from "./document-store";
import { claimWriterFor, transitionClaim, type ClaimActor } from "./claim-lifecycle";
import { CLAIM_ROW_COLUMNS, claimRowFrom } from "./own-claims";
import { maskedSnapshot, readPayeeBank } from "./bank-details";
import { announce } from "./claim-events";
import { tellAccountingOfRunPaid, tellOwnerOfPayment, tellOwnerOfReturn } from "./notices";
import { selectReimbursementClaims, selectReimbursementFiles, selectReimbursementPayments } from "./reads";
import { runTotalsOf } from "./run-rules";
import { insertReimbursementFiles, updateReimbursementFiles, updateReimbursementPaymentRuns, updateReimbursementPayments } from "./writes";

type Refused = { ok: false; error: string };

const CHANGED = "This payment changed while you were working on it. Reload and try again.";
/** A bank receipt is the bank's PDF or a screenshot of the transfer, so its refusals say so. */
const BANK_WORDING = { use: "the bank's PDF or a screenshot (JPG, PNG, WebP or HEIC)", isNot: "PDF or image" };

/** Where a payment keeps its bank receipts' rows. None is ever deleted, so there is no way to drop one. */
const recordsOf = (paymentId: string): DocumentRecords => ({
  countUnfinished: (since) =>
    selectReimbursementFiles("id", { count: "exact", head: true }).eq("payment_id", paymentId).eq("kind", "bank_receipt").is("confirmed_at", null).gte("created_at", since),
  saveConfirmed: (id, facts) => updateReimbursementFiles(facts).eq("id", id).is("confirmed_at", null).select("id"),
});

/** A payment as recording it reads it. */
type PaymentRow = { id: string; runId: string; personId: string; status: "to_pay" | "paid"; amountVnd: number };

async function readPayment(paymentId: string): Promise<{ ok: true; value: PaymentRow } | Refused> {
  const { data, error } = await selectReimbursementPayments("id, run_id, person_id, status, amount_vnd").eq("id", paymentId).maybeSingle();
  if (error) return { ok: false, error: `Could not read the payment: ${error.message}` };
  if (!data) return { ok: false, error: "Payment not found." };
  return {
    ok: true,
    value: { id: String(data.id), runId: String(data.run_id), personId: String(data.person_id), status: data.status === "paid" ? "paid" : "to_pay", amountVnd: Number(data.amount_vnd ?? 0) },
  };
}

/** The claims a payment still pays: in the run and linked to it. */
async function claimsOf(paymentId: string) {
  const { data, error } = await selectReimbursementClaims(CLAIM_ROW_COLUMNS).eq("payment_id", paymentId).eq("status", "in_run");
  if (error) return { ok: false as const, error: `Could not read the payment's claims: ${error.message}` };
  return { ok: true as const, claims: (data ?? []).map(claimRowFrom) };
}

/** Begins a bank receipt's upload for one payment still to pay: an unconfirmed row and a signed token. */
export async function startBankReceiptUpload(input: {
  paymentId: string;
  uploaderPersonId: string | null;
  declared: { name: string; size: number; type: string };
}): Promise<{ ok: true; fileId: string; bucket: string; path: string; token: string } | Refused> {
  const payment = await readPayment(input.paymentId);
  if (!payment.ok) return payment;
  if (payment.value.status === "paid") return { ok: false, error: "This payment is already recorded as paid." };
  const { id: paymentId, runId } = payment.value;
  return startUpload({
    records: recordsOf(paymentId),
    insert: (file) =>
      insertReimbursementFiles({
        id: file.id,
        kind: "bank_receipt",
        payment_id: paymentId,
        storage_path: file.path,
        filename: file.filename,
        mime_type: input.declared.type,
        size_bytes: input.declared.size,
        uploaded_by: input.uploaderPersonId,
      }),
    folder: `payment/${runId}/${paymentId}`,
    holder: "payment",
    declared: input.declared,
    wording: BANK_WORDING,
  });
}

/** Looks at what arrived for a payment's bank receipt and confirms it, or refuses it and removes its object. */
export async function confirmBankReceiptUpload(input: { paymentId: string; fileId: string }): Promise<{ ok: true; filename: string } | Refused> {
  const { data: file, error } = await selectReimbursementFiles("id, storage_path, filename, confirmed_at")
    .eq("id", input.fileId)
    .eq("payment_id", input.paymentId)
    .eq("kind", "bank_receipt")
    .maybeSingle();
  if (error) return { ok: false, error: `Could not read the file: ${error.message}` };
  if (!file) return { ok: false, error: "File not found." };
  const name = String(file.filename);
  if (file.confirmed_at) return { ok: true, filename: name };
  const confirmed = await confirmUpload({ records: recordsOf(input.paymentId), file: { id: String(file.id), path: String(file.storage_path), filename: name }, wording: BANK_WORDING });
  return confirmed.ok ? { ok: true, filename: name } : confirmed;
}

/**
 * Records one payment as paid (decision 4): the bank receipt it was made with,
 * the VND actually sent and a masked record of the account, then each of its
 * claims moves to paid through the lifecycle module. Recording it twice is
 * refused, as every decision repeated is. When it was the run's last payment,
 * the run is marked paid and accounting@ gets its one email.
 */
export async function recordPayment(input: { paymentId: string; paidVnd: number; receiptFileId: string | null; actor: ClaimActor }): Promise<Result> {
  const { actor } = input;
  if (actor.kind !== "payer") return { ok: false, error: "Only the payer can record a payment." };
  if (!Number.isSafeInteger(input.paidVnd) || input.paidVnd <= 0) return { ok: false, error: "Enter the VND actually sent, in whole dong." };
  const read = await readPayment(input.paymentId);
  if (!read.ok) return read;
  const payment = read.value;
  if (payment.status === "paid") return { ok: false, error: "This payment is already recorded as paid." };
  const claims = await claimsOf(payment.id);
  if (!claims.ok) return claims;
  if (claims.claims.length === 0) return { ok: false, error: "This payment has no claims left to pay: it was returned to approved." };

  // The bank receipt is optional (Dave, 2026-10-28: the payer clicks Pay when
  // he has paid). One that is given must be this payment's confirmed upload.
  let receiptId: string | null = null;
  if (input.receiptFileId) {
    const { data: receipt, error: receiptError } = await selectReimbursementFiles("id")
      .eq("id", input.receiptFileId)
      .eq("payment_id", payment.id)
      .eq("kind", "bank_receipt")
      .not("confirmed_at", "is", null)
      .maybeSingle();
    if (receiptError) return { ok: false, error: `Could not read the bank receipt: ${receiptError.message}` };
    if (!receipt) return { ok: false, error: "That bank receipt did not finish uploading. Upload it again, or pay without it." };
    receiptId = String(receipt.id);
  }

  // The account the money went to, kept masked: the bank and the last four digits.
  const bank = await readPayeeBank({ personId: payment.personId, runId: payment.runId, actor: actor.label ?? null });
  if (!bank.ok) return bank;
  const now = new Date().toISOString();
  const { data: landed, error } = await updateReimbursementPayments({
    status: "paid",
    paid_vnd: input.paidVnd,
    paid_at: now,
    paid_by: actor.personId,
    bank_receipt_file_id: receiptId,
    ...maskedSnapshot(bank.bank),
  })
    .eq("id", payment.id)
    .eq("status", "to_pay")
    .select("id");
  if (error) return { ok: false, error: `Could not record the payment: ${error.message}` };
  if (!landed?.length) return { ok: false, error: CHANGED };
  await recordAudit({
    table: "reimbursement_payments",
    recordId: payment.id,
    operation: "update",
    actor: actor.label ?? null,
    oldData: { status: "to_pay" },
    newData: { status: "paid", paidVnd: input.paidVnd, bankReceiptFileId: receiptId },
    context: { runId: payment.runId, amountVnd: payment.amountVnd },
  });

  // The payment has landed; each claim follows it. A claim that cannot move
  // is logged and left in the run, where the page still shows it, rather than
  // answered as a failed payment the payer would record a second time.
  const paid: { id: string; title: string }[] = [];
  for (const row of claims.claims) {
    const moved = await transitionClaim({ row, move: "pay", actor, write: claimWriterFor(row.id, {}), paymentId: payment.id });
    if (moved.ok) paid.push({ id: row.id, title: row.title });
    else console.error("[reimbursements] a paid payment's claim did not move to paid", payment.id, row.id, moved.error);
  }
  await tellOwnerOfPayment({ paymentId: payment.id, personId: payment.personId, paidVnd: input.paidVnd, claims: paid, hasReceipt: receiptId !== null });
  return settleRun(payment.runId, actor, { recount: false, done: "The payment is recorded" });
}

/**
 * Returns a payment whose transfer failed (decision 5): each of its claims goes
 * back to approved with the reason on its history, for the next run; the
 * payment keeps no claims and no amount; the run's totals are recomputed; and
 * the owner is emailed to check their bank details.
 */
export async function returnPayment(input: { paymentId: string; reason: string; actor: ClaimActor }): Promise<Result> {
  const { actor } = input;
  const reason = input.reason.trim();
  if (!reason) return { ok: false, error: "Give a reason: it is what the person is told." };
  const read = await readPayment(input.paymentId);
  if (!read.ok) return read;
  const payment = read.value;
  if (payment.status === "paid") return { ok: false, error: "This payment is already recorded as paid, so it cannot be returned." };
  const claims = await claimsOf(payment.id);
  if (!claims.ok) return claims;
  if (claims.claims.length === 0) return { ok: false, error: "This payment was already returned." };

  const returned: { id: string; title: string }[] = [];
  for (const row of claims.claims) {
    // The run goes on the history row too: the run builder reads it so the claim never re-enters this run.
    const moved = await transitionClaim({ row, move: "return_to_approved", actor, write: claimWriterFor(row.id, {}), reason, runId: payment.runId, paymentId: payment.id });
    if (!moved.ok) return returned.length === 0 ? moved : { ok: false, error: `Some claims were returned; one was not: ${moved.error}` };
    returned.push({ id: row.id, title: row.title });
  }
  const { error } = await updateReimbursementPayments({ amount_vnd: 0 }).eq("id", payment.id).eq("status", "to_pay");
  if (error) console.error("[reimbursements] a returned payment kept its amount", payment.id, error.message);
  await recordAudit({
    table: "reimbursement_payments",
    recordId: payment.id,
    operation: "update",
    actor: actor.label ?? null,
    oldData: { amountVnd: payment.amountVnd },
    newData: { returned: true, amountVnd: 0 },
    context: { runId: payment.runId, reason, claimIds: returned.map((c) => c.id) },
  });
  await tellOwnerOfReturn({ paymentId: payment.id, personId: payment.personId, reason, claims: returned });
  return settleRun(payment.runId, actor, { recount: true, done: "The payment is returned" });
}

/**
 * Brings the run up to date after a payment landed or was returned: its counts
 * recomputed (a return changes them), and the run marked paid when it now is.
 * The payment has already landed, so a failure here is answered rather than
 * logged and dropped: the payer hears that the run did not follow, instead of
 * an ok that leaves a fully paid run open with nobody the wiser.
 */
async function settleRun(runId: string, actor: ClaimActor, opts: { recount: boolean; done: string }): Promise<Result> {
  try {
    if (opts.recount) await recountRun(runId);
    await finishRunIfPaid(runId, actor);
    return { ok: true };
  } catch (err) {
    const why = err instanceof ReadFailure ? err.reason : err instanceof Error ? err.message : String(err);
    console.error("[reimbursements] a payment landed but its run was not brought up to date", runId, why);
    return { ok: false, error: `${opts.done}, but the run could not be brought up to date: ${why}. Reload the run; if every payment shows paid and the run is still open, tell an admin.` };
  }
}

/** Brings a run's counts and total back in line with the claims it still holds. Throws when it cannot. */
async function recountRun(runId: string): Promise<void> {
  const claims = mustRows(await selectReimbursementClaims("person_id, approved_total_vnd").eq("payment_run_id", runId), "[reimbursements] the run's claims, to recount it");
  const totals = runTotalsOf(claims.map((c) => ({ personId: String(c.person_id), approvedTotalVnd: Number(c.approved_total_vnd ?? 0) })));
  const saved = await updateReimbursementPaymentRuns(totals).eq("id", runId);
  if (saved.error) throw new Error(`saving the run's totals: ${saved.error.message}`);
}

/**
 * Marks the run paid once none of its claims waits in it any more and at least
 * one payment went out, guarded on it still being open, so the accounting@
 * email and the catalogue fact go once. Throws when it cannot tell.
 */
async function finishRunIfPaid(runId: string, actor: ClaimActor): Promise<void> {
  const waiting = mustRows(await selectReimbursementClaims("id").eq("payment_run_id", runId).eq("status", "in_run"), "[reimbursements] the run's waiting claims");
  const payments = mustRows(await selectReimbursementPayments("id, amount_vnd, paid_vnd").eq("run_id", runId).eq("status", "paid"), "[reimbursements] the run's paid payments");
  if (waiting.length > 0 || payments.length === 0) return;
  const { data: landed, error } = await updateReimbursementPaymentRuns({ status: "paid", paid_at: new Date().toISOString() }).eq("id", runId).eq("status", "open").select("id, run_date");
  if (error) throw new Error(`marking the run paid: ${error.message}`);
  const row = landed?.[0];
  if (!row) return;
  const totalVnd = payments.reduce((sum, p) => sum + Number(p.paid_vnd ?? p.amount_vnd ?? 0), 0);
  const runDate = String(row.run_date);
  await tellAccountingOfRunPaid({ runId, runDate, people: payments.length, totalVnd });
  await announce("payment-run.paid", { runId, runDate, people: payments.length, totalVnd, actorPersonId: actor.personId });
}

/**
 * A one-minute link to the bank receipt a payment was recorded with, for the
 * payer. `fileId`, when the page names one, must be that receipt.
 */
export async function signPaymentReceipt(paymentId: string, fileId?: string): Promise<{ ok: true; url: string } | Refused> {
  const { data, error } = await selectReimbursementPayments("bank_receipt_file_id").eq("id", paymentId).maybeSingle();
  if (error) return { ok: false, error: `Could not read the payment: ${error.message}` };
  const receiptId = data?.bank_receipt_file_id;
  if (typeof receiptId !== "string") return { ok: false, error: "This payment has no bank receipt yet." };
  if (fileId && fileId !== receiptId) return { ok: false, error: "File not found." };
  return openDocument({ receiptId }, bankReceiptFor);
}

/**
 * A one-minute link to the bank receipt that paid one of the owner's claims
 * (decision 7: the Paid email links here, never attaches it). Read through
 * the claim, filtered to the owner in the query, so another person's receipt
 * is "not found".
 */
export async function signOwnBankReceipt(input: { claimId: string; personId: string; fileId?: string }): Promise<{ ok: true; url: string } | Refused> {
  const { data, error } = await selectReimbursementClaims("payment_id").eq("id", input.claimId).eq("person_id", input.personId).eq("status", "paid").maybeSingle();
  if (error) return { ok: false, error: `Could not read the claim: ${error.message}` };
  if (typeof data?.payment_id !== "string") return { ok: false, error: "This claim has no bank receipt yet." };
  return signPaymentReceipt(data.payment_id, input.fileId);
}

/**
 * The rule for opening a bank receipt: the reader holds the receipt a payment was recorded
 * with (the payer's, or the owner's through their paid claim), and only that confirmed
 * receipt opens, as a download under its own name.
 */
async function bankReceiptFor(reader: { receiptId: string }) {
  const { data, error } = await selectReimbursementFiles("storage_path, filename").eq("id", reader.receiptId).eq("kind", "bank_receipt").not("confirmed_at", "is", null).maybeSingle();
  if (error) return { ok: false as const, error: `Could not read the file: ${error.message}` };
  if (!data) return { ok: false as const, error: "File not found." };
  return { ok: true as const, file: { path: String(data.storage_path), filename: String(data.filename) }, asDownload: true };
}
