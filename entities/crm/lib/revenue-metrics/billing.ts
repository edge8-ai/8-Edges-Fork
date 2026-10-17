import { isVoided, selectInvoices } from "@/entities/finance";
import { selectPipelineStages } from "@/entities/crm/lib/reads";
import { dealsForBilling, type BillingDeal } from "./deals";
import { arBucket, cents, collectErrors, compared, countBy, dealState, invoiceBalanceUsd, invoiceUnconverted, invoiceUsd, lastMonths, monthKey, monthLabel, nextMonths, rangeWindows, usdOf, AR_BUCKETS, DEFAULT_RANGE, type BucketCount, type Compared, type Loaded, type MonthPoint, type Range, type StageFlags } from "./shared";

// The Billing tab's figures (RH-3, widened 2026-09-13): what was invoiced by
// month split into the recurring book and project billing, what is owed and
// how old it is, and for each won deal how much of it has been billed through
// the invoice links. Invoices are QuickBooks' mirror; the kind and the deal
// link are ours.

export type BillingInvoice = { id: string; doc_number: string | null; customer_name: string | null; amount_cents: number | null; amount_usd_cents: number | null; balance_cents: number | null; balance_usd_cents: number | null; currency: string | null; status: string | null; txn_date: string | null; due_date: string | null; deal_id: string | null; company_id: string | null; kind?: string | null };
export type { BillingDeal };

export type InvoicedPoint = MonthPoint<{ count: number; amount: number; recurring: number; project: number }>;
export type OverdueRow = { id: string; companyId: string | null; docNumber: string; customer: string; balance: number; dueDate: string | null; daysOverdue: number };
export type WonBilledRow = { dealId: string; title: string; wonUsd: number; billedUsd: number; invoices: number; closedAt: string | null };
// The three certainties the 90-day cash figure stacks, per month and in total.
export type CashPoint = MonthPoint<{ due: number; recurring: number; expected: number; total: number }>;
export type CashForecast = { months: CashPoint[]; due: number; recurring: number; expected: number; total: number; undatedBalance: number };

export type BillingMetrics = Loaded & {
  range: Range;
  invoices: number;
  invoicedInRange: Compared;
  recurringLastMonth: number;
  recurringShare: number | null;
  byMonth: InvoicedPoint[];
  byStatus: BucketCount[];
  openBalance: number;
  overdue: OverdueRow[];
  arAging: BucketCount[];
  wonBilled: WonBilledRow[];
  cash: CashForecast;
  unlinkedInvoices: number;
  wonWithoutInvoice: number;
  unclassified: number;
  /** Invoices in another currency: counted as nothing, reported as a gap. */
  foreignInvoices: number;
};

export type BillingInputs = { range?: Range; errors?: string[]; stages?: StageFlags[]; stagesLoaded?: boolean };

