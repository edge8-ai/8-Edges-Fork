import { companyOs } from "@/kernel/data/supabase";
import { upsertInvoices, selectCompensationSensitive } from "@/entities/finance";
import { createQboInvoice, qboFetch, sendQboInvoice, type QboInvoice } from "@/entities/company-os/lib/qbo";

// Invoice a client company for hours of work: the QuickBooks invoice, the
// mirror row in the synced `invoices` ledger, and the client email QBO sends.
// This is the company-os half of work-request billing (Q2). The other half —
// deciding whether an accepted contractor work request is billable and
// stamping the outcome on it — is portal's, in entities/portal/lib/work-billing.ts,
// because the request tables are portal's and portal sits above company-os in
// the layer order. Nothing here knows what a work request is: the caller
// passes a company, hours and a rate, and gets an invoice or a reason back.

export type ClientInvoiceResult =
  | { ok: true; invoice: QboInvoice; ledgerId: string | null; emailed: boolean; companyName: string | null }
  // `kind` is the caller's whole decision: "manual" is a setup gap a human closes
  // (no QuickBooks customer on the company), "failed" is an error worth retrying.
  | { ok: false; kind: "manual" | "failed"; reason: string; companyName: string | null };

/**
 * The contractor's current client-billable rate in USD cents, resolved via
 * team_members → compensation (comp_type 'billable', default 100% markup on
 * the internal hourly). `null` when no current billable row exists.
 */
export async function billableRateCents(personId: string): Promise<number | null> {
  const { data: tm, error: tmErr } = await companyOs
    .from("team_members")
    .select("id")
    .eq("person_id", personId)
    .maybeSingle();
  if (tmErr || !tm) return null;
  const { data: comp, error: compErr } = await selectCompensationSensitive("amount_cents")
    .eq("team_member_id", tm.id)
    .eq("comp_type", "billable")
    .eq("is_current", true)
    .maybeSingle();
  if (compErr) return null;
  const cents = comp?.amount_cents;
  return typeof cents === "number" && cents > 0 ? cents : cents ? Number(cents) : null;
}

// The currency a QuickBooks customer is billed in. With multicurrency on, an
// invoice takes its customer's currency and the amount is read in it, so a
// caller that priced work in one currency checks this before invoicing.
async function qboCustomerCurrency(customerId: string): Promise<{ ok: true; currency: string } | { ok: false; error: string }> {
  const res = await qboFetch(`/customer/${encodeURIComponent(customerId)}`, { method: "GET" });
  if (!res.ok) return res;
  const customer = (res.json.Customer ?? {}) as { CurrencyRef?: { value?: string } };
  return { ok: true, currency: (customer.CurrencyRef?.value ?? "USD").toLowerCase() };
}

export async function invoiceCompanyForHours(args: {
  companyId: string;
  hours: number;
  rateCents: number;
  description: string;
  /** Free-text memo on the QBO invoice; the caller uses it to link back (`work_request:<id>`). */
  memo: string;
  itemName?: string;
  /**
   * The currency the amount was priced in (ISO code, any case). When set, the
   * QuickBooks customer must be billed in it, or nothing is invoiced: an
   * AUD 15,000 fee raised on a USD customer would be a USD 15,000 invoice.
   */
  expectCurrency?: string;
}): Promise<ClientInvoiceResult> {
  const { data: company, error: companyErr } = await companyOs
    .from("companies")
    .select("id, name, metadata")
    .eq("id", args.companyId)
    .maybeSingle();
  const companyName = company?.name ?? null;
  if (companyErr) return { ok: false, kind: "failed", reason: `Company lookup failed: ${companyErr.message}`, companyName };

  const qboIds = ((company?.metadata as Record<string, unknown> | null)?.qbo_customer_ids ?? []) as string[];
  const customerId = Array.isArray(qboIds) && qboIds.length > 0 ? String(qboIds[0]) : null;
  if (!customerId) {
    return { ok: false, kind: "manual", reason: `${companyName ?? "The client company"} has no QuickBooks customer mapping.`, companyName };
  }

  if (args.expectCurrency) {
    const billedIn = await qboCustomerCurrency(customerId);
    if (!billedIn.ok) return { ok: false, kind: "failed", reason: `QuickBooks customer lookup failed: ${billedIn.error}`, companyName };
    if (billedIn.currency !== args.expectCurrency.toLowerCase()) {
      return {
        ok: false,
        kind: "manual",
        reason: `${companyName ?? "The client company"} is billed in ${billedIn.currency.toUpperCase()} in QuickBooks, but the amount is in ${args.expectCurrency.toUpperCase()}.`,
        companyName,
      };
    }
  }

  const created = await createQboInvoice({
    customerId,
    hours: args.hours,
    rateCents: args.rateCents,
    description: args.description,
    memo: args.memo,
  });
  if (!created.ok) return { ok: false, kind: "failed", reason: created.error, companyName };
  const inv = created.invoice;

  // Mirror into the synced ledger so the portal invoices page shows it
  // immediately; the weekly QBO sync then updates this same row (unique on
  // source + external_id).
  const { data: ledgerRow, error: ledgerErr } = await upsertInvoices(
      {
        company_id: args.companyId,
        source: "quickbooks",
        external_id: inv.id,
        doc_number: inv.docNumber,
        txn_date: inv.txnDate,
        due_date: inv.dueDate,
        currency: inv.currency,
        amount_cents: inv.totalCents,
        balance_cents: inv.totalCents,
        status: "open",
        lines: [
          {
            description: args.description,
            quantity: args.hours,
            rate: args.rateCents / 100,
            amount: inv.totalCents / 100,
            item_name: args.itemName ?? "Contractor Services",
          },
        ],
        synced_at: new Date().toISOString(),
      },
      { onConflict: "source,external_id" },
    )
    .select("id")
    .maybeSingle();
  if (ledgerErr) console.error("[client-invoicing] invoice ledger upsert failed:", ledgerErr.message);

  // QBO emails the client their invoice; a send failure is non-fatal (the
  // invoice exists — the accountant just resends from QBO).
  const sent = await sendQboInvoice(inv.id);

  return { ok: true, invoice: inv, ledgerId: ledgerRow?.id ?? null, emailed: sent.ok, companyName };
}
