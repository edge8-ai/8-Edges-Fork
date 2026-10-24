// Crm's side of a payment (S.2, docs/adr/0003).
//
// An account becomes a `customer` in exactly one place today: moveDealStage,
// when a deal lands on a won stage. Everybody who pays without ever being in
// the pipeline — most of AIO, the bookkeeping-only clients, anybody invoiced
// off a retreat — stays at whatever lifecycle stage the last inbound form left
// them on. The Revenue hub works around it by re-deriving "who is a client"
// from the invoice ledger on every render of the Clients tab
// (lib/revenue-metrics/clients.ts reads up to five thousand rows to do it).
//
// Paying an invoice is the plainest evidence of a customer there is, so this
// records it where the rest of the OS can see it, at the moment it happens.
//
// Finance must not call crm — crm requires finance, not the other way round —
// which is exactly why this is a subscription.
import type { EventPayload } from "@/kernel/events";
import { bumpCompanyLifecycle } from "./lifecycle";

/**
 * A paying account is a customer.
 *
 * Raise-only, because `bumpCompanyLifecycle` is: an evangelist settling an
 * invoice is not demoted, and the stage is never written here directly.
 */
export async function markAccountCustomerOnPayment(payload: EventPayload<"invoice.paid">): Promise<void> {
  // An unmapped QuickBooks customer, which most AIO invoices are by design.
  // There is no account to advance, and guessing one from the invoice would
  // attach somebody else's revenue to a company.
  if (!payload.companyId) return;
  await bumpCompanyLifecycle(payload.companyId, "customer", { reason: "invoice_paid" });
}
