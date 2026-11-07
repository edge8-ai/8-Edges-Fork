// What the owner's status line reads beyond the claim row (plan section 3,
// RB.6, RB.7): the date of the run a claim is in or was paid in, the run an
// approved claim waits for, the payment that paid it and when a failed
// transfer last returned it. Split from my-claims.ts, which reads the claims
// themselves; every read here is a must-read, as there.
import { mustRows } from "@/kernel/data/read";
import { saigonToday } from "@/kernel/config/dates";
import { nextRunDate } from "./claim-rules";
import { selectReimbursementClaimEvents, selectReimbursementPaymentRuns, selectReimbursementPayments } from "./reads";

/**
 * The run an approved claim not yet in one will be paid in: the first run
 * after its approval; for a claim a failed transfer returned (decision 5),
 * the first run after the return, since the run it left never takes it back
 * (payment-runs.ts); and for one whose run was never built, the next from today.
 */
function upcomingRunOf(approvedAt: unknown, returnedAt: string | undefined): string | null {
  if (returnedAt) return nextRunDate(returnedAt);
  if (typeof approvedAt !== "string") return null;
  const due = nextRunDate(approvedAt);
  return due < saigonToday() ? nextRunDate(new Date().toISOString()) : due;
}

/** What the owner's line reads beyond the claim row: run dates, the payments that paid, and when a claim was last returned. */
export type LineFacts = { runDates: Map<string, string>; paid: Map<string, PaidPayment>; returnedAt: Map<string, string> };

/** The run date the owner's line names: the run the claim is in or was paid in, else the one it waits for. */
export function runDateFor(c: Record<string, unknown>, facts: LineFacts): string | null {
  if (typeof c.payment_run_id === "string") return facts.runDates.get(c.payment_run_id) ?? null;
  return c.status === "approved" ? upcomingRunOf(c.approved_at, facts.returnedAt.get(String(c.id))) : null;
}

/**
 * The date of the run each claim is in or was paid in (RB.6), for the owner's
 * line ("In the 15 Oct run", "Paid … on …"). One read for the claims given.
 */
export async function runDatesOf(claims: Record<string, unknown>[]): Promise<Map<string, string>> {
  const ids = [...new Set(claims.map((c) => c.payment_run_id).filter((id): id is string => typeof id === "string"))];
  if (ids.length === 0) return new Map();
  const runs = mustRows(await selectReimbursementPaymentRuns("id, run_date").in("id", ids), "[reimbursements] the runs of my claims");
  return new Map(runs.map((r) => [String(r.id), String(r.run_date)]));
}

type PaidPayment = { paidVnd: number | null; receiptFileId: string | null };

/**
 * The recorded payment that paid each paid claim (RB.7): the VND the bank
 * actually sent, which the line names rather than the approved total, and its
 * bank receipt. One transfer may cover several of the owner's claims.
 */
export async function paidPaymentsOf(claims: Record<string, unknown>[]): Promise<Map<string, PaidPayment>> {
  const ids = [...new Set(claims.filter((c) => c.status === "paid").map((c) => c.payment_id).filter((id): id is string => typeof id === "string"))];
  if (ids.length === 0) return new Map();
  const rows = mustRows(
    await selectReimbursementPayments("id, paid_vnd, bank_receipt_file_id").in("id", ids).eq("status", "paid"),
    "[reimbursements] the payments of my claims",
  );
  return new Map(
    rows.map((p) => [
      String(p.id),
      { paidVnd: p.paid_vnd === null || p.paid_vnd === undefined ? null : Number(p.paid_vnd), receiptFileId: typeof p.bank_receipt_file_id === "string" ? p.bank_receipt_file_id : null },
    ]),
  );
}

/** When each approved claim was last returned from a run by a failed transfer, if it ever was. */
async function lastReturnsOf(claims: Record<string, unknown>[]): Promise<Map<string, string>> {
  const ids = claims.filter((c) => c.status === "approved").map((c) => String(c.id));
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const rows = mustRows(
    await selectReimbursementClaimEvents("claim_id, created_at").in("claim_id", ids).eq("from_status", "in_run").eq("to_status", "approved").order("created_at", { ascending: false }),
    "[reimbursements] the returns of my claims",
  );
  for (const r of rows) if (!out.has(String(r.claim_id))) out.set(String(r.claim_id), String(r.created_at));
  return out;
}

export async function lineFactsOf(claims: Record<string, unknown>[]): Promise<LineFacts> {
  const [runDates, paid, returnedAt] = await Promise.all([runDatesOf(claims), paidPaymentsOf(claims), lastReturnsOf(claims)]);
  return { runDates, paid, returnedAt };
}

/** The VND the payment that paid the claim actually sent; null until it is paid. */
export const paidVndOf = (c: Record<string, unknown>, facts: LineFacts) => (typeof c.payment_id === "string" ? (facts.paid.get(c.payment_id)?.paidVnd ?? null) : null);
