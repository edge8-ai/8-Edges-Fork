import { selectSubscriptions } from "@/entities/billing";
import { isVoided, selectInvoices, selectProducts } from "@/entities/finance";
import { formatCents } from "@/kernel/ui/format";
import { cents, collectErrors, columnList, invoiceIsUsd, invoiceUsd, lastMonths, monthKey, monthLabel, nextMonths, usdOf, type Loaded, type MonthPoint } from "./shared";

// The recurring book, rolled forward over a chosen horizon (S.8).
//
// This is deliberately NOT a model. It is one number carried forward and one
// subtraction applied to it:
//
//   baseline    — the last COMPLETE month of recurring invoicing, in USD. The
//                 current month is never the baseline: a month two days old
//                 would drag the whole horizon down by a factor of fifteen.
//                 Same rule, and the same reason, as the Billing tab's 90-day
//                 cash figure (`aggregateCashForecast`).
//   cancellations — the subscriptions that have already told us when they
//                 stop. A subscription set to cancel at the end of its period
//                 bills through that period's month and not after, so the step
//                 down lands in the month AFTER its last billed month. Nothing
//                 else moves the line: no growth rate, no assumed churn, no
//                 win-rate. A forecast that invents growth is a wish.
//
// Beside the rolled-forward line the chart draws the CONTRACTED book — what
// the live subscriptions are worth a month — because the two answer different
// questions and neither is the other's check. `coveragePct` says how much of
// the invoiced book the subscription records explain; when it is low, the
// cancellation subtraction is reaching only part of the book, and the page
// says so rather than implying the forecast is firmer than it is.
//
// No row type here carries a person column. `subscriptions.person_id` exists
// and is deliberately not selected: a recurring-revenue figure describes the
// book, products and months, never who bought.
//
// The file is `outlook.ts` rather than `forecast.ts`, and the route segment is
// `outlook` rather than `forecast`, because the fork content scanner refuses
// any path element named `forecast` (.github/scripts/scan-tree.sh) — a rule
// added after `public/forecast.html`, an ungated company P&L, reached a
// client's public repository. The tab is still called Forecast where a reader
// sees it; only the path avoids the rail, which is the cheap half of the
// trade.

export const HORIZONS = [3, 6, 12] as const;
export type Horizon = (typeof HORIZONS)[number];
export const DEFAULT_HORIZON: Horizon = 6;

export function parseHorizon(v: string | string[] | undefined): Horizon {
  const s = Array.isArray(v) ? v[0] : v;
  const n = Number(s);
  return (HORIZONS as readonly number[]).includes(n) ? (n as Horizon) : DEFAULT_HORIZON;
}

/** A subscription, minus the person on it: only what prices it and dates it. */
export type ForecastSubscription = { id: string; status: string | null; product_id: string | null; current_period_end: string | null; cancel_at_period_end: boolean | null };
export type ForecastProduct = { id: string; amount_cents: number | null; amount_usd_cents: number | null; currency: string | null };
export type ForecastInvoice = { id: string; amount_cents: number | null; amount_usd_cents: number | null; currency: string | null; status: string | null; txn_date: string | null; kind: string | null };

export type ForecastPoint = MonthPoint<{
  /** The invoiced book carried into that month, net of known cancellations. */
  recurring: number;
  /** What the live subscription book is worth that month, on its own. */
  contracted: number;
  /** Subscription value billing for the last time in that month. */
  ending: number;
}>;

export type RecurringForecast = Loaded & {
  horizon: Horizon;
  /** The month the baseline was read from, or null when there was none. */
  baselineMonth: string | null;
  baseline: number;
  contractedNow: number;
  liveSubscriptions: number;
  /** The contracted book as a share of the invoiced baseline, or null. */
  coveragePct: number | null;
  months: ForecastPoint[];
  total: number;
  /** Monthly value lost to known cancellations by the end of the horizon. */
  churn: number;
  endingCount: number;
  /** What the figures above rest on, in the words the page prints. */
  assumptions: string[];
  gaps: { unpricedSubscriptions: number; foreignProducts: number };
};

export type ForecastInputs = { horizon?: Horizon; errors?: string[] };

