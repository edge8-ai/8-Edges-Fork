// A contractor's monthly payment: the questions other entities ask about it
// and the acts they perform on it (A.65, ADR 0018). Company-os rolls accepted
// work up into payments and decides them, the portal shows a contractor their
// own, and crm's runway counts what is still to go out. Finance owns the rows.
//
// Payments are pay data. Each question selects only the columns its caller
// read before this card (H1-DESIGN rule 7), and none hands back a column no
// caller used: the contractor's own page gets its own payments' figures, the
// runway gets amounts and months, the roll-up gets ids and statuses.
import { companyOs } from "@/kernel/data/supabase";
import { GREETING_COLUMNS } from "@/kernel/config/people-name";
import type { Result } from "@/kernel/data/result";

const asResult = ({ error }: { error: { message: string } | null }): Result =>
  error ? { ok: false, error: error.message } : { ok: true };

/** These people's payments for one month (`period` is its first day): one each, if the roll-up has run. */
export async function contractorPaymentsForMonth(personIds: string[], period: string) {
  return companyOs.from("contractor_payments").select("id, status, person_id").in("person_id", personIds).eq("period_month", period);
}

/** Opens a pending payment for a person's month and answers its id. */
export async function openContractorPayment(personId: string, period: string, currency: string) {
  return companyOs
    .from("contractor_payments")
    .insert({ person_id: personId, period_month: period, status: "pending", currency })
    .select("id")
    .single();
}

export type PaymentTotals = {
  regularHours: number;
  overtimeHours: number;
  amountCents: number;
  currency: string;
  summary: string;
};

/** Writes the hours and amount the roll-up computed onto a payment. */
export async function setContractorPaymentTotals(paymentId: string, totals: PaymentTotals): Promise<Result> {
  return asResult(
    await companyOs
      .from("contractor_payments")
      .update({
        total_regular_hours: totals.regularHours,
        total_overtime_hours: totals.overtimeHours,
        amount_cents: totals.amountCents,
        currency: totals.currency,
        summary: totals.summary,
        updated_at: new Date().toISOString(),
      })
      .eq("id", paymentId),
  );
}

/** One payment with the greeting fields of the person it pays, or null. */
export async function contractorPayment(paymentId: string) {
  return companyOs
    .from("contractor_payments")
    .select(`id, person_id, period_month, status, amount_cents, currency, people!person_id(${GREETING_COLUMNS})`)
    .eq("id", paymentId)
    .maybeSingle();
}

export type PaymentDecision = "paid" | "rejected" | "info_requested";

/**
 * Records an admin's decision on a payment. A payment is paid at the moment it
 * is marked paid; any other decision leaves it unpaid.
 */
export async function decideContractorPayment(
  paymentId: string,
  decision: { status: PaymentDecision; decidedBy: string | null; note: string | null },
): Promise<Result> {
  const now = new Date().toISOString();
  return asResult(
    await companyOs
      .from("contractor_payments")
      .update({
        status: decision.status,
        decided_by: decision.decidedBy,
        decided_at: now,
        paid_at: decision.status === "paid" ? now : null,
        note: decision.note,
        updated_at: now,
      })
      .eq("id", paymentId),
  );
}

/** Replaces a payment's computed amount with an admin's, with the reason. */
export async function overrideContractorPaymentAmount(paymentId: string, amountCents: number, note: string): Promise<Result> {
  return asResult(
    await companyOs
      .from("contractor_payments")
      .update({ amount_cents: amountCents, note, updated_at: new Date().toISOString() })
      .eq("id", paymentId),
  );
}

/**
 * Payments for the months from `from` on that are owed or paid. A rejected
 * request is money that never went out; a pending one is still owed, so it is
 * in.
 */
export async function contractorPaymentsOwedSince(from: string) {
  return companyOs
    .from("contractor_payments")
    .select("id, amount_cents, currency, period_month")
    .gte("period_month", from)
    .neq("status", "rejected")
    .limit(20000);
}

/** A contractor's own payments, newest month first, as their work page shows them. */
export async function contractorPaymentsOf(personId: string) {
  return companyOs
    .from("contractor_payments")
    .select("id, period_month, total_regular_hours, total_overtime_hours, amount_cents, currency, status, paid_at, note")
    .eq("person_id", personId)
    .order("period_month", { ascending: false });
}
