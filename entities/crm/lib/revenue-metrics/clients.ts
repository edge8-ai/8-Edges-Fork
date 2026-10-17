import { companyOs } from "@/kernel/data/supabase";
import { isVoided, selectInvoices, loadDeliveryCost, type BilledMix, type DeliveryCost } from "@/entities/finance";
import { collectErrors, invoiceUnconverted, invoiceUsd, monthKey, rangeWindows, DEFAULT_RANGE, type Loaded, type Range } from "./shared";

// Who the money comes from and what it cost to earn (RF-2, RF-4, 2026-09-14).
//
// One aggregate serves three renderings — the concentration tile, the "Revenue
// by client" bars on Billing, and the clients revenue-and-margin table — so
// the three can never disagree about what a client was billed. The cost half
// comes through finance's one door (`loadDeliveryCost`); this file does no
// cost arithmetic of its own.
//
// The honesty rule this file exists to keep: a margin is a number only for a
// row whose OWN cost is attributed, and only when the cost read succeeded.
//
// Per-row matters more than it sounds. Attribution is deliberately partial —
// the column starts empty and fills by hand — so a single global "we have some
// cost" flag would flip every untagged client to a perfect margin the moment
// one expense anywhere got tagged. "No cost recorded" and "cost not attributed
// yet" are indistinguishable from here, and both must read unknown: printing
// 100% for a client nobody has tagged is the exact lie this file exists to
// prevent, and 100% is not even amber.
//
// An AGGREGATE needs a stricter rule than a row, and for the opposite reason.
// A kind row's cost is non-zero as soon as ONE client in it is tagged, while
// its billed column carries every client in it, tagged or not — so a per-row
// test would let "Project · billed $300k · cost $10k · 97%" sit above three
// client rows, two of which read unknown. An aggregate therefore shows a
// margin only when EVERY client contributing to its billed total has cost
// attributed. Until then it says unknown and reports how much billing has no
// cost behind it, which is the number that says how far the tagging has to go.

// Above this share of the period, one client is a concentration risk and the
// tile turns amber. One constant, read by the tile's tone and by its note.
export const CONCENTRATION_WARN_PCT = 25;
// Below this, a margin is thin enough to colour. Read by the card and the table.
export const THIN_MARGIN_PCT = 30;
// How many clients the Billing card names before the rest become "Others".
export const TOP_CLIENTS = 10;

export type ClientRow = {
  companyId: string | null;
  name: string;
  /** Whole USD invoiced in the period. */
  billed: number;
  /** Whole USD of delivery cost attributed to this client, 0 when none is. */
  cost: number;
  /** billed - cost, or null while THIS row has no attributed cost. */
  margin: number | null;
  /** Percentage, or null while this row has no attributed cost. */
  marginPct: number | null;
  /** Share of the period's invoiced total, as a percentage. */
  share: number;
  /** What kinds this client was billed under, for the row's second line. */
  kinds: string;
};

export type KindRow = { kind: string; billed: number; cost: number; margin: number | null; marginPct: number | null; share: number };

export type ClientMetrics = Loaded & {
  range: Range;
  totalBilled: number;
  clients: ClientRow[];
  /** The top clients plus an "Others" row, for the Billing card's bars. */
  topWithOthers: ClientRow[];
  largest: ClientRow | null;
  largestSharePct: number | null;
  top3SharePct: number | null;
  byKind: KindRow[];
  /** Delivery cost that names no client; its own row so totals reconcile. */
  unmappedCost: number;
  /** Spend nothing has classified. Reported, never counted into a margin. */
  untaggedSpend: number;
  /** Every delivery cost figure, mapped and unmapped, in whole USD. */
  totalCost: number;
  /** totalBilled - totalCost, or null when no cost is trustworthy. */
  totalMargin: number | null;
  totalMarginPct: number | null;
  /** Any delivery cost at all is known — for the card's meta and note. */
  costKnown: boolean;
  /** Every client with billing has cost attributed, so an aggregate margin is safe. */
  fullyAttributed: boolean;
  /** Whole USD billed to clients that have no attributed cost. */
  billedUnattributed: number;
  /** The cost read succeeded. False means every margin here reads unknown. */
  costTrusted: boolean;
  costGaps: DeliveryCost["gaps"];
};

export type ClientInvoice = { company_id: string | null; customer_name: string | null; amount_cents: number | null; amount_usd_cents: number | null; currency: string | null; status: string | null; txn_date: string | null; kind: string | null };
export type ClientCompany = { id: string; name: string };

const dollars = (c: number) => Math.round(c / 100);
const pct = (part: number, whole: number): number => (whole > 0 ? Math.round((100 * part) / whole) : 0);

