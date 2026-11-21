// The questions other entities ask of the whole invoice ledger: the revenue
// tabs, the company dashboard and the team assistant's totals (A.65, ADR 0018).
//
// Each used to be spelled by its caller as `selectInvoices(columns)` plus its
// own filters, so the rule that a voided invoice is not revenue was restated
// in every file that summed the ledger. The rule now lives in the question,
// and every question makes exactly the query its caller made before: the same
// filters, order and row cap. Where two callers read the same rows with
// different columns, the question returns their union (H1-DESIGN rule 6); the
// ledger holds no pay or bank data, so a union widens nothing sensitive.
//
// Every question returns the awaited PostgREST result, so the caller still
// decides what a failure means (mustRows, readOr, or a labelled error on the
// page), as CLAUDE.md rule 2 asks. Each select is a literal column list, so
// PostgREST types the rows from the generated schema and no caller casts them.
import { companyOs } from "@/kernel/data/supabase";
import { INVOICE_VOIDED } from "./invoice-status";

/**
 * Up to five thousand invoices of every status, voided included: the Billing
 * tab lists voided rows, and the Clients tab drops them itself.
 */
export async function invoiceLedger() {
  return companyOs
    .from("invoices")
    .select(
      "id, doc_number, customer_name, amount_cents, amount_usd_cents, balance_cents, balance_usd_cents, currency, status, txn_date, due_date, deal_id, company_id, kind",
    )
    .limit(5000);
}

/**
 * Every invoice that is not voided, up to `limit` rows: what was billed. The
 * cap is the caller's, because the dashboard and the overview read different
 * amounts of history.
 */
export async function liveInvoices(limit: number) {
  return companyOs
    .from("invoices")
    .select("txn_date, amount_cents, amount_usd_cents, balance_cents, balance_usd_cents, currency, status, entity, kind")
    .neq("status", INVOICE_VOIDED)
    .limit(limit);
}

/**
 * Invoices dated on or after `since`, of every status: the months the
 * recurring forecast takes its baseline from.
 */
export async function invoicesSince(since: string) {
  return companyOs
    .from("invoices")
    .select("id, amount_cents, amount_usd_cents, currency, status, txn_date, kind")
    .gte("txn_date", since)
    .limit(5000);
}

/**
 * Invoices with money still on them, of every status: the inflow side of the
 * runway, which decides for itself which of them are collectible.
 */
export async function invoicesWithBalance() {
  return companyOs
    .from("invoices")
    .select("id, balance_cents, balance_usd_cents, amount_usd_cents, currency, status, due_date")
    .gt("balance_cents", 0)
    .limit(5000);
}

/** The deals some live invoice is linked to, one row per invoice. */
export async function invoicedDeals() {
  return companyOs.from("invoices").select("deal_id").not("deal_id", "is", null).neq("status", INVOICE_VOIDED).limit(5000);
}

/**
 * The live invoices of these companies that still carry a balance and were
 * due before `today`. The account-health score decides which of them count as
 * overdue; this only keeps the answer small.
 */
export async function pastDueInvoicesOf(companyIds: string[], today: string) {
  return companyOs
    .from("invoices")
    .select("company_id, status, balance_cents, due_date")
    .in("company_id", companyIds)
    .neq("status", INVOICE_VOIDED)
    .gt("balance_cents", 0)
    .lt("due_date", today);
}

/** What was billed between two dates, inclusive, across the whole company. */
export async function liveInvoicesBetween(from: string, to: string) {
  return companyOs
    .from("invoices")
    .select("amount_cents, balance_cents, currency")
    .gte("txn_date", from)
    .lte("txn_date", to)
    .neq("status", INVOICE_VOIDED);
}

/**
 * What was billed between two dates, inclusive, to a client company: every
 * client when `onlyCompanyIds` is null, otherwise only those companies.
 */
export async function liveClientInvoicesBetween(from: string, to: string, onlyCompanyIds: string[] | null) {
  const query = companyOs
    .from("invoices")
    .select("company_id, amount_cents, balance_cents, currency")
    .gte("txn_date", from)
    .lte("txn_date", to)
    .neq("status", INVOICE_VOIDED)
    .not("company_id", "is", null);
  return onlyCompanyIds ? query.in("company_id", onlyCompanyIds) : query;
}
