import { companyOs } from "@/kernel/data/supabase";
import type { Json } from "@/kernel/data/supabase/database.types";
import { sendTransactionalEmail } from "@/kernel/messaging/email";
import { optionalEnv } from "@/kernel/config/env";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { notifyOps } from "@/kernel/messaging/lark";
import { billableRateCents, invoiceCompanyForHours } from "@/entities/company-os";
import { insertContractorWorkEvents, updateContractorWorkRequests } from "./writes";
import { OPS_EMAIL } from "@/kernel/config/contacts";
import { escapeHtml } from "@/kernel/config/html";

// Client billing for portal-origin contractor work requests: on acceptance,
// invoice the client in QuickBooks at the contractor's BILLABLE rate
// (compensation comp_type 'billable' — default 100% markup on internal
// hourly). Never throws and never blocks acceptance: every failure path
// degrades to a billing_status flag + accountant email + ops Lark so a human
// can invoice manually. Contractor pay (contractor_payments roll-up at the
// internal rate) is untouched by any of this.
//
// Portal's since Q2: the request rows and their event log are portal's tables,
// so the decision and the stamp live here, while the QuickBooks call and the
// invoice ledger are company-os's (`invoiceCompanyForHours`), one layer down.
// Plan: docs/plans/2026-07-18-client-work-requests.md

export type BillingOutcome =
  | { status: "skipped"; reason: string }
  | { status: "invoiced"; docNumber: string | null; amountCents: number }
  | { status: "manual_required" | "failed"; reason: string };

// Read at call time rather than at module scope: a module-scope read is
// captured when the serverless instance first loads the file, which hides an
// env change behind a redeploy and makes the value untestable.
function accountingEmail(): string | undefined {
  return optionalEnv("ACCOUNTING_EMAIL");
}

// The admin request page, absolute because it goes into an email.
async function requestAdminUrl(requestId: string): Promise<string> {
  return `${await getSiteOrigin()}/admin/operations/contractor-requests?open=${requestId}`;
}

type BillableRequest = {
  id: string;
  person_id: string;
  title: string;
  status: string;
  origin: string;
  client_company_id: string | null;
  billing_status: string | null;
  actual_hours: number | string | null;
  actual_overtime_hours: number | string | null;
};

const toNum = (v: number | string | null): number => {
  const n = typeof v === "string" ? Number(v) : v ?? 0;
  return Number.isFinite(n) ? n : 0;
};

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

async function addSystemEvent(requestId: string, body: string, meta: Record<string, unknown> = {}) {
  const { error } = await insertContractorWorkEvents({
    request_id: requestId,
    actor_type: "system",
    actor: null,
    type: "message",
    body,
    meta: meta as Json,
  });
  if (error) console.error("[work-billing] event insert failed:", error.message);
}

async function flagManual(
  req: BillableRequest,
  status: "manual_required" | "failed",
  reason: string,
  details: string[],
): Promise<BillingOutcome> {
  const { error } = await updateContractorWorkRequests({
    billing_status: status,
    billing_error: reason,
    updated_at: new Date().toISOString(),
  }).eq("id", req.id);
  if (error) console.error("[work-billing] billing_status update failed:", error.message);
  await addSystemEvent(req.id, `Client invoicing needs a hand: ${reason}`, { billing_status: status });

  const lines = [
    `Work request "${req.title}" was accepted but could not be invoiced automatically.`,
    `Reason: ${reason}`,
    ...details,
    `Review: ${await requestAdminUrl(req.id)}`,
  ];
  const accounting = accountingEmail();
  if (accounting) {
    await sendTransactionalEmail({
      to: accounting,
      subject: `Manual invoice needed: ${req.title}`,
      // The title is the client's own words; every line is escaped (S.16.25).
      html: lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("\n"),
      replyTo: OPS_EMAIL,
    });
  }
  await notifyOps(`⚠️ Client invoicing ${status === "failed" ? "failed" : "needs manual handling"}: "${req.title}" — ${reason}`);
  return { status, reason };
}

export async function runWorkRequestBilling(requestId: string): Promise<BillingOutcome> {
  try {
    return await runBilling(requestId);
  } catch (err) {
    // Belt and braces: acceptance must never fail because billing blew up.
    console.error("[work-billing] unexpected failure:", err);
    return { status: "failed", reason: err instanceof Error ? err.message : "unexpected error" };
  }
}