// Expected cash over the next three months, from three things that are already
// known rather than from a model. Deliberately independent of the tab's range:
// ninety days is ninety days, and a reader changing the period picker to look
// further back must not see the forecast move.
//
//   due       — open balances whose due date falls in that month, with
//               everything already past due landing in the first month,
//               because that is the month it would arrive in if chased now;
//   recurring — the last COMPLETE month's recurring invoicing, repeated. The
//               assumption is stated on the card: a lost retainer changes this
//               the next night;
//   expected  — open deals expected to close in that month, weighted by
//               probability, using the same open-deal test the Pipeline tab uses.
export function aggregateCashForecast(invoices: BillingInvoice[], deals: BillingDeal[], stages: StageFlags[], now: Date, stagesLoaded = true): CashForecast {
  const notVoid = invoices.filter((i) => !isVoided(i.status));
  const owed = notVoid.filter((i) => invoiceBalanceUsd(i) > 0);
  const months = nextMonths(3, now);
  const thisMonth = months[0];
  const today = now.toISOString().slice(0, 10);
  // The run rate is the last complete calendar month, never the current one:
  // a month two days old would drag the forecast down by a factor of fifteen.
  const lastComplete = lastMonths(2, now)[0];
  const recurringRate = Math.round(notVoid.filter((i) => i.kind === "recurring" && monthKey(i.txn_date) === lastComplete).reduce((a, i) => a + invoiceUsd(i), 0) / 100);
  const { isOpen } = dealState(stages);
  const openDeals = deals.filter(isOpen);
  // A balance with no due date cannot be placed in a month. It is reported as
  // its own figure rather than being dropped or guessed into month one.
  const undatedBalance = Math.round(owed.filter((i) => !i.due_date).reduce((a, i) => a + invoiceBalanceUsd(i), 0) / 100);

  // Which month an open balance is expected to arrive in: the month it falls
  // due, or this month when it is already past due, because that is when it
  // would land if it were chased now.
  const landsIn = (i: BillingInvoice, month: string): boolean => {
    if (!i.due_date) return false;
    return i.due_date < today ? month === thisMonth : monthKey(i.due_date) === month;
  };

  const points: CashPoint[] = months.map((month) => {
    const due = Math.round(owed.reduce((a, i) => (landsIn(i, month) ? a + invoiceBalanceUsd(i) : a), 0) / 100);
    // The run rate is an assumption about billing that has NOT HAPPENED YET,
    // so it must stand down for recurring whose cash is already accounted for
    // in this month. Two details decide that, and both are easy to get wrong.
    //
    // It is keyed on the invoice's own DUE month, the same axis `due` uses —
    // not its transaction month. Under net-30 the two differ, and keying on
    // the transaction month stands the rate down in the month the invoice was
    // raised while `due` counts it in the month its cash lands: one retainer,
    // two months, counted twice. A $1,000 book read as $2,000.
    //
    // It uses the invoiced AMOUNT, not the outstanding balance. A retainer
    // already paid has no balance, and standing down by balance would re-add
    // the whole rate on top of cash that has already arrived — overstating by
    // a month of the book every month the book is collected.
    //
    // And it ignores the overdue sweep: an old past-due invoice lands in month
    // one because that is when chasing it would pay, but it is June's billing
    // arriving late, not September's, so it must not cancel September's rate.
    // An invoice with no due date is billing that happened but whose cash
    // cannot be placed in a month; `due` cannot count it, and it is reported
    // on its own as `undatedBalance`. The rate still stands down for it, by
    // its transaction month: for a CASH forecast the safe error is the one
    // that expects less, and assuming that billing again would be the one
    // that expects more.
    const billedMonthOf = (i: BillingInvoice) => monthKey(i.due_date) ?? monthKey(i.txn_date);
    const recurringBilledFor = Math.round(notVoid.reduce((a, i) => (i.kind === "recurring" && billedMonthOf(i) === month ? a + invoiceUsd(i) : a), 0) / 100);
    const recurring = Math.max(0, recurringRate - recurringBilledFor);
    // Without the stage flags a deal parked in a Closed Won stage with no
    // status reads as open, and its weighted value would inflate the forecast.
    // A failed stages read therefore contributes no expected closes at all.
    const expected = !stagesLoaded
      ? 0
      : Math.round(openDeals.filter((d) => monthKey(d.expected_close_date) === month).reduce((a, d) => a + (usdOf(d) * cents(d.probability)) / 100, 0) / 100);
    return { month, label: monthLabel(month), due, recurring, expected, total: due + recurring + expected };
  });

  return {
    months: points,
    due: points.reduce((a, p) => a + p.due, 0),
    recurring: points.reduce((a, p) => a + p.recurring, 0),
    expected: points.reduce((a, p) => a + p.expected, 0),
    total: points.reduce((a, p) => a + p.total, 0),
    undatedBalance,
  };
}

