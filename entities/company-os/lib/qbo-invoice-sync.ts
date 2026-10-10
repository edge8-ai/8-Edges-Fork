import { companyOs, type CompanyOsInsert } from "@/kernel/data/supabase";
import { announceInvoicesPaid, classifyInvoiceKind, invoiceUsdColumns, INVOICE_OPEN, INVOICE_OVERDUE, INVOICE_PAID, INVOICE_VOIDED, isVoided, paidTransitions, paymentCandidatesFor, upsertInvoices, type InvoiceStatus, type MirroredInvoice, type StoredInvoice } from "@/entities/finance";
import { saigonToday } from "@/kernel/config/dates";
import { usdRate } from "@/kernel/data/fx";
import { recordAuditMany, type AuditInput } from "@/kernel/audit/audit";
import { listQboInvoices, type QboEntity, type QboSyncInvoice } from "@/entities/company-os/lib/qbo";
import { selectCompanies } from "@/kernel/identity/reads";
import { updateCompanies } from "@/kernel/identity/writes";

// Mirrors QuickBooks invoices into company_os.invoices for one company
// (entity). Read-from-QBO, upsert-into-Supabase; never deletes. The mirror is
// read-only in the app — QuickBooks is the source of truth.
//
// Customer -> company mapping is realm-aware and lives on company metadata:
//   entity 'edge8' -> companies.metadata.qbo_customer_ids
//   entity 'aio'   -> companies.metadata.qbo_customer_ids_aio
// A QBO customer with no mapped company is never guessed at: the invoice syncs
// with company_id null (customer_name still identifies it) and is reported as
// unmapped. Revenue therefore counts every invoice either way; mapping a
// customer later attaches its invoices on the next sync pass. AIO customers
// are mostly individuals, so most AIO invoices stay unmapped by design.

const MAPPING_KEY: Record<QboEntity, string> = {
  edge8: "qbo_customer_ids",
  aio: "qbo_customer_ids_aio",
};

// Sync only covers 2025 onward — matches the existing Edge8 backfill depth and
// the agreed AIO scope.
const SINCE = "2025-01-01";

export type UnmappedCustomer = { customerId: string; customerName: string | null; count: number };
export type InvoiceSyncResult = {
  entity: QboEntity;
  ok: boolean;
  error?: string;
  fetched: number;
  upserted: number;
  unmappedCount: number;
  unmapped: UnmappedCustomer[];
};

// QBO customer id -> our company_id, for one entity. A failed read is a failed
// sync, not an empty map: returning `new Map()` here made every invoice look
// unmapped, wrote them all with company_id null, and reported ok — a real
// database fault dressed as the benign "unmapped by design" case the weekly
// cron never alarms on.
async function loadCustomerMap(entity: QboEntity): Promise<{ map: Map<string, string> } | { error: string }> {
  const key = MAPPING_KEY[entity];
  const { data, error: mapErr } = await companyOs
    .from("companies")
    .select("id, metadata")
    .not(`metadata->${key}`, "is", null);
  if (mapErr) return { error: `companies mapping read failed: ${mapErr.message}` };
  const map = new Map<string, string>();
  for (const row of (data ?? []) as { id: string; metadata: Record<string, unknown> }[]) {
    const ids = row.metadata?.[key];
    if (Array.isArray(ids)) for (const id of ids) map.set(String(id), row.id);
  }
  return { map };
}

// Status the same way the ledger has always derived it: an explicit QBO void
// marker wins; otherwise a positive balance is overdue past its due date, else
// open; a zero balance is paid.
function deriveStatus(inv: QboSyncInvoice): InvoiceStatus {
  if (inv.memo && /void/i.test(inv.memo)) return INVOICE_VOIDED;
  if (inv.balanceCents > 0) {
    if (inv.dueDate && inv.dueDate < saigonToday()) return INVOICE_OVERDUE;
    return INVOICE_OPEN;
  }
  return INVOICE_PAID;
}

// A company's client start date is its first invoice. The sync fills it only
// where it is empty, so a date a person corrected by hand is never overwritten;
// the end date is never touched here. The rows are this entity's full invoice
// history since SINCE, so the earliest one per company is its first invoice.
async function fillClientStartDates(rows: CompanyOsInsert<"invoices">[]): Promise<string | null> {
  const first = new Map<string, string>();
  for (const r of rows) {
    if (!r.company_id || !r.txn_date || isVoided(r.status)) continue;
    const prev = first.get(r.company_id);
    if (!prev || r.txn_date < prev) first.set(r.company_id, r.txn_date);
  }
  if (first.size === 0) return null;

  const { data, error } = await selectCompanies("id")
    .in("id", [...first.keys()])
    .is("client_start_date", null);
  if (error) return `client start date read failed: ${error.message}`;
  for (const { id } of (data ?? []) as { id: string }[]) {
    const { error: writeErr } = await updateCompanies({ client_start_date: first.get(id) })
      .eq("id", id)
      .is("client_start_date", null);
    if (writeErr) return `client start date write failed: ${writeErr.message}`;
  }
  return null;
}

