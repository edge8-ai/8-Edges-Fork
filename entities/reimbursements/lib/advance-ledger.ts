// The advance's ledger (AD.4, design section 5): the only writer of
// reimbursement_advance_transfers. Every transfer is one row, and the row goes first
// and the status second, because the app has no transaction and the database refuses
// a paid_out advance with nothing on its ledger.
//
// That order makes a failure retryable. A transfer that landed with its status write
// lost leaves the advance where it was, and pressing the button again finds the row
// and lands the status. The form sends its own request_key, so a double click records
// one transfer. A retry can meet the insert guard before the unique check, so P0R02 is
// answered by looking the key up first: a retry that already landed is never shown as
// a failure.
//
// Authorization stays with the caller (ADR 0007): the action's guard is
// reimbursements.pay.
import { holidayCalendar } from "@/entities/time-off";
import { recordAudit } from "@/kernel/audit/audit";
import { businessDate, saigonToday } from "@/kernel/config/dates";
import { formatDate } from "@/kernel/ui/format";
import type { Result } from "@/kernel/data/result";
import type { Json } from "@/kernel/data/supabase/database.types";
import { advanceWriterFor, transitionAdvance, type AdvanceActor, type AdvanceRow } from "./advance-lifecycle";
import { payoutRefusalFor } from "./advance-payers";
import { ownMoneyRefusal } from "./advance-rules";
import { tellPayersOfReportedReturn } from "./advance-notices";
import { maskedSnapshot, readAdvancePayeeBank } from "./bank-details";
import { selectReimbursementAdvanceFiles, selectReimbursementAdvances, selectReimbursementAdvanceTransfers } from "./reads";
import { outstandingOf } from "./settlement-rules";
import { settleByOf } from "./working-days";
import { insertReimbursementAdvanceTransfers, updateReimbursementAdvances } from "./writes";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

type TransferRow = { direction: "out" | "in"; amount_vnd: number; transferred_on: string; request_key: string; bank_receipt_file_id: string | null };

async function transfersOf(advanceId: string): Promise<{ ok: true; rows: TransferRow[] } | { ok: false; error: string }> {
  const { data, error } = await selectReimbursementAdvanceTransfers("direction, amount_vnd, transferred_on, request_key, bank_receipt_file_id").eq("advance_id", advanceId);
  if (error) return { ok: false, error: `Could not read the transfers: ${error.message}` };
  return { ok: true, rows: (data ?? []).map((r) => ({ direction: r.direction as "out" | "in", amount_vnd: Number(r.amount_vnd), transferred_on: String(r.transferred_on), request_key: String(r.request_key), bank_receipt_file_id: (r.bank_receipt_file_id as string | null) ?? null })) };
}

const returnedOf = (rows: TransferRow[]) => rows.filter((r) => r.direction === "in").reduce((sum, r) => sum + r.amount_vnd, 0);

/**
 * A transfer's date. The ledger is append-only, so a typo cannot be corrected afterwards, and an
 * early date would carry a wrong balance through account 141's months. `notBefore` is the earliest
 * the money can have moved, and a date with no shape to compare is left to the checks above it.
 */
function dateRefusal(on: string, notBefore: { date: string | null | undefined; what: string }): string | null {
  if (!DATE.test(on)) return "Give the date the bank shows for the transfer.";
  if (on > saigonToday()) return "The transfer's date cannot be in the future.";
  if (!notBefore.date || !DATE.test(notBefore.date.slice(0, 10))) return null;
  const earliest = businessDate(notBefore.date);
  return on < earliest ? `The transfer's date cannot be before ${notBefore.what}, ${formatDate(earliest)}.` : null;
}

/** That this advance's own finished bank receipt is what is being cited, in words the person can act on. */
async function receiptRefusal(advanceId: string, fileId: string): Promise<string | null> {
  const { data, error } = await selectReimbursementAdvanceFiles("id")
    .eq("id", fileId)
    .eq("advance_id", advanceId)
    .eq("kind", "bank_receipt")
    .not("confirmed_at", "is", null)
    .maybeSingle();
  if (error) return `Could not read the bank receipt: ${error.message}`;
  return data ? null : "That bank receipt did not finish uploading. Upload it again.";
}

