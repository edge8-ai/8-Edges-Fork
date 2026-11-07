// An invoice's value in US dollars, our reporting currency. Every revenue sum
// goes through these helpers, never through amount_cents: amount_cents is the
// invoice as the client sees it, in the client's currency, and adding it
// across currencies is how A$15,000 once read as US$15,000 on the Company
// Dashboard.
//
// amount_usd_cents is written by the QuickBooks sync at the exchange rate
// QuickBooks records on the invoice, so it matches the books and never moves
// with today's rate. A USD invoice without it is still its own amount. A
// foreign invoice without it has not been converted yet: it counts nothing
// rather than its face value, and callers count it as unconverted so the gap
// has a number.
//
// The row types name every column the helpers read as required, so a select
// that leaves one out fails the type check instead of reading as zero.

type UsdAmountRow = { amount_cents: number | null; amount_usd_cents: number | null; currency: string | null };
type UsdBalanceRow = { balance_cents: number | null; balance_usd_cents: number | null; currency: string | null };

const whole = (n: number | null | undefined): number => (typeof n === "number" && Number.isFinite(n) ? n : 0);

export const invoiceIsUsd = (i: { currency?: string | null }): boolean => (i.currency ?? "usd").toLowerCase() === "usd";

export const invoiceUsd = (i: UsdAmountRow): number =>
  i.amount_usd_cents != null ? whole(i.amount_usd_cents) : invoiceIsUsd(i) ? whole(i.amount_cents) : 0;

export const invoiceBalanceUsd = (i: UsdBalanceRow): number =>
  i.balance_usd_cents != null ? whole(i.balance_usd_cents) : invoiceIsUsd(i) ? whole(i.balance_cents) : 0;

// A foreign-currency invoice the sync has not converted yet.
export const invoiceUnconverted = (i: { amount_usd_cents: number | null; currency: string | null }): boolean =>
  i.amount_usd_cents == null && !invoiceIsUsd(i);

// The three USD columns for an invoice at `rate` US dollars per unit of its
// currency, or nulls when there is no rate. The sync writes these on every
// upsert, so they follow the amount and the balance as QuickBooks changes them.
export function invoiceUsdColumns(
  amountCents: number,
  balanceCents: number,
  currency: string,
  rate: number | null,
): { amount_usd_cents: number | null; balance_usd_cents: number | null; fx_rate: number | null } {
  const r = currency.toLowerCase() === "usd" ? 1 : rate;
  if (r == null || !Number.isFinite(r) || r <= 0) return { amount_usd_cents: null, balance_usd_cents: null, fx_rate: null };
  return { amount_usd_cents: Math.round(amountCents * r), balance_usd_cents: Math.round(balanceCents * r), fx_rate: r };
}
