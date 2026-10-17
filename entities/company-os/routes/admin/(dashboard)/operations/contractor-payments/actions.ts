"use server";

import { revalidatePath } from "next/cache";
import { companyOs } from "@/kernel/data/supabase";
import { GREETING_COLUMNS, greetingName, type GreetedPerson } from "@/kernel/config/people-name";
import { selectContractorPayments, updateContractorPayments } from "@/entities/finance";
import { requirePermission } from "@/kernel/identity/access-request";
import type { AdminUser } from "@/kernel/identity/admin-auth";
import { recordAudit } from "@/kernel/audit/audit";
import { formatCents } from "@/kernel/ui/format";
import { periodMonth, rollupContractorPayments, type RollupSummary } from "@/entities/company-os/lib/contractor-payments";
import { sendPaymentEmail } from "@/entities/portal";
import { monthLabel, type PaymentItemRow } from "./payment-shared";
import { one } from "@/kernel/config/embedded";
import type { Result } from "@/kernel/data/result";

function refresh() {
  revalidatePath("/admin/operations/contractor-payments");
}

// Every action here handles pay data, so all are gated like the page itself:
// the page's atom AND people.pay (ADR 0014), which Super Admin holds by
// declaration. Returns null when the person does not hold people.pay.
async function requireClearedAdmin(): Promise<AdminUser | null> {
  const access = await requirePermission("company-os.operations");
  return access.may("people.pay") ? access.user : null;
}

async function loadPayment(id: string) {
  const { data, error } = await selectContractorPayments(`id, person_id, period_month, status, amount_cents, currency, people!person_id(${GREETING_COLUMNS})`)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  // finance owns contractor_payments, so the read comes through its door and the
  // row shape is stated here rather than inferred from the column list.
  const row = data as unknown as {
    id: string;
    person_id: string;
    period_month: string;
    status: string;
    amount_cents: number | null;
    currency: string | null;
    people: GreetedPerson | GreetedPerson[] | null;
  };
  const person = one(row.people);
  return { ...row, person };
}

// Mark paid / reject / request more info on a payment. Paid and info-requested
// email the contractor; rejected is an internal bookkeeping state.
export async function decidePayment(
  id: string,
  decision: "paid" | "rejected" | "info_requested",
  note: string,
): Promise<Result> {
  const admin = await requireClearedAdmin();
  if (!admin) return { ok: false, error: "Not authorized." };
  const payment = await loadPayment(id);
  if (!payment) return { ok: false, error: "Payment not found." };
  if (!["pending", "info_requested"].includes(payment.status))
    return { ok: false, error: `This payment is already ${payment.status}.` };
  if (decision !== "paid" && !note.trim())
    return { ok: false, error: "Add a note explaining the decision." };

  const now = new Date().toISOString();
  const { error } = await updateContractorPayments({
      status: decision,
      decided_by: admin.email,
      decided_at: now,
      paid_at: decision === "paid" ? now : null,
      note: note.trim() || null,
      updated_at: now,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    table: "contractor_payments",
    recordId: id,
    operation: "update",
    actor: admin.email,
    newData: { status: decision, note: note.trim() || null },
  });

  if (payment.person?.email && decision !== "rejected") {
    await sendPaymentEmail({
      to: payment.person.email,
      // The email says "Hi …": the name they asked for, never full_name's
      // first word, which is a family name for Vietnamese-order rows (S.16).
      name: greetingName(payment.person, null),
      monthLabel: monthLabel(payment.period_month),
      amountLabel: formatCents(payment.amount_cents, payment.currency ?? undefined),
      status: decision,
      note,
    });
  }

  refresh();
  return { ok: true };
}

// Admin override of the computed amount (rounding, agreed adjustments) —
// only while the payment is still undecided.
export async function overridePaymentAmount(id: string, amountCents: number, note: string): Promise<Result> {
  const admin = await requireClearedAdmin();
  if (!admin) return { ok: false, error: "Not authorized." };
  const payment = await loadPayment(id);
  if (!payment) return { ok: false, error: "Payment not found." };
  if (!["pending", "info_requested"].includes(payment.status))
    return { ok: false, error: `This payment is already ${payment.status}.` };
  const cents = Math.round(amountCents);
  if (!Number.isFinite(cents) || cents < 0) return { ok: false, error: "Amount must be zero or more." };
  if (!note.trim()) return { ok: false, error: "Add a note explaining the override." };

  const { error } = await updateContractorPayments({ amount_cents: cents, note: note.trim(), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    table: "contractor_payments",
    recordId: id,
    operation: "update",
    actor: admin.email,
    oldData: { amount_cents: payment.amount_cents },
    newData: { amount_cents: cents, note: note.trim() },
    context: { kind: "amount_override" },
  });
  refresh();
  return { ok: true };
}

// Manual roll-up. "previous" mirrors the cron; "current" lets an admin pull
// this month's accepted work into a payment early (e.g. for testing or an
// off-cycle payout).
export async function runRollup(which: "previous" | "current"): Promise<Result & { summary?: RollupSummary }> {
  const admin = await requireClearedAdmin();
  if (!admin) return { ok: false, error: "Not authorized." };
  const period = periodMonth(which === "previous" ? -1 : 0);
  const result = await rollupContractorPayments(period);
  if ("error" in result) return { ok: false, error: result.error };

  await recordAudit({
    table: "contractor_payments",
    operation: "update",
    actor: admin.email,
    newData: { rollup: result },
    context: { kind: "manual_rollup", period },
  });
  refresh();
  return { ok: true, summary: result };
}

// Line items for the shelf: the work requests bundled into this payment.
export async function listPaymentItems(paymentId: string): Promise<PaymentItemRow[]> {
  if (!(await requireClearedAdmin())) return [];
  const { data, error } = await companyOs
    .from("contractor_work_requests")
    .select("id, title, actual_hours, actual_overtime_hours, work_link, accepted_at")
    .eq("payment_id", paymentId)
    .order("accepted_at", { ascending: true });
  if (error) {
    console.error("[contractor-payments] items load failed:", error.message);
    return [];
  }
  return (data ?? []) as PaymentItemRow[];
}