export function aggregateBilling(invoices: BillingInvoice[], deals: BillingDeal[], now: Date, inputs: BillingInputs = {}): BillingMetrics {
  const range = inputs.range ?? DEFAULT_RANGE;
  const { months, prior } = rangeWindows(range, now);
  const notVoid = invoices.filter((i) => !isVoided(i.status));
  // Only USD invoices contribute dollars; a foreign one counts as nothing
  // rather than being added at par (`invoiceUsd`), and is counted below.
  const dollars = (is: BillingInvoice[]) => Math.round(is.reduce((a, i) => a + invoiceUsd(i), 0) / 100);
  const byMonth: InvoicedPoint[] = months.map((month) => {
    const is = notVoid.filter((i) => monthKey(i.txn_date) === month);
    return {
      month,
      label: monthLabel(month),
      count: is.length,
      amount: dollars(is),
      recurring: dollars(is.filter((i) => i.kind === "recurring")),
      project: dollars(is.filter((i) => i.kind !== "recurring")),
    };
  });
  const invoicedIn = (keys: string[]) => dollars(notVoid.filter((i) => keys.includes(monthKey(i.txn_date) ?? "")));
  const owed = notVoid.filter((i) => invoiceBalanceUsd(i) > 0);
  const overdue = owed
    .filter((i) => i.due_date && new Date(i.due_date) < now)
    .map((i) => ({
      id: i.id,
      // Carried so the collections queue can find the client's chase log
      // without a second pass over the invoices.
      companyId: i.company_id,
      docNumber: i.doc_number ?? "—",
      customer: i.customer_name ?? "Unknown customer",
      balance: Math.round(invoiceBalanceUsd(i) / 100),
      dueDate: i.due_date,
      daysOverdue: Math.floor((now.getTime() - new Date(i.due_date as string).getTime()) / 86_400_000),
    }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue);
  // Receivable aging: every open balance in a bucket by how far past due it is.
  // An invoice without a due date is current; it cannot be late.
  const aging = Object.fromEntries(AR_BUCKETS.map((b) => [b, 0])) as Record<(typeof AR_BUCKETS)[number], number>;
  for (const i of owed) {
    const days = i.due_date ? Math.floor((now.getTime() - new Date(i.due_date).getTime()) / 86_400_000) : 0;
    aging[arBucket(days)] += Math.round(invoiceBalanceUsd(i) / 100);
  }
  const won = deals.filter((d) => !d.archived_at && d.status === "won");
  const linkedByDeal = new Map<string, BillingInvoice[]>();
  for (const i of notVoid) {
    if (!i.deal_id) continue;
    linkedByDeal.set(i.deal_id, [...(linkedByDeal.get(i.deal_id) ?? []), i]);
  }
  const wonBilled = won
    .map((d) => {
      const linked = linkedByDeal.get(d.id) ?? [];
      return {
        dealId: d.id,
        title: d.title ?? "Untitled deal",
        wonUsd: Math.round(usdOf(d) / 100),
        // Invoices carry no USD normalisation; only USD invoices are summed.
        billedUsd: Math.round(linked.reduce((a, i) => a + invoiceUsd(i), 0) / 100),
        invoices: linked.length,
        closedAt: d.closed_at,
      };
    })
    .sort((a, b) => (b.closedAt ?? "").localeCompare(a.closedAt ?? ""));
  const lastMonth = byMonth[byMonth.length - 1];
  const recurringTotal = byMonth.reduce((a, m) => a + m.recurring, 0);
  const total = byMonth.reduce((a, m) => a + m.amount, 0);
  return {
    errors: inputs.errors ?? [],
    range,
    invoices: invoices.length,
    invoicedInRange: compared(invoicedIn(months), invoicedIn(prior)),
    recurringLastMonth: lastMonth?.recurring ?? 0,
    recurringShare: total > 0 ? Math.round((100 * recurringTotal) / total) : null,
    byMonth,
    byStatus: countBy(invoices, (i) => i.status || "unknown"),
    openBalance: Math.round(owed.reduce((a, i) => a + invoiceBalanceUsd(i), 0) / 100),
    overdue,
    arAging: AR_BUCKETS.map((label) => ({ label, value: aging[label] })),
    wonBilled,
    cash: aggregateCashForecast(invoices, deals, inputs.stages ?? [], now, inputs.stagesLoaded ?? true),
    unlinkedInvoices: notVoid.filter((i) => !i.deal_id).length,
    wonWithoutInvoice: wonBilled.filter((r) => r.invoices === 0).length,
    unclassified: notVoid.filter((i) => !i.kind).length,
    foreignInvoices: notVoid.filter((i) => invoiceUnconverted(i)).length,
  };
}

export async function loadBilling(range: Range = DEFAULT_RANGE, now = new Date()): Promise<BillingMetrics> {
  const [invRes, dealsRes, stagesRes] = await Promise.all([
    selectInvoices("id, doc_number, customer_name, amount_cents, amount_usd_cents, balance_cents, balance_usd_cents, currency, status, txn_date, due_date, deal_id, company_id, kind").limit(5000),
    dealsForBilling(),
    // Stages carry the won/lost flags the shared open-deal test reads, so the
    // cash forecast counts the same deals the Pipeline tab calls open.
    selectPipelineStages("id, is_won, is_lost"),
  ]);
  const errors = collectErrors({ error: invRes.error, label: "invoices" }, { error: dealsRes.error, label: "deals" }, { error: stagesRes.error, label: "pipeline stages" });
  return aggregateBilling((invRes.data ?? []) as BillingInvoice[], (dealsRes.data ?? []) as BillingDeal[], now, {
    range,
    errors,
    stages: (stagesRes.data ?? []) as unknown as StageFlags[],
    stagesLoaded: !stagesRes.error,
  });
}
