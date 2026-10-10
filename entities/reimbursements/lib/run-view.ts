// What the payment-run pages read (plan section 8, design §1.5): the runs, and
// one run with its payments — who, which claims and when they were asked
// for, the amount, and where each payment stands. The pages' guard is
// reimbursements.pay, whose reach is every run, so nothing here is narrowed
// to a person. No bank detail is read here: the run page asks bank-details.ts
// for its people's, which audits the read (§1.11). Every read is a must-read:
// a failed read is an error page, never an empty run that says nobody is owed.
import { mustRows } from "@/kernel/data/read";
import { NAME_ONLY_COLUMNS, personName } from "@/kernel/config/people-name";
import { selectReimbursementClaimEvents, selectReimbursementClaims, selectReimbursementPaymentRuns, selectReimbursementPayments } from "./reads";
import type { ClaimStatus } from "./claim-rules";

export type RunSummary = {
  id: string;
  runDate: string;
  status: "open" | "paid";
  claims: number;
  people: number;
  totalVnd: number;
  builtAt: string;
  paidAt: string | null;
};

/**
 * Where one person's payment stands. "returned" is a payment whose transfer
 * failed: its claims went back to approved for the next run (decision 5), so
 * it holds none, and it stays on the run as the record that it was tried.
 */
export type PaymentState = "to_pay" | "paid" | "returned";

export type RunPaymentClaim = { id: string; title: string; submittedAt: string | null; approvedTotalVnd: number; status: ClaimStatus };

export type RunPayment = {
  id: string;
  personId: string;
  personName: string;
  state: PaymentState;
  amountVnd: number;
  paidVnd: number | null;
  paidAt: string | null;
  /** The bank receipt the payment was recorded with (RB.7). */
  receiptFileId: string | null;
  /** The masked record of where the money went: the bank and the account's last four digits. */
  bankNameSnapshot: string | null;
  accountLast4: string | null;
  /** Why the transfer was returned, from the claims' history; null unless returned. */
  returnReason: string | null;
  claims: RunPaymentClaim[];
};

export type RunDetail = RunSummary & { payments: RunPayment[] };

const RUN_COLUMNS = "id, run_date, status, claims_count, people_count, total_vnd, built_at, paid_at";

function summaryOf(r: Record<string, unknown>): RunSummary {
  return {
    id: String(r.id),
    runDate: String(r.run_date),
    status: r.status === "paid" ? "paid" : "open",
    claims: Number(r.claims_count ?? 0),
    people: Number(r.people_count ?? 0),
    totalVnd: Number(r.total_vnd ?? 0),
    builtAt: String(r.built_at),
    paidAt: (r.paid_at as string | null) ?? null,
  };
}

/** The runs, newest first. */
export async function listPaymentRuns(limit = 48): Promise<RunSummary[]> {
  const rows = mustRows(await selectReimbursementPaymentRuns(RUN_COLUMNS).order("run_date", { ascending: false }).limit(limit), "[reimbursements] payment runs");
  return rows.map(summaryOf);
}

const PAYMENT_PERSON_EMBED = `person:people!reimbursement_payments_person_id_fkey(${NAME_ONLY_COLUMNS})`;

/** One run with its payments, people in name order, or null when there is no such run. */
export async function readPaymentRun(runId: string): Promise<RunDetail | null> {
  const runs = mustRows(await selectReimbursementPaymentRuns(RUN_COLUMNS).eq("id", runId).limit(1), "[reimbursements] one payment run");
  if (!runs[0]) return null;
  const summary = summaryOf(runs[0]);
  const payments = mustRows(
    await selectReimbursementPayments(
      `id, person_id, status, amount_vnd, paid_vnd, paid_at, bank_receipt_file_id, bank_name_snapshot, bank_account_last4, ${PAYMENT_PERSON_EMBED}`,
    ).eq("run_id", runId),
    "[reimbursements] a payment run's payments",
  );
  const claims =
    payments.length === 0
      ? []
      : mustRows(
          await selectReimbursementClaims("id, title, status, submitted_at, approved_total_vnd, payment_id").in(
            "payment_id",
            payments.map((p) => String(p.id)),
          ),
          "[reimbursements] a payment run's claims",
        );
  const emptied = payments.filter((p) => p.status === "to_pay" && !claims.some((c) => c.payment_id === p.id)).map((p) => String(p.id));
  const reasons = await returnReasons(emptied);
  const out: RunPayment[] = payments.map((p) => {
    const id = String(p.id);
    const mine = claims.filter((c) => c.payment_id === p.id);
    const state: PaymentState = p.status === "paid" ? "paid" : mine.length === 0 ? "returned" : "to_pay";
    return {
      id,
      personId: String(p.person_id),
      personName: personName((p.person ?? null) as Parameters<typeof personName>[0], "Someone"),
      state,
      amountVnd: Number(p.amount_vnd ?? 0),
      paidVnd: p.paid_vnd === null || p.paid_vnd === undefined ? null : Number(p.paid_vnd),
      paidAt: (p.paid_at as string | null) ?? null,
      receiptFileId: (p.bank_receipt_file_id as string | null) ?? null,
      bankNameSnapshot: (p.bank_name_snapshot as string | null) ?? null,
      accountLast4: (p.bank_account_last4 as string | null) ?? null,
      returnReason: state === "returned" ? (reasons.get(id) ?? null) : null,
      claims: mine.map((c) => ({
        id: String(c.id),
        title: String(c.title ?? ""),
        submittedAt: (c.submitted_at as string | null) ?? null,
        approvedTotalVnd: Number(c.approved_total_vnd ?? 0),
        status: String(c.status) as ClaimStatus,
      })),
    };
  });
  out.sort((a, b) => a.personName.localeCompare(b.personName));
  return { ...summary, payments: out };
}

/** Why each returned payment's transfer failed: the reason on its claims' return, which names the payment it left. */
async function returnReasons(paymentIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (paymentIds.length === 0) return out;
  const rows = mustRows(
    await selectReimbursementClaimEvents("reason, metadata, created_at")
      .eq("from_status", "in_run")
      .eq("to_status", "approved")
      .in("metadata->>paymentId", paymentIds)
      .order("created_at", { ascending: false }),
    "[reimbursements] why payments were returned",
  );
  for (const r of rows) {
    const id = (r.metadata as { paymentId?: unknown } | null)?.paymentId;
    if (typeof id === "string" && !out.has(id) && typeof r.reason === "string") out.set(id, r.reason);
  }
  return out;
}

/** How many of a run's payments are settled (paid or returned) and how many there are. */
export function progressOf(payments: Pick<RunPayment, "state">[]): { settled: number; toPay: number } {
  const toPay = payments.filter((p) => p.state === "to_pay").length;
  return { settled: payments.length - toPay, toPay };
}