// Today's rate for each foreign currency that came without a QuickBooks rate.
// QuickBooks books a rate on every foreign invoice in a multicurrency company,
// so this is a fallback, and a failed lookup leaves the invoice unconverted
// (null, counted as such by revenue) rather than failing the whole mirror.
async function fallbackRates(invoices: QboSyncInvoice[]): Promise<Map<string, number>> {
  const needed = new Set(invoices.filter((i) => i.currency !== "usd" && i.exchangeRate == null).map((i) => i.currency));
  const rates = new Map<string, number>();
  for (const currency of needed) {
    try {
      rates.set(currency, (await usdRate(currency)).rate);
    } catch (err) {
      console.error(`[qbo-invoice-sync] no ${currency} rate; those invoices stay unconverted:`, err);
    }
  }
  return rates;
}

export async function syncQboInvoices(entity: QboEntity): Promise<InvoiceSyncResult> {
  const base: InvoiceSyncResult = {
    entity,
    ok: false,
    fetched: 0,
    upserted: 0,
    unmappedCount: 0,
    unmapped: [],
  };

  const listed = await listQboInvoices(entity, SINCE);
  if (!listed.ok) return { ...base, error: listed.error };

  const loaded = await loadCustomerMap(entity);
  if ("error" in loaded) return { ...base, error: loaded.error, fetched: listed.invoices.length };
  const customerMap = loaded.map;
  const fallbackRate = await fallbackRates(listed.invoices);
  const unmapped = new Map<string, UnmappedCustomer>();
  const rows: CompanyOsInsert<"invoices">[] = [];

  for (const inv of listed.invoices) {
    const companyId = inv.customerId ? customerMap.get(inv.customerId) : undefined;
    if (!companyId) {
      const k = inv.customerId ?? "unknown";
      const prev = unmapped.get(k);
      if (prev) prev.count++;
      else unmapped.set(k, { customerId: k, customerName: inv.customerName, count: 1 });
    }
    rows.push({
      company_id: companyId ?? null,
      source: "quickbooks",
      entity,
      external_id: inv.externalId,
      customer_id: inv.customerId,
      doc_number: inv.docNumber,
      txn_date: inv.txnDate,
      due_date: inv.dueDate,
      currency: inv.currency,
      amount_cents: inv.amountCents,
      balance_cents: inv.balanceCents,
      // US dollars at the rate QuickBooks booked on the invoice, so revenue
      // matches the books; today's rate only when QuickBooks sent none.
      ...invoiceUsdColumns(inv.amountCents, inv.balanceCents, inv.currency, inv.exchangeRate ?? fallbackRate.get(inv.currency) ?? null),
      status: deriveStatus(inv),
      // Recurring or project, from the line items (finance/lib/invoice-kind.ts);
      // the Billing tab splits the invoiced-by-month chart on it.
      kind: classifyInvoiceKind(inv.lines, inv.memo),
      memo: inv.memo,
      customer_name: inv.customerName,
      lines: inv.lines,
      synced_at: new Date().toISOString(),
    });
  }

  if (rows.length > 0) {
    // Which of these are payments has to be decided BEFORE the upsert: the
    // stored status is the only thing that can tell a payment from a row this
    // mirror has already written a dozen times, and the upsert overwrites it
    // (S.2). Finance owns both the rule and the read; this pass only carries
    // them either side of its own write.
    const mirrored = rows as MirroredInvoice[];
    // No candidates, no upsert: the upsert overwrites the only row that can show
    // a payment happened, so a pass that cannot read it writes nothing and the
    // next pass sees the transition intact (S.19.1).
    let candidates: StoredInvoice[];
    try {
      candidates = await paymentCandidatesFor(mirrored);
    } catch (err) {
      return { ...base, error: err instanceof Error ? err.message : String(err), fetched: listed.invoices.length };
    }
    const facts = paidTransitions(mirrored, candidates, saigonToday());

    const { error } = await upsertInvoices(rows, { onConflict: "source,entity,external_id" });
    if (error) return { ...base, error: error.message, fetched: listed.invoices.length };

    // Announced only once the ledger actually says paid. A subscriber that
    // acted on a payment the upsert then failed to write would be reacting to
    // a row that does not say what it thinks.
    await announceInvoicesPaid(facts);
    // Each status the sync changed goes on the invoice's own history, which the
    // shelf's History tab reads; nothing wrote it before (S.19.8).
    await recordAuditMany(statusChanges(mirrored, candidates));
  }

  const startErr = await fillClientStartDates(rows);
  if (startErr) return { ...base, error: startErr, fetched: listed.invoices.length, upserted: rows.length };

  return {
    entity,
    ok: true,
    fetched: listed.invoices.length,
    upserted: rows.length,
    unmappedCount: [...unmapped.values()].reduce((s, u) => s + u.count, 0),
    unmapped: [...unmapped.values()].sort((a, b) => b.count - a.count),
  };
}

// The invoices whose status this pass changed, as audit rows. The candidates
// are the stored rows read before the upsert, every one that was not yet paid
// or voided, so a row whose incoming status differs from its stored one moved.
function statusChanges(incoming: MirroredInvoice[], stored: StoredInvoice[]): AuditInput[] {
  const key = (r: { source: string; entity: string; external_id: string }) => `${r.source}|${r.entity}|${r.external_id}`;
  const before = new Map(stored.map((r) => [key(r), r]));
  return incoming.flatMap((r) => {
    const was = before.get(key(r));
    if (!was || was.status === r.status) return [];
    return [{
      table: "invoices",
      recordId: was.id,
      operation: "update" as const,
      actor: "QuickBooks sync",
      oldData: { status: was.status },
      newData: { status: r.status },
    }];
  });
}
