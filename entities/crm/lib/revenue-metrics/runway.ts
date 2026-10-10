import { isCollectible, isVoided, selectContractorPayments, selectExpenses, selectFxRates, selectInvoices } from "@/entities/finance";
import { formatCents } from "@/kernel/ui/format";
import { cents, collectErrors, columnList, invoiceBalanceUsd, invoiceUnconverted, lastMonths, monthKey, monthLabel, nextMonths, type Loaded, type MonthPoint } from "./shared";
import { DEFAULT_HORIZON, type Horizon } from "./outlook";

// Runway: cash in from what is already owed, netted against what the business
// actually cost in the last complete months (S.8).
//
// The honest part of this module is what it refuses to claim. Company OS
// records no bank balance anywhere, so this is NOT "cash on hand divided by
// burn". It is the collectible receivable pool divided by burn — the runway
// the invoices alone buy — and the page says so in those words. Adding an
// opening balance nobody entered would turn a defensible floor into a number
// with no source.
//
// Two directions, two rules, and the asymmetry is deliberate:
//
//   cash in  — a USD open balance, placed in the month it falls due, with
//              everything already past due swept into this month because that
//              is when it would land if it were chased now. Same rule as the
//              Billing tab's 90-day figure, so the two cannot disagree. A
//              foreign receivable counts as NOTHING: the invoice mirror
//              carries no USD column, and understating what comes in is the
//              safe error for a runway.
//   burn     — every expense and contractor payment in the lookback window,
//              converted through finance's FX table when it is not in USD.
//              Understating cost flatters the runway, so here the effort goes
//              the other way: a row is converted where a rate exists and
//              COUNTED as a gap where none does, never quietly dropped.
//
// No row type here carries a person column. `contractor_payments.person_id`
// exists and is deliberately not selected: burn is a figure about the
// business, and slicing it by who was paid is the thing this repo does not do.

/** How many complete months the burn rate averages over. */
export const BURN_LOOKBACK_MONTHS = 3;

export type RunwayInvoice = { id: string; balance_cents: number | null; balance_usd_cents: number | null; amount_usd_cents: number | null; currency: string | null; status: string | null; due_date: string | null };
export type RunwayExpense = { id: string; amount_cents: number | null; currency: string | null; incurred_on: string | null };
export type RunwayPayment = { id: string; amount_cents: number | null; currency: string | null; period_month: string | null };
export type FxRate = { currency: string; rate_to_usd: number | null };

export type RunwayPoint = MonthPoint<{ cashIn: number; burn: number; net: number; cumulative: number }>;

export type Runway = Loaded & {
  horizon: Horizon;
  months: RunwayPoint[];
  /** Every dated open USD balance: the pool the runway figure divides. */
  collectible: number;
  /** Open balance with no due date, which cannot be placed in a month. */
  undatedBalance: number;
  burnMonthly: number;
  expenseBurn: number;
  contractorBurn: number;
  burnFromMonths: string[];
  cashInTotal: number;
  burnTotal: number;
  netTotal: number;
  /** Months the collectible pool covers at that burn, or null when nothing was spent. */
  runwayMonths: number | null;
  // A cost read failed, so burn is unknown and no runway figure is given.
  costsIncomplete: boolean;
  /** The first month the running position goes below zero, or null. */
  firstNegativeMonth: string | null;
  assumptions: string[];
  gaps: { unconvertedCostRows: number; foreignReceivables: number };
};

// costsIncomplete: an expenses, contractor-payments or FX read failed. The
// burn would then be understated and the runway longer than it is, the one
// direction an error here must not go, so the figure is withheld (S.19.3).
export type RunwayInputs = { horizon?: Horizon; errors?: string[]; costsIncomplete?: boolean };

