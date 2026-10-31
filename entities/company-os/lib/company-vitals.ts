// The company's four vitals (revenue, pipeline, headcount, open issues), as the
// Company Dashboard's top row and the Admin Home's Company card both show them
// (AH.2.2). The arithmetic lives here once so the two screens cannot drift; the
// reads stay in each route, because they cross into crm and org, which this
// entity's library does not require.
import { invoiceUsd } from "@/entities/finance";
import { MS_DAY } from "./dashboard-helpers";

type UsdAmount = Parameters<typeof invoiceUsd>[0];
export type VitalsInvoice = UsdAmount & { txn_date: string | null; entity: string | null };
export type VitalsOrder = { created_at: string; amount_usd_cents: number | null; status: string | null };
export type VitalsDeal = { status: string | null; amount_usd_cents: number | null; created_at: string };

/**
 * Cash between two ISO dates, `from` inclusive and `to` exclusive: QuickBooks
 * invoices by transaction date (one legal entity, or both) plus paid Stripe
 * orders by the day they were placed.
 */
export function cashCounter(invoices: readonly VitalsInvoice[], orders: readonly VitalsOrder[]) {
  const dated = invoices.filter((i) => i.txn_date);
  const paid = orders.filter((o) => o.status === "paid");
  const invoiceCash = (from: string, to: string, entity?: "edge8" | "aio") =>
    dated.reduce(
      (s, i) => (i.txn_date! >= from && i.txn_date! < to && (!entity || i.entity === entity) ? s + invoiceUsd(i) : s),
      0,
    );
  const stripeCash = (from: string, to: string) =>
    paid.reduce((s, o) => {
      const d = o.created_at.slice(0, 10);
      return d >= from && d < to ? s + (o.amount_usd_cents ?? 0) : s;
    }, 0);
  return { invoiceCash, stripeCash, cashBetween: (from: string, to: string) => invoiceCash(from, to) + stripeCash(from, to) };
}

export type CompanyVitals = {
  /** Cents received in the last 30 days, both entities and Stripe. */
  cash30: number;
  cash30Edge8: number;
  cash30Aio: number;
  /** Cents in open deals. */
  openPipeline: number;
  openDeals: number;
  dealsAdded30: number;
  headcount: number;
  openIssues: number;
};

export function companyVitals(
  input: {
    invoices: readonly VitalsInvoice[];
    orders: readonly VitalsOrder[];
    deals: readonly VitalsDeal[];
    team: readonly { status: string | null }[];
    openIssues: number;
  },
  now: Date,
): CompanyVitals {
  const tomorrow = new Date(now.getTime() + MS_DAY).toISOString().slice(0, 10);
  const date30 = new Date(now.getTime() - 30 * MS_DAY).toISOString().slice(0, 10);
  const iso30 = new Date(now.getTime() - 30 * MS_DAY).toISOString();
  const { invoiceCash, stripeCash, cashBetween } = cashCounter(input.invoices, input.orders);
  const open = input.deals.filter((d) => d.status === "open");
  return {
    cash30: cashBetween(date30, tomorrow),
    cash30Edge8: invoiceCash(date30, tomorrow, "edge8") + stripeCash(date30, tomorrow),
    cash30Aio: invoiceCash(date30, tomorrow, "aio"),
    openPipeline: open.reduce((s, d) => s + (d.amount_usd_cents ?? 0), 0),
    openDeals: open.length,
    dealsAdded30: input.deals.filter((d) => d.created_at >= iso30).length,
    headcount: input.team.filter((t) => t.status === "active").length,
    openIssues: input.openIssues,
  };
}
