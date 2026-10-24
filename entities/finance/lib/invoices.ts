// The questions other entities ask about one company's invoices or one
// invoice, and the writes they make to the ledger (A.65, ADR 0018). The
// ledger-wide reads behind the revenue figures are in ./invoice-book.ts.
//
// Each question makes exactly the query its caller used to build by hand
// around `selectInvoices(columns)`. Where two callers asked a similar question
// with different filters, they stay two questions rather than one picked for
// both (H1-DESIGN rule 7): the CRM's company invoice tab hides voided
// invoices, while the team assistant's client summary lists them and leaves
// them out of its sums. The portal's question selects only what the client's
// own invoices page shows, so nothing internal to finance (a memo, the deal it
// is attributed to) reaches a client-safe read.
import { companyOs } from "@/kernel/data/supabase";
import type { TablesInsert } from "@/kernel/data/supabase/database.types";
import type { Result } from "@/kernel/data/result";
import { INVOICE_VOIDED } from "./invoice-status";

type InvoiceInsert = TablesInsert<{ schema: "company_os" }, "invoices">;

/** One company's invoices that are not voided, newest first. */
export async function liveInvoicesOfCompany(companyId: string) {
  return companyOs
    .from("invoices")
    .select("id, doc_number, txn_date, due_date, currency, amount_cents, balance_cents, status, memo, customer_name, deal_id")
    .eq("company_id", companyId)
    .neq("status", INVOICE_VOIDED)
    .order("txn_date", { ascending: false });
}

/** One company's hundred newest invoices of every status, voided included. */
export async function latestInvoicesOfCompany(companyId: string) {
  return companyOs
    .from("invoices")
    .select("company_id, doc_number, txn_date, due_date, amount_cents, balance_cents, currency, status")
    .eq("company_id", companyId)
    .order("txn_date", { ascending: false })
    .limit(100);
}

/** The live invoices billed to these companies, newest first, as the client portal shows them to the client's own admins. */
export async function clientInvoices(companyIds: string[]) {
  return companyOs
    .from("invoices")
    .select("id, doc_number, txn_date, due_date, currency, amount_cents, balance_cents, status, payment_link, lines")
    .in("company_id", companyIds)
    .neq("status", INVOICE_VOIDED)
    .order("txn_date", { ascending: false });
}

/** At most one invoice of these companies, of any status: whether they have been billed at all. */
export async function anyInvoiceOf(companyIds: string[]) {
  return companyOs.from("invoices").select("id").in("company_id", companyIds).limit(1);
}

/** The company an invoice bills and the deal it is attributed to, or null. */
export async function invoiceAttribution(invoiceId: string) {
  return companyOs.from("invoices").select("company_id, deal_id").eq("id", invoiceId).maybeSingle();
}

/** Attributes an invoice to a deal, or clears the attribution with null. */
export async function setInvoiceDeal(invoiceId: string, dealId: string | null): Promise<Result> {
  const { error } = await companyOs.from("invoices").update({ deal_id: dealId }).eq("id", invoiceId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Writes the ledger's copy of one invoice just raised in QuickBooks, so the
 * portal shows it before the weekly sync runs, and answers the row's id.
 *
 * The conflict target is the ledger's unique key, (source, entity,
 * external_id), the same one the weekly sync writes on, so the sync updates
 * this row rather than adding a second. Until A.73 it named the key the table
 * had before migration 20260813130000_invoices_entity, which Postgres refuses,
 * so no raised invoice reached the ledger until the sync ran. The entity is
 * required for the same reason: QuickBooks invoice ids are unique only within
 * one realm.
 */
export async function mirrorRaisedInvoice(row: InvoiceInsert & { entity: "edge8" | "aio" }) {
  return companyOs.from("invoices").upsert(row, { onConflict: "source,entity,external_id" }).select("id").maybeSingle();
}

/** Writes the QuickBooks sync's pass over the ledger, keyed on (source, entity, external_id). */
export async function mirrorSyncedInvoices(rows: InvoiceInsert[]): Promise<Result> {
  const { error } = await companyOs.from("invoices").upsert(rows, { onConflict: "source,entity,external_id" });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * The invoices the global search finds for these terms (SR.2.2), ranked by the
 * database's company_os.search_invoices: number and customer, accents ignored,
 * best match first, never a voided invoice.
 */
export async function invoicesMatching(terms: string[], limit: number) {
  return companyOs.rpc("search_invoices", { terms, lim: limit });
}