// A margin is a number only when THIS row carries attributed cost and the cost
// read succeeded. A zero cost is not evidence of a free delivery; it is the
// absence of evidence, and the UI says "unknown" rather than printing the
// billed figure again under the heading "margin".
function marginOf(billed: number, cost: number, trusted: boolean): { margin: number | null; marginPct: number | null } {
  if (!trusted || cost <= 0) return { margin: null, marginPct: null };
  const margin = billed - cost;
  return { margin, marginPct: billed > 0 ? Math.round((100 * margin) / billed) : null };
}

export function aggregateClients(
  invoices: ClientInvoice[],
  companies: ClientCompany[],
  cost: DeliveryCost,
  months: string[],
  range: Range,
  errors: string[] = [],
): ClientMetrics {
  const nameById = new Map(companies.map((c) => [c.id, c.name]));
  const inWindow = new Set(months);
  // A client identified by its mapped company when there is one, and by the
  // QuickBooks customer name when there is not — an unmapped client still has
  // to appear, or the concentration figure is computed over a smaller book
  // than the one the business actually billed.
  type Acc = { companyId: string | null; name: string; billedCents: number; recurringCents: number; projectCents: number };
  const acc = new Map<string, Acc>();
  for (const i of invoices) {
    if (isVoided(i.status)) continue;
    const month = monthKey(i.txn_date);
    if (!month || !inWindow.has(month)) continue;
    // The same USD rule the Billing tab's own totals use, so the Invoiced tile
    // and this card's "share of" figure cannot disagree about the period. A
    // negative amount is a credit memo and must NET OUT rather than be
    // dropped: the Billing tab subtracts it, and a client list that does not
    // would compute every share over a larger book than the business billed.
    const amount = invoiceUsd(i);
    if (amount === 0) continue;
    const key = i.company_id ?? `name:${(i.customer_name ?? "").trim().toLowerCase() || "unknown"}`;
    const name = (i.company_id ? nameById.get(i.company_id) : null) ?? i.customer_name ?? "Unknown customer";
    const row = acc.get(key) ?? { companyId: i.company_id, name, billedCents: 0, recurringCents: 0, projectCents: 0 };
    row.billedCents += amount;
    if (i.kind === "recurring") row.recurringCents += amount;
    else row.projectCents += amount;
    acc.set(key, row);
  }

  const costByClient = new Map(cost.byClient.map((c) => [c.companyId, c.cents]));
  // A failed cost read must not produce a margin. `delivery-cost` collects its
  // errors and still aggregates what loaded, which is right for a page that
  // shows what it could read — but a margin computed on half the cost is a
  // flattering number, not a partial one, so nothing here trusts it.
  const costTrusted = cost.errors.length === 0;
  const costKnown = costTrusted && cost.mappedCents + cost.unmappedCents > 0;
  const totalBilledCents = [...acc.values()].reduce((a, r) => a + r.billedCents, 0);
  const totalBilled = dollars(totalBilledCents);

  const clients: ClientRow[] = [...acc.values()]
    .map((r) => {
      const billed = dollars(r.billedCents);
      const costDollars = dollars(r.companyId ? (costByClient.get(r.companyId) ?? 0) : 0);
      const kinds = r.recurringCents > 0 && r.projectCents > 0 ? "Recurring + project" : r.recurringCents > 0 ? "Recurring" : "Project";
      return { companyId: r.companyId, name: r.name, billed, cost: costDollars, ...marginOf(billed, costDollars, costTrusted), share: pct(r.billedCents, totalBilledCents), kinds };
    })
    .sort((a, b) => b.billed - a.billed || a.name.localeCompare(b.name));

  // Billing with no cost behind it. While ANY client is in this set, no
  // AGGREGATE margin is honest — not the total, not a kind, not the "Others"
  // row — because subtracting the cost of the tagged clients from the billing
  // of all of them is a number nothing supports.
  //
  // The gate counts clients, not dollars. A credit memo can make a client's
  // net billing negative, and summing would then let one untagged client
  // cancel another out to zero, releasing the total while nothing had been
  // tagged. The dollar figure is still reported, because it is what the note
  // quotes, but it is not what decides.
  const attributedIn = (rows: ClientRow[]) => costTrusted && rows.length > 0 && rows.every((c) => c.billed === 0 || c.cost > 0);
  const unattributed = clients.filter((c) => c.billed !== 0 && c.cost <= 0);
  const billedUnattributed = unattributed.reduce((a, c) => a + c.billed, 0);
  const fullyAttributed = costTrusted && totalBilled > 0 && unattributed.length === 0;

  // The bars name the biggest clients and fold the tail into one row, so a
  // book of forty clients is still a readable card. Others carries the exact
  // remainder rather than a re-sum, so the bars always add to the total.
  const head = clients.slice(0, TOP_CLIENTS);
  const tail = clients.slice(TOP_CLIENTS);
  const othersBilled = totalBilled - head.reduce((a, c) => a + c.billed, 0);
  const othersCost = tail.reduce((a, c) => a + c.cost, 0);
  const topWithOthers: ClientRow[] =
    tail.length > 0
      ? [
          ...head,
          {
            companyId: null,
            name: `Others (${tail.length})`,
            billed: othersBilled,
            cost: othersCost,
            ...marginOf(othersBilled, othersCost, attributedIn(tail)),
            share: pct(othersBilled, totalBilled),
            kinds: "Mixed",
          },
        ]
      : head;

  // By kind: billed from the invoices, cost from the finance door's own split,
  // so the two halves of a margin come from the same place they do per client.
  const billedRecurring = dollars([...acc.values()].reduce((a, r) => a + r.recurringCents, 0));
  const billedProject = dollars([...acc.values()].reduce((a, r) => a + r.projectCents, 0));
  const costRecurring = dollars(cost.byKind.recurring);
  const costProject = dollars(cost.byKind.project);
  const unmappedCost = dollars(cost.unmappedCents + cost.byKind.unknown);
  const totalCost = costRecurring + costProject + unmappedCost;
  const { margin: totalMargin, marginPct: totalMarginPct } = marginOf(totalBilled, totalCost, fullyAttributed);

  const byKind: KindRow[] = [
    { kind: "Recurring", billed: billedRecurring, cost: costRecurring, ...marginOf(billedRecurring, costRecurring, fullyAttributed), share: pct(billedRecurring, totalBilled) },
    { kind: "Project", billed: billedProject, cost: costProject, ...marginOf(billedProject, costProject, fullyAttributed), share: pct(billedProject, totalBilled) },
  ];

  const largest = clients[0] ?? null;
  return {
    errors,
    range,
    totalBilled,
    clients,
    topWithOthers,
    largest,
    // A book whose net billing is zero or negative has no share to report:
    // `pct` floors at 0 for every row, and a tile reading "0%" would look like
    // a measured concentration rather than an unanswerable question.
    largestSharePct: largest && totalBilled > 0 ? largest.share : null,
    top3SharePct: clients.length > 0 && totalBilled > 0 ? clients.slice(0, 3).reduce((a, c) => a + c.share, 0) : null,
    byKind,
    // The unmapped bucket is delivery cost that reaches no client, plus cost
    // whose kind is unknown: both are cost the margin above does not carry,
    // and hiding either flatters the total. Untagged spend is NOT in it — see
    // entities/finance/lib/delivery-cost.ts for why a P&L category total is
    // not evidence of delivery cost.
    unmappedCost,
    untaggedSpend: dollars(cost.untaggedSpendCents),
    totalCost,
    totalMargin,
    totalMarginPct,
    costKnown,
    costTrusted,
    fullyAttributed,
    billedUnattributed,
    costGaps: cost.gaps,
  };
}