/** The deadline a transfer on this date sets, or why it cannot be worked out. A calendar that cannot answer stops a payout rather than letting it through with a wrong date. */
async function deadlineOf(row: AdvanceRow, transferredOn: string): Promise<{ ok: true; settleBy: string } | { ok: false; error: string }> {
  try {
    const start = row.spendEndsOn > transferredOn ? row.spendEndsOn : transferredOn;
    const year = Number(start.slice(0, 4));
    return settleByOf({ spendEndsOn: row.spendEndsOn, paidOutOn: transferredOn }, await holidayCalendar(`${year}-01-01`, `${year + 1}-12-31`));
  } catch (err) {
    return { ok: false, error: `Could not read the holiday calendar, so the deadline cannot be worked out: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Records the transfer that pays an advance out, then moves it to paid_out with its
 * deadline. The deadline is worked out first, so a calendar that cannot answer stops the
 * payout before anything is written.
 *
 * A transfer already on the ledger is a status write that was lost, or someone else's that
 * won. Either way that row is the truth, so its date sets the deadline and nothing the
 * retry sends counts: a retry on a later day must not move a person's deadline, and it
 * needs no second receipt.
 */
export async function recordPayout(input: {
  row: AdvanceRow;
  amountVnd: number;
  transferredOn: string;
  requestKey: string;
  receiptFileId: string | null;
  actor: AdvanceActor;
}): Promise<Result> {
  const { row, actor } = input;
  if (actor.kind !== "payer" || actor.personId === null) return { ok: false, error: "Only Finance can record the transfer." };
  const existing = await transfersOf(row.id);
  if (!existing.ok) return existing;
  const out = existing.rows.find((r) => r.direction === "out");

  // A retry that already landed answers ok. The same key on an advance past
  // approved is that retry; a different key is someone recording it twice.
  if (row.status !== "approved") {
    if (out?.request_key === input.requestKey) return { ok: true };
    return { ok: false, error: row.status === "paid_out" ? "This transfer is already recorded." : "Only an approved advance can be paid out." };
  }
  const refused = await payoutRefusalFor(row, actor);
  if (refused) return { ok: false, error: refused };

  // Lands the status on what the ledger holds.
  const land = async (transferredOn: string): Promise<Result> => {
    const deadline = await deadlineOf(row, transferredOn);
    if (!deadline.ok) return deadline;
    return transitionAdvance({
      row,
      move: "pay_out",
      actor,
      write: advanceWriterFor(row.id, {}),
      facts: { settleBy: deadline.settleBy, metadata: { amountVnd: row.amountVnd, transferredOn } },
    });
  };

  if (out) return land(out.transferred_on);

  const dateProblem = dateRefusal(input.transferredOn, { date: row.submittedAt, what: "the day it was asked for" });
  if (dateProblem) return { ok: false, error: dateProblem };
  const deadline = await deadlineOf(row, input.transferredOn);
  if (!deadline.ok) return deadline;
  if (input.amountVnd !== row.amountVnd) {
    return { ok: false, error: `This advance was approved for ₫${row.amountVnd.toLocaleString("en-US")}, so that is what must be sent.` };
  }
  if (!input.receiptFileId) return { ok: false, error: "Upload the bank's receipt first." };
  const receiptProblem = await receiptRefusal(row.id, input.receiptFileId);
  if (receiptProblem) return { ok: false, error: receiptProblem };
  const bank = await readAdvancePayeeBank({ personId: row.personId, advanceId: row.id, actor: actor.label ?? null, purpose: "advance_snapshot" });
  if (!bank.ok) return bank;
  // The snapshot is the only record of where the money went, so a payout with nowhere on file is refused rather than kept as a blank.
  if (!bank.bank) return { ok: false, error: "This person has no bank details on file. Ask them to add them before you record a transfer." };
  const { error } = await insertReimbursementAdvanceTransfers({
    advance_id: row.id,
    direction: "out",
    amount_vnd: input.amountVnd,
    transferred_on: input.transferredOn,
    request_key: input.requestKey,
    recorded_by: actor.personId,
    bank_receipt_file_id: input.receiptFileId,
    ...maskedSnapshot(bank.bank),
  });
  if (error) {
    // Two people at once: the other's row stands, so the status is all that is left.
    const again = await transfersOf(row.id);
    const theirs = again.ok ? again.rows.find((r) => r.direction === "out") : undefined;
    return theirs ? land(theirs.transferred_on) : { ok: false, error: "This transfer could not be recorded. Reload and try again." };
  }
  await recordAudit({
    table: "reimbursement_advance_transfers",
    recordId: row.id,
    operation: "insert",
    actor: actor.label ?? null,
    newData: { direction: "out", amountVnd: input.amountVnd, transferredOn: input.transferredOn },
  });
  return land(input.transferredOn);
}

/**
 * Records money coming back, whole or in part, whether or not the person said they
 * sent it: the bank is the truth. The advance settles when the returns add up to
 * what was owed. A status write lost after the last return is landed by the next call.
 */
export async function recordReturn(input: {
  row: AdvanceRow;
  amountVnd: number;
  transferredOn: string;
  requestKey: string;
  receiptFileId?: string | null;
  actor: AdvanceActor;
}): Promise<Result> {
  const { row, actor } = input;
  if (actor.kind !== "payer" || actor.personId === null) return { ok: false, error: "Only Finance can record money coming back." };
  const own = ownMoneyRefusal(row, actor);
  if (own) return { ok: false, error: own };
  const existing = await transfersOf(row.id);
  if (!existing.ok) return existing;
  const already = existing.rows.some((r) => r.direction === "in" && r.request_key === input.requestKey);

  if (row.status !== "to_return") {
    return already ? { ok: true } : { ok: false, error: "Nothing is owed back on this advance." };
  }
  if (row.balanceVnd === null || row.balanceVnd >= 0) return { ok: false, error: "Nothing is owed back on this advance." };

  const move = (outstandingAfterVnd: number, amountVnd: number) =>
    transitionAdvance({
      row,
      move: "confirm_return",
      actor,
      write: advanceWriterFor(row.id, {}),
      facts: { outstandingAfterVnd, metadata: { amountVnd, transferredOn: input.transferredOn } },
    });

  const balanceVnd = row.balanceVnd;
  // What is left to do once the row is there. Money still owed leaves the status where
  // it is, so a retry adds no second history row and no second email. Nothing owed
  // lands the settlement, which also finishes one whose status write was lost.
  const finish = (rows: TransferRow[]): Promise<Result> | Result => {
    const left = outstandingOf(balanceVnd, returnedOf(rows));
    return left > 0 ? { ok: true } : move(0, input.amountVnd);
  };

  const owed = outstandingOf(balanceVnd, returnedOf(existing.rows));
  if (already || owed === 0) return finish(existing.rows);

  if (!Number.isSafeInteger(input.amountVnd) || input.amountVnd < 1) return { ok: false, error: "Enter the VND that arrived." };
  if (input.amountVnd > owed) return { ok: false, error: `₫${owed.toLocaleString("en-US")} is still owed, so ₫${input.amountVnd.toLocaleString("en-US")} cannot be recorded.` };
  const dateProblem = dateRefusal(input.transferredOn, { date: existing.rows.find((r) => r.direction === "out")?.transferred_on, what: "the payout" });
  if (dateProblem) return { ok: false, error: dateProblem };
  if (input.receiptFileId) {
    // One receipt is one transfer. The database only keeps it on the same advance, so
    // this is what stops the payout's receipt standing as proof of a return.
    if (existing.rows.some((r) => r.bank_receipt_file_id === input.receiptFileId)) return { ok: false, error: "That bank receipt is already on another transfer. Upload the one for this return." };
    const receiptProblem = await receiptRefusal(row.id, input.receiptFileId);
    if (receiptProblem) return { ok: false, error: receiptProblem };
  }

  const { error } = await insertReimbursementAdvanceTransfers({
    advance_id: row.id,
    direction: "in",
    amount_vnd: input.amountVnd,
    transferred_on: input.transferredOn,
    request_key: input.requestKey,
    recorded_by: actor.personId,
    ...(input.receiptFileId ? { bank_receipt_file_id: input.receiptFileId } : {}),
  });
  if (error) {
    // A second click or a second person. Read what is true now, and only a row with
    // this key counts as this return having landed.
    const again = await transfersOf(row.id);
    if (again.ok && again.rows.some((r) => r.direction === "in" && r.request_key === input.requestKey)) return finish(again.rows);
    return { ok: false, error: (error as { code?: string }).code === "P0R02" ? "Someone else recorded a return just now. Reload and check what is still owed." : `Could not record the return: ${error.message}` };
  }
  await recordAudit({
    table: "reimbursement_advance_transfers",
    recordId: row.id,
    operation: "insert",
    actor: actor.label ?? null,
    newData: { direction: "in", amountVnd: input.amountVnd, transferredOn: input.transferredOn },
  });
  return move(owed - input.amountVnd, input.amountVnd);
}

/**
 * The owner says they sent the money. It is a hint for Finance, never a record: the
 * ledger moves only on what the bank shows, so this stamps the advance and tells them.
 */
export async function reportReturnSent(input: { row: AdvanceRow; actor: AdvanceActor }): Promise<Result> {
  const { row, actor } = input;
  if (actor.personId !== row.personId) return { ok: false, error: "Advance not found." };
  if (row.status !== "to_return") return { ok: false, error: "Nothing is owed back on this advance." };
  const { data: current, error: readError } = await selectReimbursementAdvances("metadata").eq("id", row.id).maybeSingle();
  if (readError) return { ok: false, error: `Could not read the advance: ${readError.message}` };
  const transfers = await transfersOf(row.id);
  if (!transfers.ok) return transfers;
  // What had arrived when they said it: `returnStillReported` lets the next transfer answer this.
  const metadata = { ...((current?.metadata as Record<string, Json> | null) ?? {}), returnReportedAt: new Date().toISOString(), returnReportedAtVnd: returnedOf(transfers.rows) };
  const { data, error } = await updateReimbursementAdvances({ metadata }).eq("id", row.id).eq("person_id", row.personId).eq("status", "to_return").select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "This advance changed while you were working on it. Reload and try again." };
  await tellPayersOfReportedReturn({ advanceId: row.id, refNo: row.refNo, ownerPersonId: row.personId, purpose: row.purpose, amountVnd: row.amountVnd, eventId: null });
  return { ok: true };
}