// "June 2026", for a sentence rather than a chart axis (see outlook.ts).
function monthSentence(key: string): string {
  const d = new Date(`${key}-01T00:00:00Z`);
  return d.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/**
 * A cost row in USD cents, or null when it cannot be converted. Null is the
 * caller's signal to count a gap: a cost silently read as zero is the one
 * error that makes a runway longer than it is.
 */
export function costUsdCents(row: { amount_cents: number | null; currency: string | null }, rates: Map<string, number>): number | null {
  const amount = cents(row.amount_cents);
  const currency = (row.currency ?? "usd").toLowerCase();
  if (currency === "usd") return amount;
  const rate = rates.get(currency);
  if (!rate || !Number.isFinite(rate) || rate <= 0) return null;
  return Math.round(amount * rate);
}

export function aggregateRunway(
  invoices: RunwayInvoice[],
  expenses: RunwayExpense[],
  payments: RunwayPayment[],
  fx: FxRate[],
  now: Date,
  inputs: RunwayInputs = {},
): Runway {
  const horizon = inputs.horizon ?? DEFAULT_HORIZON;
  const months = nextMonths(horizon, now);
  const thisMonth = months[0];
  const today = now.toISOString().slice(0, 10);

  // ── Burn: the last complete months, never the current one ──────────────
  // A month two days old would read as a near-zero burn and turn a three-month
  // runway into a three-year one, which is the most dangerous rounding error
  // on this page.
  const burnFromMonths = lastMonths(BURN_LOOKBACK_MONTHS + 1, now).slice(0, BURN_LOOKBACK_MONTHS);
  const burnWindow = new Set(burnFromMonths);
  const rates = new Map(fx.filter((r) => typeof r.rate_to_usd === "number").map((r) => [r.currency.toLowerCase(), r.rate_to_usd as number]));
  let unconvertedCostRows = 0;
  const sumCost = <T extends { amount_cents: number | null; currency: string | null }>(rows: T[], monthOf: (r: T) => string | null): number => {
    let total = 0;
    for (const r of rows) {
      const month = monthOf(r);
      if (!month || !burnWindow.has(month)) continue;
      const usd = costUsdCents(r, rates);
      if (usd === null) {
        unconvertedCostRows++;
        continue;
      }
      total += usd;
    }
    return total;
  };
  const expenseCents = sumCost(expenses, (e) => monthKey(e.incurred_on));
  const contractorCents = sumCost(payments, (p) => monthKey(p.period_month));
  const perMonth = (total: number) => Math.round(total / BURN_LOOKBACK_MONTHS / 100);
  const expenseBurn = perMonth(expenseCents);
  const contractorBurn = perMonth(contractorCents);
  const burnMonthly = expenseBurn + contractorBurn;

  // ── Cash in: open balances, placed in the month they land ──────────────
  // "Voided" is finance's word, not ours — it owns the invoices table, so the
  // test comes from its door rather than a literal repeated here. That is the
  // S.2/S.8 collision closed: both modules now read the same vocabulary while
  // still asking their own question of it (finance/lib/invoice-status.ts).
  // Ours is a question about the BALANCE, because runway is an amount.
  const notVoid = invoices.filter((i) => !isVoided(i.status));
  const foreignReceivables = notVoid.filter((i) => invoiceUnconverted(i) && cents(i.balance_cents) > 0).length;
  const owed = invoices.filter((i) => isCollectible(i, invoiceBalanceUsd(i)));
  const undatedBalance = Math.round(owed.filter((i) => !i.due_date).reduce((a, i) => a + invoiceBalanceUsd(i), 0) / 100);
  const collectible = Math.round(owed.filter((i) => i.due_date).reduce((a, i) => a + invoiceBalanceUsd(i), 0) / 100);
  const landsIn = (i: RunwayInvoice, month: string): boolean => {
    if (!i.due_date) return false;
    return i.due_date < today ? month === thisMonth : monthKey(i.due_date) === month;
  };

  let cumulative = 0;
  const points: RunwayPoint[] = months.map((month) => {
    const cashIn = Math.round(owed.reduce((a, i) => (landsIn(i, month) ? a + invoiceBalanceUsd(i) : a), 0) / 100);
    const net = cashIn - burnMonthly;
    cumulative += net;
    return { month, label: monthLabel(month), cashIn, burn: burnMonthly, net, cumulative };
  });

  const costsIncomplete = inputs.costsIncomplete ?? false;
  const assumptions = [
    ...(costsIncomplete
      ? ["A cost read failed, so the burn below is missing whatever it could not read. No runway figure is given until it reads in full: a partial burn would make the runway look longer than it is."]
      : []),
    `No bank balance is recorded anywhere in Company OS, so this is not cash on hand. It is the runway the receivables alone buy: ${formatCents(collectible * 100)} already invoiced and not yet paid. Whatever is in the bank is on top of it.`,
    burnMonthly > 0
      ? `Burn is the average of ${monthSentence(burnFromMonths[0])} to ${monthSentence(burnFromMonths[burnFromMonths.length - 1])} — ${formatCents(expenseBurn * 100)} of expenses and ${formatCents(contractorBurn * 100)} of contractor payments a month — repeated. This month is half over and is never in that average.`
      : `Nothing was recorded as spent between ${monthSentence(burnFromMonths[0])} and ${monthSentence(burnFromMonths[burnFromMonths.length - 1])}, so there is no burn rate to divide by and no runway figure. That is a gap in the books, not a month that cost nothing.`,
    `An invoice already past due is counted in this month, because that is when it would arrive if it were chased now. ${undatedBalance > 0 ? `${formatCents(undatedBalance * 100)} of open balance has no due date and is in no month here.` : "Every open balance here has a due date."}`,
    `A receivable in another currency counts as nothing; a cost in another currency is converted through the FX table. Understating what comes in is the safe error, understating what goes out is not.${unconvertedCostRows > 0 ? ` ${unconvertedCostRows} cost ${unconvertedCostRows === 1 ? "row has" : "rows have"} no rate and are missing from the burn.` : ""}`,
  ];

  return {
    errors: inputs.errors ?? [],
    horizon,
    months: points,
    collectible,
    undatedBalance,
    burnMonthly,
    expenseBurn,
    contractorBurn,
    burnFromMonths,
    cashInTotal: points.reduce((a, p) => a + p.cashIn, 0),
    burnTotal: points.reduce((a, p) => a + p.burn, 0),
    netTotal: points.reduce((a, p) => a + p.net, 0),
    runwayMonths: burnMonthly > 0 && !costsIncomplete ? Math.round((10 * collectible) / burnMonthly) / 10 : null,
    firstNegativeMonth: costsIncomplete ? null : points.find((p) => p.cumulative < 0)?.month ?? null,
    costsIncomplete,
    assumptions,
    gaps: { unconvertedCostRows, foreignReceivables },
  };
}

const INVOICE_COLUMNS = columnList<RunwayInvoice>({ id: "id", balance_cents: "balance_cents", balance_usd_cents: "balance_usd_cents", amount_usd_cents: "amount_usd_cents", currency: "currency", status: "status", due_date: "due_date" });
const EXPENSE_COLUMNS = columnList<RunwayExpense>({ id: "id", amount_cents: "amount_cents", currency: "currency", incurred_on: "incurred_on" });
const PAYMENT_COLUMNS = columnList<RunwayPayment>({ id: "id", amount_cents: "amount_cents", currency: "currency", period_month: "period_month" });
const FX_COLUMNS = columnList<FxRate>({ currency: "currency", rate_to_usd: "rate_to_usd" });

export async function loadRunway(horizon: Horizon = DEFAULT_HORIZON, now = new Date()): Promise<Runway> {
  // The cost reads are bounded by the burn window, not just by a row cap. A
  // truncated cost read understates burn, which lengthens the runway — the
  // one direction an error here must not go (the same reasoning as
  // finance's delivery-cost loader).
  const burnFrom = `${lastMonths(BURN_LOOKBACK_MONTHS + 1, now)[0]}-01`;
  const [invRes, expRes, payRes, fxRes] = await Promise.all([
    selectInvoices(INVOICE_COLUMNS).gt("balance_cents", 0).limit(5000),
    selectExpenses(EXPENSE_COLUMNS).gte("incurred_on", burnFrom).limit(20000),
    // A rejected payment request is money that never went out; a pending one
    // is still owed, so it stays in the burn.
    selectContractorPayments(PAYMENT_COLUMNS).gte("period_month", burnFrom).neq("status", "rejected").limit(20000),
    selectFxRates(FX_COLUMNS).limit(500),
  ]);
  const errors = collectErrors(
    { error: invRes.error, label: "invoices" },
    { error: expRes.error, label: "expenses" },
    { error: payRes.error, label: "contractor payments" },
    { error: fxRes.error, label: "fx rates" },
  );
  return aggregateRunway(
    (invRes.data ?? []) as unknown as RunwayInvoice[],
    (expRes.data ?? []) as unknown as RunwayExpense[],
    (payRes.data ?? []) as unknown as RunwayPayment[],
    (fxRes.data ?? []) as unknown as FxRate[],
    now,
    { horizon, errors, costsIncomplete: Boolean(expRes.error || payRes.error || fxRes.error) },
  );
}