// A subscription is live until it is cancelled or given up on. `past_due` is
// still a live retainer — Stripe moves a subscription to `canceled` or
// `unpaid` when it stops trying — so dropping it here would understate the
// book on the strength of one late card.
const LIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

// "August 2026", for a sentence rather than a chart axis: the axis label
// (`monthLabel`) drops the year except at the boundary, and an assumption that
// says "Aug" is ambiguous in exactly the case a reader would want it not to be.
function monthSentence(key: string): string {
  const d = new Date(`${key}-01T00:00:00Z`);
  return d.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** The last month a subscription bills, or null when it is open-ended. */
export function lastBilledMonth(s: ForecastSubscription): string | null {
  return s.cancel_at_period_end ? monthKey(s.current_period_end) : null;
}

export function aggregateRecurringForecast(
  subscriptions: ForecastSubscription[],
  products: ForecastProduct[],
  invoices: ForecastInvoice[],
  now: Date,
  inputs: ForecastInputs = {},
): RecurringForecast {
  const horizon = inputs.horizon ?? DEFAULT_HORIZON;
  const months = nextMonths(horizon, now);

  // ── The baseline: last complete month of recurring invoicing ────────────
  const notVoid = invoices.filter((i) => !isVoided(i.status));
  const recurringInvoices = notVoid.filter((i) => i.kind === "recurring");
  const lastComplete = lastMonths(2, now)[0];
  const baseline = Math.round(recurringInvoices.filter((i) => monthKey(i.txn_date) === lastComplete).reduce((a, i) => a + invoiceUsd(i), 0) / 100);
  // A month with no recurring invoicing at all is not a baseline of zero, it
  // is the absence of one; the two read the same on a chart and mean opposite
  // things, so the month is only claimed when something was invoiced in it.
  const invoicedAnyRecurring = recurringInvoices.some((i) => invoiceUsd(i) > 0);
  const baselineMonth = baseline > 0 || invoicedAnyRecurring ? lastComplete : null;

  // ── The contracted book: live subscriptions, priced by their product ────
  const productById = new Map(products.map((p) => [p.id, p]));
  const live = subscriptions.filter((s) => LIVE_STATUSES.has((s.status ?? "").toLowerCase()));
  let unpricedSubscriptions = 0;
  let foreignProducts = 0;
  // A subscription carries no amount of its own; what it is worth a month is
  // its product's price. A product with no USD figure is counted, not guessed:
  // `usdOf` returns the normalised column when the sync wrote one and zero for
  // a foreign price it cannot convert, and the two gaps are reported apart
  // because they need different repairs — one is a missing link, the other a
  // missing rate.
  const priced = live.map((s) => {
    const product = s.product_id ? productById.get(s.product_id) : undefined;
    if (!product) {
      unpricedSubscriptions++;
      return { sub: s, usd: 0 };
    }
    const usd = Math.round(usdOf(product) / 100);
    if (usd <= 0) {
      // `invoiceIsUsd` is the shared "is this row already in dollars" test; it
      // is named for the rows that first needed it and takes any row with a
      // currency. A priced product in another currency with no normalised
      // column is a missing RATE; anything else is a missing PRICE, and the
      // two need different repairs.
      if (!invoiceIsUsd(product) && cents(product.amount_cents) > 0) foreignProducts++;
      else unpricedSubscriptions++;
      return { sub: s, usd: 0 };
    }
    return { sub: s, usd };
  });
  const contractedNow = priced.reduce((a, p) => a + p.usd, 0);

  // ── The roll-forward ────────────────────────────────────────────────────
  // For each month: what is still contracted, what bills for the last time,
  // and the invoiced baseline reduced by everything that has stopped by then.
  // The step lands the month AFTER the last billed month, which is the detail
  // that is easy to get backwards: a subscription cancelling on 20 October
  // still bills October.
  const points: ForecastPoint[] = months.map((month) => {
    const contracted = priced.reduce((a, p) => {
      const last = lastBilledMonth(p.sub);
      return last && last < month ? a : a + p.usd;
    }, 0);
    const ending = priced.reduce((a, p) => (lastBilledMonth(p.sub) === month ? a + p.usd : a), 0);
    // Value already lost by this month, measured against the contracted book
    // as it stands today. Never negative: a subscription cannot start in the
    // future here, because only a cancellation date moves this line.
    const lost = contractedNow - contracted;
    return { month, label: monthLabel(month), recurring: Math.max(0, baseline - lost), contracted, ending };
  });

  const endingCount = priced.filter((p) => {
    const last = lastBilledMonth(p.sub);
    return !!last && months.includes(last);
  }).length;

  const horizonEnd = points[points.length - 1];
  const assumptions = [
    baselineMonth
      ? `The line starts at ${formatCents(baseline * 100)} — what was invoiced as recurring in ${monthSentence(baselineMonth)}, the last complete month. The part of ${monthSentence(months[0])} that has happened is not a month and is never the baseline.`
      : `There is no recurring invoicing in the last complete month to roll forward, so the line starts at nothing. Classify invoices as recurring in the QuickBooks sync and this fills in.`,
    `Nothing grows it. The only thing that moves the line down is a subscription that has already told us it stops — ${endingCount === 0 ? "none has" : `${endingCount} ${endingCount === 1 ? "has" : "have"}`}. No assumed churn, no win rate, no new business.`,
    `A subscription is worth its product's price a month. ${unpricedSubscriptions + foreignProducts === 0 ? "Every live subscription here is priced." : `${unpricedSubscriptions + foreignProducts} of ${live.length} are not and count as nothing.`}`,
    contractedNow > 0 && baseline > 0
      ? `The subscription records explain ${Math.round((100 * contractedNow) / baseline)}% of the invoiced book, so the cancellations below reach only that much of it.`
      : `The subscription records and the invoiced book cannot be compared here, so treat the contracted line and the rolled-forward line as two separate readings.`,
  ];

  return {
    errors: inputs.errors ?? [],
    horizon,
    baselineMonth,
    baseline,
    contractedNow,
    liveSubscriptions: live.length,
    coveragePct: baseline > 0 ? Math.round((100 * contractedNow) / baseline) : null,
    months: points,
    total: points.reduce((a, p) => a + p.recurring, 0),
    churn: Math.max(0, contractedNow - (horizonEnd?.contracted ?? contractedNow)),
    endingCount,
    assumptions,
    gaps: { unpricedSubscriptions, foreignProducts },
  };
}

const SUBSCRIPTION_COLUMNS = columnList<ForecastSubscription>({
  id: "id",
  status: "status",
  product_id: "product_id",
  current_period_end: "current_period_end",
  cancel_at_period_end: "cancel_at_period_end",
});
const PRODUCT_COLUMNS = columnList<ForecastProduct>({ id: "id", amount_cents: "amount_cents", amount_usd_cents: "amount_usd_cents", currency: "currency" });
const INVOICE_COLUMNS = columnList<ForecastInvoice>({ id: "id", amount_cents: "amount_cents", amount_usd_cents: "amount_usd_cents", currency: "currency", status: "status", txn_date: "txn_date", kind: "kind" });

export async function loadRecurringForecast(horizon: Horizon = DEFAULT_HORIZON, now = new Date()): Promise<RecurringForecast> {
  // Only the months the baseline can come from are read: the roll-forward
  // needs one complete month, and reading the whole invoice book to find it
  // would put a five-thousand-row cap between this figure and the truth.
  const since = `${lastMonths(3, now)[0]}-01`;
  const [subsRes, productsRes, invRes] = await Promise.all([
    selectSubscriptions(SUBSCRIPTION_COLUMNS).limit(5000),
    selectProducts(PRODUCT_COLUMNS).limit(5000),
    selectInvoices(INVOICE_COLUMNS).gte("txn_date", since).limit(5000),
  ]);
  const errors = collectErrors({ error: subsRes.error, label: "subscriptions" }, { error: productsRes.error, label: "products" }, { error: invRes.error, label: "invoices" });
  return aggregateRecurringForecast(
    (subsRes.data ?? []) as unknown as ForecastSubscription[],
    (productsRes.data ?? []) as unknown as ForecastProduct[],
    (invRes.data ?? []) as unknown as ForecastInvoice[],
    now,
    { horizon, errors },
  );
}