async function runBilling(requestId: string): Promise<BillingOutcome> {
  const { data, error } = await companyOs
    .from("contractor_work_requests")
    .select("id, person_id, title, status, origin, client_company_id, billing_status, actual_hours, actual_overtime_hours")
    .eq("id", requestId)
    .maybeSingle();
  if (error) return { status: "failed", reason: error.message };
  const req = data as BillableRequest | null;
  if (!req) return { status: "skipped", reason: "request not found" };

  // Only portal-origin (client) requests are billed; internal admin requests
  // have no client to invoice.
  if (req.origin !== "portal") return { status: "skipped", reason: "admin-origin request" };
  if (req.status !== "completed") return { status: "skipped", reason: "not completed" };
  if (req.billing_status !== null) return { status: "skipped", reason: "already billed" };

  const hours = Math.round((toNum(req.actual_hours) + toNum(req.actual_overtime_hours)) * 100) / 100;
  if (hours <= 0) return flagManual(req, "manual_required", "No billable hours on the request.", []);

  if (!req.client_company_id)
    return flagManual(req, "manual_required", "No client company on the request.", []);

  const rateCents = await billableRateCents(req.person_id);
  if (!rateCents)
    return flagManual(req, "manual_required", "The contractor has no billable rate set (Operations → Contractors).", [
      `Hours delivered: ${hours}`,
    ]);

  const amountCents = Math.round(hours * rateCents);
  const priceLine = `Hours: ${hours} × ${dollars(rateCents)}/h = ${dollars(amountCents)}`;

  const result = await invoiceCompanyForHours({
    companyId: req.client_company_id,
    hours,
    rateCents,
    description: `Contractor work: ${req.title}`,
    memo: `work_request:${req.id}`,
  });
  if (!result.ok) {
    // The invoicer says which it is: a setup gap for a human, or a failure.
    // Both leave the request flagged for manual invoicing.
    const status = result.kind === "manual" ? "manual_required" : "failed";
    return flagManual(req, status, result.reason, [`Customer: ${result.companyName ?? "unknown"}`, priceLine]);
  }

  const { invoice: inv, ledgerId, emailed, companyName } = result;
  const invoiceLabel = inv.docNumber ? `#${inv.docNumber}` : inv.id;
  const amountLabel = dollars(inv.totalCents);

  // Stamp the request. A crash between QBO create and this stamp leaves a
  // real invoice unstamped — the accountant email below carries the doc
  // number, and the weekly sync lands the ledger row regardless.
  const { error: stampErr } = await updateContractorWorkRequests({
    billing_status: "invoiced",
    billing_error: null,
    billed_invoice_id: ledgerId,
    billed_amount_cents: inv.totalCents,
    billed_rate_cents: rateCents,
    billed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", req.id);
  if (stampErr) console.error("[work-billing] invoice stamp failed:", stampErr.message);

  await addSystemEvent(
    req.id,
    `Invoice ${invoiceLabel} created for ${amountLabel} (${hours}h × ${dollars(rateCents)}/h)${emailed ? " and emailed to the client" : " — QBO email send failed, resend from QuickBooks"}.`,
    { qbo_invoice_id: inv.id, amount_cents: inv.totalCents },
  );
  const accounting = accountingEmail();
  if (accounting) {
    await sendTransactionalEmail({
      to: accounting,
      subject: `Invoice created: ${req.title} (${amountLabel})`,
      html: [
        `<p>Contractor work "${escapeHtml(req.title)}" was accepted by the client and invoiced automatically.</p>`,
        `<p>QuickBooks invoice ${invoiceLabel} — ${amountLabel} (${hours}h × ${dollars(rateCents)}/h, 100% markup rate) for ${escapeHtml(companyName ?? "the client")}.</p>`,
        emailed ? `<p>QBO has emailed it to the client.</p>` : `<p><strong>QBO could not email it — please send it from QuickBooks.</strong></p>`,
        `<p>Request: ${await requestAdminUrl(req.id)}</p>`,
      ].join("\n"),
      replyTo: OPS_EMAIL,
    });
  }
  await notifyOps(
    `🧾 Invoice ${invoiceLabel} created: "${req.title}" — ${amountLabel} for ${companyName ?? "client"}${emailed ? ", emailed via QBO" : " (QBO email failed — resend manually)"}.`,
  );

  return { status: "invoiced", docNumber: inv.docNumber, amountCents: inv.totalCents };
}
