// Finance's side of the bus (S.2, docs/adr/0003).
//
// A payment is the only thing in the ledger that other entities act on, and
// finance cannot call any of them: it sits below crm, which requires it, so
// the dependency only runs one way. It states the fact and crm subscribes.
//
// The awkward part is that the ledger is a MIRROR. QuickBooks is the source of
// truth and the weekly sync re-upserts every invoice since 2025, so "the row
// says paid" is not a payment — the first pass over an entity would announce
// every invoice ever collected, and every pass after it would announce the
// same ones again. A payment is a transition, and the only thing that can see
// one is the stored row the upsert is about to overwrite. Hence the read
// before the write, and hence the shape of `paidTransitions`: pure, over the
// two row sets, so the rule is testable without a QuickBooks account.
import { mustRows } from "@/kernel/data/read";
import { publish, type EventPayload } from "@/kernel/events";
import { selectInvoices } from "./reads";
import { INVOICE_PAID, INVOICE_VOIDED, canBecomePayment } from "./invoice-status";

/** What the mirror is about to write, as the sync assembles it. */
export type MirroredInvoice = {
  source: string;
  entity: string;
  external_id: string;
  status: string;
  amount_cents: number;
  currency: string;
};

/** What the ledger holds for one of those invoices right now. */
export type StoredInvoice = {
  id: string;
  source: string;
  entity: string;
  external_id: string;
  status: string;
  company_id: string | null;
  deal_id: string | null;
  // The invoice number, for the inbox (S.3).
  doc_number?: string | null;
};

// The ledger's own key. external_id is unique per QuickBooks company, not
// across them, so the entity is part of the identity — matching on the id
// alone reads AIO's invoice 101 as Edge8's.
const keyOf = (r: { source: string; entity: string; external_id: string }) =>
  [r.source, r.entity, r.external_id].join("|");

/**
 * The payments in this mirror pass.
 *
 * `observedOn` is the day the sync ran, which is what `paidOn` means: the day
 * the ledger first saw the balance at zero. The day the money actually moved
 * is not a fact this mirror carries.
 */
export function paidTransitions(
  incoming: MirroredInvoice[],
  stored: StoredInvoice[],
  observedOn: string,
): EventPayload<"invoice.paid">[] {
  const before = new Map(stored.map((s) => [keyOf(s), s]));
  const facts: EventPayload<"invoice.paid">[] = [];
  for (const row of incoming) {
    if (row.status !== INVOICE_PAID) continue;
    const was = before.get(keyOf(row));
    // No stored row is history arriving, not a payment: the invoice was
    // already settled before this ledger knew about it, and it has no id yet
    // because the upsert has not run.
    //
    // `canBecomePayment` also rules out a VOIDED stored row, which the old
    // `was.status === PAID` test let through: a cancelled bill reinstated and
    // marked paid in QuickBooks would have been announced as a payment, and
    // crm's subscriber would have raised the company to `customer` on it.
    if (!was || !canBecomePayment(was.status)) continue;
    facts.push({
      invoiceId: was.id,
      companyId: was.company_id,
      dealId: was.deal_id,
      amountCents: row.amount_cents,
      currency: row.currency,
      paidOn: observedOn,
      ...(was.doc_number !== undefined ? { docNumber: was.doc_number } : {}),
    });
  }
  return facts;
}

/**
 * The rows a payment could come FROM, read before the mirror is written.
 *
 * Named for the question it answers rather than "unpaid", because "unpaid" is
 * the word that collided: crm's runway also asks which invoices are unpaid and
 * means something else by it (see ./invoice-status). These are candidates for a
 * STATE CHANGE, not a statement that money is owed.
 *
 * Narrowed by status rather than listed by external id: the mirror carries
 * every invoice since 2025 and most are long since paid, so an `in(...)` over
 * their ids would be a query string hundreds of entries long to learn nothing.
 * Only a row that can still become a payment is worth comparing, and there are
 * never many of those.
 *
 * A failed read raises (S.19.1). It used to answer "no candidates", and the
 * sync then upserted the same rows as paid in the same pass, so the stored row
 * that could have shown the transition was overwritten and the payment was
 * never announced by any later pass. The caller must stop before its upsert.
 */
export async function paymentCandidatesFor(incoming: MirroredInvoice[]): Promise<StoredInvoice[]> {
  const sources = [...new Set(incoming.map((r) => r.source).filter(Boolean))];
  const entities = [...new Set(incoming.map((r) => r.entity).filter(Boolean))];
  if (sources.length === 0 || entities.length === 0) return [];
  const rows = mustRows(
    await selectInvoices("id, source, entity, external_id, status, company_id, deal_id, doc_number")
      .in("source", sources)
      .in("entity", entities)
      .neq("status", INVOICE_PAID)
      .neq("status", INVOICE_VOIDED),
    "[finance/invoice-paid] payment candidates",
  );
  return rows as unknown as StoredInvoice[];
}

/**
 * Announce the payments a mirror pass landed.
 *
 * Called after the upsert, with the facts computed before it: the bus awaits
 * its handlers, and a subscriber acting on a payment the upsert then failed to
 * write would be reacting to a row that does not say what it thinks.
 */
export async function announceInvoicesPaid(facts: EventPayload<"invoice.paid">[]): Promise<void> {
  for (const fact of facts) await publish("invoice.paid", fact);
}