export async function loadClients(range: Range = DEFAULT_RANGE, now = new Date()): Promise<ClientMetrics> {
  const { months } = rangeWindows(range, now);
  const [invRes, coRes] = await Promise.all([
    selectInvoices("company_id, customer_name, amount_cents, amount_usd_cents, currency, status, txn_date, kind").limit(5000),
    companyOs.from("companies").select("id, name").limit(5000),
  ]);
  const invoices = (invRes.data ?? []) as unknown as ClientInvoice[];
  const inWindow = new Set(months);
  // The billed mix finance needs to split cost by kind: computed here, from
  // the same rows the figures above use, and handed through the door.
  const mix = new Map<string, BilledMix>();
  for (const i of invoices) {
    if (isVoided(i.status) || !i.company_id || invoiceUnconverted(i)) continue;
    const month = monthKey(i.txn_date);
    if (!month || !inWindow.has(month)) continue;
    // The same net-out rule the billed figures use, so a credit memo reduces
    // the mix that splits cost by kind exactly as it reduces what was billed.
    const amount = invoiceUsd(i);
    if (amount === 0) continue;
    const row = mix.get(i.company_id) ?? { companyId: i.company_id, recurringCents: 0, projectCents: 0 };
    if (i.kind === "recurring") row.recurringCents += amount;
    else row.projectCents += amount;
    mix.set(i.company_id, row);
  }
  const cost = await loadDeliveryCost(months, [...mix.values()]);
  const errors = [...collectErrors({ error: invRes.error, label: "invoices" }, { error: coRes.error, label: "companies" }), ...cost.errors];
  return aggregateClients(invoices, (coRes.data ?? []) as ClientCompany[], cost, months, range, errors);
}
