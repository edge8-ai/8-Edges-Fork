import { describe, expect, it } from "vitest";
import { aggregateBilling, aggregateCashForecast, type BillingDeal, type BillingInvoice } from "./billing";
import { aggregateClients, CONCENTRATION_WARN_PCT, type ClientCompany, type ClientInvoice } from "./clients";
import { aggregatePipeline, type PipelineDeal, type PipelineStage } from "./pipeline";
import { dealState, type StageFlags } from "./shared";
import type { DeliveryCost } from "@/entities/finance";

// The eight finance additions (RF-1..RF-9), as pure functions over fixtures.
// The rule every case defends: a figure the data cannot support arrives as
// "unknown" or "unmapped", never as a zero that reads as good news. None of
// the row types here carries an owner, assignee or author column, and this
// file is where that stays true.

const NOW = new Date("2026-09-14T12:00:00Z");

const STAGES: StageFlags[] = [
  { id: "disc", is_won: false, is_lost: false },
  { id: "won", is_won: true, is_lost: false },
  { id: "lost", is_won: false, is_lost: true },
];

const inv = (o: Partial<BillingInvoice> & { id: string }): BillingInvoice => ({
  doc_number: null, customer_name: null, amount_cents: 0, amount_usd_cents: null, balance_cents: 0, balance_usd_cents: null, currency: "usd",
  status: "open", txn_date: null, due_date: null, deal_id: null, company_id: null, kind: null, ...o,
});

const bdeal = (o: Partial<BillingDeal> & { id: string }): BillingDeal => ({
  title: null, status: "open", stage_id: "disc", amount_usd_cents: null, amount_cents: null, currency: "usd",
  probability: null, closed_at: null, expected_close_date: null, archived_at: null, ...o,
});

describe("dealState — one definition of open, shared by Pipeline and Billing", () => {
  const { isOpen, isWon, isClosed } = dealState(STAGES);
  it("closes a deal whose stage is won even when its status was never set", () => {
    const d = { status: "open", stage_id: "won", archived_at: null };
    expect(isWon(d)).toBe(true);
    expect(isClosed(d)).toBe(true);
    expect(isOpen(d)).toBe(false);
  });
  it("closes a deal whose status says lost even when its stage does not", () => {
    expect(isOpen({ status: "lost", stage_id: "disc", archived_at: null })).toBe(false);
  });
  it("treats an archived deal as not open", () => {
    expect(isOpen({ status: "open", stage_id: "disc", archived_at: "2026-01-01" })).toBe(false);
  });
  it("keeps a live deal in a live stage open", () => {
    expect(isOpen({ status: "open", stage_id: "disc", archived_at: null })).toBe(true);
  });
});

describe("RF-1 · cash in the next 90 days", () => {
  it("says nothing rather than zero for an empty book", () => {
    const c = aggregateCashForecast([], [], STAGES, NOW);
    expect(c.total).toBe(0);
    expect(c.months.map((m) => m.month)).toEqual(["2026-09", "2026-10", "2026-11"]);
  });

  it("lands an already-overdue balance in the first month, not its own", () => {
    const c = aggregateCashForecast([inv({ id: "i1", balance_cents: 250_00, due_date: "2026-03-01" })], [], STAGES, NOW);
    expect(c.months[0].due).toBe(250);
    expect(c.months.slice(1).every((m) => m.due === 0)).toBe(true);
  });

  it("places a future balance in the month it falls due", () => {
    const c = aggregateCashForecast([inv({ id: "i1", balance_cents: 100_00, due_date: "2026-10-20" })], [], STAGES, NOW);
    expect(c.months.map((m) => m.due)).toEqual([0, 100, 0]);
  });

  it("ignores a balance due beyond the window", () => {
    const c = aggregateCashForecast([inv({ id: "i1", balance_cents: 100_00, due_date: "2027-02-01" })], [], STAGES, NOW);
    expect(c.due).toBe(0);
  });

  it("reports an undated balance separately rather than guessing a month for it", () => {
    const c = aggregateCashForecast([inv({ id: "i1", balance_cents: 400_00, due_date: null })], [], STAGES, NOW);
    expect(c.undatedBalance).toBe(400);
    expect(c.due).toBe(0);
  });

  it("takes the run rate from the last COMPLETE month, never the part-month in progress", () => {
    // August's $900 is the rate. September's own $100 has already been
    // invoiced, so month one expects only the $800 still to come; the two
    // months after it expect the whole rate.
    const invoices = [
      inv({ id: "aug", kind: "recurring", amount_cents: 900_00, txn_date: "2026-08-05" }),
      inv({ id: "sep", kind: "recurring", amount_cents: 100_00, txn_date: "2026-09-02" }),
    ];
    const c = aggregateCashForecast(invoices, [], STAGES, NOW);
    expect(c.months.map((m) => m.recurring)).toEqual([800, 900, 900]);
    expect(c.recurring).toBe(2600);
  });

  it("excludes a voided invoice from the run rate", () => {
    const c = aggregateCashForecast([inv({ id: "v", kind: "recurring", amount_cents: 900_00, txn_date: "2026-08-05", status: "voided" })], [], STAGES, NOW);
    expect(c.recurring).toBe(0);
  });

  it("weights an expected close by its probability", () => {
    const deals = [bdeal({ id: "d1", amount_usd_cents: 200_00, probability: 50, expected_close_date: "2026-10-15" })];
    const c = aggregateCashForecast([], deals, STAGES, NOW);
    expect(c.months.map((m) => m.expected)).toEqual([0, 100, 0]);
  });

  it("counts a deal with no probability as nothing, not as certain", () => {
    const deals = [bdeal({ id: "d1", amount_usd_cents: 200_00, probability: null, expected_close_date: "2026-10-15" })];
    expect(aggregateCashForecast([], deals, STAGES, NOW).expected).toBe(0);
  });

  it("excludes a deal sitting in a won stage from the forecast", () => {
    const deals = [bdeal({ id: "d1", stage_id: "won", amount_usd_cents: 200_00, probability: 100, expected_close_date: "2026-10-15" })];
    expect(aggregateCashForecast([], deals, STAGES, NOW).expected).toBe(0);
  });

  it("gives a foreign-currency deal with no USD figure no weight at all", () => {
    const deals = [bdeal({ id: "d1", amount_usd_cents: null, amount_cents: 900_000_00, currency: "vnd", probability: 100, expected_close_date: "2026-10-15" })];
    expect(aggregateCashForecast([], deals, STAGES, NOW).expected).toBe(0);
  });

  it("keeps each month's total equal to its three parts, and the sum to the months", () => {
    const invoices = [inv({ id: "i1", balance_cents: 300_00, due_date: "2026-10-01" }), inv({ id: "r", kind: "recurring", amount_cents: 500_00, txn_date: "2026-08-01" })];
    const deals = [bdeal({ id: "d1", amount_usd_cents: 400_00, probability: 25, expected_close_date: "2026-11-02" })];
    const c = aggregateCashForecast(invoices, deals, STAGES, NOW);
    for (const m of c.months) expect(m.total).toBe(m.due + m.recurring + m.expected);
    expect(c.total).toBe(c.months.reduce((a, m) => a + m.total, 0));
    expect(c.total).toBe(c.due + c.recurring + c.expected);
  });

  // The run rate stands down for recurring already INVOICED for the month,
  // whatever its payment state. Balance would be wrong three ways, and each
  // way is a case here.
  const rate = () => inv({ id: "aug", kind: "recurring", amount_cents: 1000_00, txn_date: "2026-08-01" });

  it("does not count an unpaid retainer twice, due on receipt", () => {
    const c = aggregateCashForecast([rate(), inv({ id: "sep", kind: "recurring", amount_cents: 1000_00, txn_date: "2026-09-01", balance_cents: 1000_00, due_date: "2026-09-30" })], [], STAGES, NOW);
    expect(c.months[0]).toMatchObject({ due: 1000, recurring: 0, total: 1000 });
    expect(c.months[1]).toMatchObject({ due: 0, recurring: 1000 });
  });

  it("does not count an unpaid retainer twice ON NET-30 TERMS, where the txn month and the due month differ", () => {
    // The case a same-month fixture cannot see. Invoiced 25 August, due 10
    // September: keying the stand-down on the transaction month would stand
    // August down (nothing there to cancel) while `due` counts the cash in
    // September — one $1,000 retainer read as $2,000 in one month.
    // The retainer IS August's book, so it sets the rate and is the thing the
    // rate must not be added on top of.
    const c = aggregateCashForecast([inv({ id: "net30", kind: "recurring", amount_cents: 1000_00, txn_date: "2026-08-25", balance_cents: 1000_00, due_date: "2026-09-10" })], [], STAGES, NOW);
    expect(c.months[0]).toMatchObject({ due: 1000, recurring: 0, total: 1000 });
  });

  it("reads a steady net-30 book as one month of billing per month", () => {
    // A $1,000/month retainer on net-30, invoiced on the 1st. Three months of
    // forecast must total about three months of the book, not four.
    const invoices = [
      inv({ id: "aug", kind: "recurring", amount_cents: 1000_00, txn_date: "2026-08-01", balance_cents: 1000_00, due_date: "2026-09-01" }),
      inv({ id: "sep", kind: "recurring", amount_cents: 1000_00, txn_date: "2026-09-01", balance_cents: 1000_00, due_date: "2026-10-01" }),
    ];
    const c = aggregateCashForecast(invoices, [], STAGES, NOW);
    expect(c.months.map((m) => m.total)).toEqual([1000, 1000, 1000]);
    expect(c.total).toBe(3000);
  });

  it("does not re-add a retainer that was already invoiced AND PAID", () => {
    // The balance is zero, so a balance-based test would see nothing already
    // billed and add the whole rate on top of cash that has already arrived —
    // overstating by a month of the book every month the book is collected.
    const c = aggregateCashForecast([rate(), inv({ id: "sep", kind: "recurring", amount_cents: 1000_00, txn_date: "2026-09-01", balance_cents: 0, status: "paid", due_date: "2026-09-30" })], [], STAGES, NOW);
    expect(c.months[0]).toMatchObject({ due: 0, recurring: 0, total: 0 });
    expect(c.total).toBe(2000);
  });

  it("does not re-add the part of a retainer that was already paid", () => {
    const c = aggregateCashForecast([rate(), inv({ id: "sep", kind: "recurring", amount_cents: 1000_00, txn_date: "2026-09-01", balance_cents: 100_00, due_date: "2026-09-30" })], [], STAGES, NOW);
    expect(c.months[0]).toMatchObject({ due: 100, recurring: 0, total: 100 });
    // The stand-down uses the invoiced amount, not the $100 still outstanding.
  });

  it("still expects this month's recurring when an OLD past-due invoice lands in month one", () => {
    // The June invoice lands in month one under the overdue rule. It is not
    // September's billing, so it must not cancel September's run rate.
    const c = aggregateCashForecast([rate(), inv({ id: "jun", kind: "recurring", amount_cents: 1200_00, txn_date: "2026-06-01", balance_cents: 1200_00, due_date: "2026-06-30" })], [], STAGES, NOW);
    expect(c.months[0]).toMatchObject({ due: 1200, recurring: 1000, total: 2200 });
  });

  it("gives a foreign-currency invoice no dollars in the forecast", () => {
    const c = aggregateCashForecast([inv({ id: "aud", balance_cents: 1_500_000, currency: "aud", due_date: "2026-10-10" })], [], STAGES, NOW);
    expect(c.due).toBe(0);
  });

  it("contributes no expected closes at all when the stages read failed", () => {
    // Without the won/lost flags a deal parked in Closed Won reads as open.
    const deals = [bdeal({ id: "d1", amount_usd_cents: 900_00, probability: 100, expected_close_date: "2026-10-15" })];
    expect(aggregateCashForecast([], deals, [], NOW, false).expected).toBe(0);
    expect(aggregateCashForecast([], deals, STAGES, NOW, true).expected).toBe(900);
  });

  it("does not move when the tab's range changes — ninety days is ninety days", () => {
    const invoices = [inv({ id: "i1", balance_cents: 300_00, due_date: "2026-10-01" })];
    const three = aggregateBilling(invoices, [], NOW, { range: "3m", stages: STAGES }).cash;
    const twoYears = aggregateBilling(invoices, [], NOW, { range: "24m", stages: STAGES }).cash;
    expect(three).toEqual(twoYears);
  });
});

// A delivery-cost result, built by hand so the clients aggregate can be tested
// without reaching through the finance door.
const cost = (o: Partial<DeliveryCost> = {}): DeliveryCost => ({
  byClient: [], byKind: { recurring: 0, project: 0, unknown: 0 }, unmappedCents: 0, untaggedSpendCents: 0, mappedCents: 0,
  gaps: { untaggedExpenses: 0, unassignedPayments: 0, foreignCurrencyRows: 0 }, errors: [], ...o,
});

const cinv = (o: Partial<ClientInvoice> = {}): ClientInvoice => ({
  company_id: null, customer_name: null, amount_cents: 0, amount_usd_cents: null, currency: "usd", status: "paid", txn_date: "2026-09-01", kind: "project", ...o,
});

const COMPANIES: ClientCompany[] = [
  { id: "c1", name: "Contoso" },
  { id: "c2", name: "Initech" },
];
const MONTHS = ["2026-08", "2026-09"];
const clientsOf = (invoices: ClientInvoice[], c: DeliveryCost = cost()) => aggregateClients(invoices, COMPANIES, c, MONTHS, "12m");

describe("invoices in another currency", () => {
  it("counts a foreign invoice as nothing rather than adding it at par", () => {
    // One AUD 1,500,000 invoice was reading as $15,000 of US revenue.
    const m = aggregateBilling([inv({ id: "aud", amount_cents: 1_500_000, currency: "aud", txn_date: "2026-09-01" })], [], NOW, { range: "12m", stages: STAGES });
    expect(m.invoicedInRange.value).toBe(0);
    expect(m.foreignInvoices).toBe(1);
  });

  it("nets a USD credit memo out of the by-client total, as the Invoiced tile does", () => {
    // Dropping it would compute every client share over a larger book than the
    // business billed, and put two totals for one period on one screen.
    const invoices = [
      inv({ id: "a", amount_cents: 1000_00, txn_date: "2026-09-01", company_id: "c1" }),
      inv({ id: "credit", amount_cents: -200_00, txn_date: "2026-09-01", company_id: "c1" }),
    ];
    const b = aggregateBilling(invoices, [], NOW, { range: "12m", stages: STAGES });
    const c = aggregateClients(
      invoices.map((i) => ({ company_id: i.company_id, customer_name: i.customer_name, amount_cents: i.amount_cents, amount_usd_cents: i.amount_usd_cents, currency: i.currency, status: i.status, txn_date: i.txn_date, kind: i.kind ?? null })),
      COMPANIES, cost(), MONTHS, "12m",
    );
    expect(b.invoicedInRange.value).toBe(800);
    expect(c.totalBilled).toBe(800);
  });

  it("keeps the Invoiced total and the by-client total in step", () => {
    const invoices = [
      inv({ id: "usd", amount_cents: 1000_00, txn_date: "2026-09-01", company_id: "c1" }),
      inv({ id: "aud", amount_cents: 1_500_000, currency: "aud", txn_date: "2026-09-01", company_id: "c1" }),
    ];
    const b = aggregateBilling(invoices, [], NOW, { range: "12m", stages: STAGES });
    const c = aggregateClients(
      invoices.map((i) => ({ company_id: i.company_id, customer_name: i.customer_name, amount_cents: i.amount_cents, amount_usd_cents: i.amount_usd_cents, currency: i.currency, status: i.status, txn_date: i.txn_date, kind: i.kind ?? null })),
      COMPANIES, cost(), MONTHS, "12m",
    );
    expect(b.invoicedInRange.value).toBe(c.totalBilled);
  });

  it("counts a converted AUD invoice at its USD value, in both totals", () => {
    const invoices = [
      inv({ id: "usd", amount_cents: 1000_00, amount_usd_cents: 1000_00, txn_date: "2026-09-01", company_id: "c1" }),
      inv({ id: "aud", amount_cents: 1_500_000, amount_usd_cents: 1_004_000, currency: "aud", txn_date: "2026-09-01", company_id: "c1" }),
    ];
    const b = aggregateBilling(invoices, [], NOW, { range: "12m", stages: STAGES });
    const c = aggregateClients(
      invoices.map((i) => ({ company_id: i.company_id, customer_name: i.customer_name, amount_cents: i.amount_cents, amount_usd_cents: i.amount_usd_cents, currency: i.currency, status: i.status, txn_date: i.txn_date, kind: i.kind ?? null })),
      COMPANIES, cost(), MONTHS, "12m",
    );
    expect(b.invoicedInRange.value).toBe(11_040);
    expect(c.totalBilled).toBe(11_040);
    expect(b.foreignInvoices).toBe(0);
  });
});

describe("RF-2 · client concentration", () => {
  it("names clients by their mapped company and sorts by what they were billed", () => {
    const m = clientsOf([
      cinv({ company_id: "c2", amount_cents: 100_00 }),
      cinv({ company_id: "c1", amount_cents: 300_00 }),
    ]);
    expect(m.clients.map((c) => c.name)).toEqual(["Contoso", "Initech"]);
    expect(m.totalBilled).toBe(400);
  });

  it("keeps an unmapped client in the book under its QuickBooks name", () => {
    const m = clientsOf([cinv({ company_id: null, customer_name: "Northwind", amount_cents: 100_00 })]);
    expect(m.clients).toHaveLength(1);
    expect(m.clients[0]).toMatchObject({ name: "Northwind", companyId: null, billed: 100 });
  });

  it("reads a single-client book as the whole of it", () => {
    const m = clientsOf([cinv({ company_id: "c1", amount_cents: 100_00 })]);
    expect(m.largestSharePct).toBe(100);
    expect(m.largestSharePct).toBeGreaterThan(CONCENTRATION_WARN_PCT);
  });

  it("reports no share at all for a book whose net billing is zero or negative", () => {
    // pct() floors at 0 when the whole is not positive, so a tile reading "0%"
    // would look like a measured concentration rather than an open question.
    const m = clientsOf([cinv({ company_id: "c1", amount_cents: 100_00 }), cinv({ company_id: "c2", amount_cents: -100_00 })]);
    expect(m.totalBilled).toBe(0);
    expect(m.largestSharePct).toBeNull();
    expect(m.top3SharePct).toBeNull();
  });

  it("has no largest and no share for an empty book rather than dividing by zero", () => {
    const m = clientsOf([]);
    expect(m.largest).toBeNull();
    expect(m.largestSharePct).toBeNull();
    expect(m.totalBilled).toBe(0);
  });

  it("excludes a voided invoice and one outside the window", () => {
    const m = clientsOf([
      cinv({ company_id: "c1", amount_cents: 100_00, status: "voided" }),
      cinv({ company_id: "c1", amount_cents: 100_00, txn_date: "2026-01-01" }),
    ]);
    expect(m.totalBilled).toBe(0);
  });

  it("folds the tail into Others carrying the exact remainder", () => {
    const invoices = Array.from({ length: 14 }, (_, i) => cinv({ company_id: null, customer_name: `Client ${i}`, amount_cents: (20 - i) * 100_00 }));
    const m = clientsOf(invoices);
    const others = m.topWithOthers.at(-1);
    expect(others?.name).toBe("Others (4)");
    expect(m.topWithOthers.reduce((a, c) => a + c.billed, 0)).toBe(m.totalBilled);
  });

  it("calls the Others row's margin unknown while any client folded into it is untagged", () => {
    // Others is an aggregate of the tail, so it needs the aggregate rule for
    // the same reason a kind does: its cost is non-zero as soon as one client
    // in the tail is tagged, while its billed column carries all of them.
    const invoices = Array.from({ length: 13 }, (_, i) => cinv({ company_id: `c${i}`, amount_cents: (20 - i) * 100_00 }));
    const m = clientsOf(invoices, cost({ byClient: [{ companyId: "c11", cents: 10_00 }], mappedCents: 10_00 }));
    const others = m.topWithOthers.at(-1);
    expect(others?.name).toBe("Others (3)");
    expect(others?.margin).toBeNull();
    expect(others?.marginPct).toBeNull();
  });

  it("names no Others row when every client fits", () => {
    const m = clientsOf([cinv({ company_id: "c1", amount_cents: 100_00 })]);
    expect(m.topWithOthers.some((c) => c.name.startsWith("Others"))).toBe(false);
  });
});

describe("RF-4 · gross margin", () => {
  it("reports margin as UNKNOWN when no cost has been attributed anywhere", () => {
    const m = clientsOf([cinv({ company_id: "c1", amount_cents: 100_00 })]);
    expect(m.costKnown).toBe(false);
    expect(m.totalMargin).toBeNull();
    expect(m.clients[0].margin).toBeNull();
    expect(m.clients[0].marginPct).toBeNull();
    expect(m.byKind.every((k) => k.marginPct === null)).toBe(true);
  });

  it("computes margin per client once any cost is known", () => {
    const m = clientsOf(
      [cinv({ company_id: "c1", amount_cents: 1000_00 })],
      cost({ byClient: [{ companyId: "c1", cents: 400_00 }], mappedCents: 400_00, byKind: { recurring: 0, project: 400_00, unknown: 0 } }),
    );
    expect(m.clients[0]).toMatchObject({ billed: 1000, cost: 400, margin: 600, marginPct: 60 });
  });

  it("calls a KIND and the total unknown while any client in them is untagged", () => {
    // The bug this defends: a kind's cost is non-zero as soon as one client in
    // it is tagged, while its billed column carries every client — so a
    // per-row test would print "Project 97%" above two rows reading unknown.
    const m = clientsOf(
      [cinv({ company_id: "c1", amount_cents: 100_00 }), cinv({ company_id: "c2", amount_cents: 100_00 })],
      cost({ byClient: [{ companyId: "c1", cents: 10_00 }], mappedCents: 10_00, byKind: { recurring: 0, project: 10_00, unknown: 0 } }),
    );
    expect(m.clients.find((c) => c.companyId === "c1")?.marginPct).toBe(90);
    expect(m.fullyAttributed).toBe(false);
    expect(m.billedUnattributed).toBe(100);
    expect(m.byKind.every((k) => k.margin === null)).toBe(true);
    expect(m.totalMargin).toBeNull();
  });

  it("does not let one untagged client cancel another out into a false total", () => {
    // Two untagged clients whose net billing sums to zero. Counting dollars
    // would read "nothing unattributed" and release the aggregate margin while
    // nothing had been tagged at all.
    const m = clientsOf(
      [cinv({ company_id: "c1", amount_cents: 100_00 }), cinv({ company_id: "c2", amount_cents: -100_00 }), cinv({ company_id: "c1", amount_cents: 500_00 })],
      cost({ byClient: [], mappedCents: 0, unmappedCents: 50_00 }),
    );
    expect(m.billedUnattributed).toBe(500);
    expect(m.fullyAttributed).toBe(false);
    expect(m.totalMargin).toBeNull();
  });

  it("gives a kind and the total a margin once every client is attributed", () => {
    const m = clientsOf(
      [cinv({ company_id: "c1", amount_cents: 100_00 }), cinv({ company_id: "c2", amount_cents: 100_00 })],
      cost({ byClient: [{ companyId: "c1", cents: 40_00 }, { companyId: "c2", cents: 60_00 }], mappedCents: 100_00, byKind: { recurring: 0, project: 100_00, unknown: 0 } }),
    );
    expect(m.fullyAttributed).toBe(true);
    expect(m.billedUnattributed).toBe(0);
    expect(m.byKind.find((k) => k.kind === "Project")).toMatchObject({ billed: 200, cost: 100, margin: 100, marginPct: 50 });
    expect(m.totalMarginPct).toBe(50);
  });

  it("splits billed by kind and carries the door's cost split through", () => {
    const m = clientsOf(
      [cinv({ company_id: "c1", amount_cents: 600_00, kind: "recurring" }), cinv({ company_id: "c1", amount_cents: 400_00, kind: "project" })],
      cost({ byClient: [{ companyId: "c1", cents: 500_00 }], mappedCents: 500_00, byKind: { recurring: 300_00, project: 200_00, unknown: 0 } }),
    );
    expect(m.fullyAttributed).toBe(true);
    expect(m.byKind).toEqual([
      { kind: "Recurring", billed: 600, cost: 300, margin: 300, marginPct: 50, share: 60 },
      { kind: "Project", billed: 400, cost: 200, margin: 200, marginPct: 50, share: 40 },
    ]);
  });

  it("keeps untagged spend OUT of the margin and reports it separately", () => {
    // A QuickBooks P&L category row ("Taxes paid") is not evidence of delivery
    // cost. Counting it as unmapped delivery cost would make every margin read
    // worse than the data supports, which is the same sin as a false 100%.
    const m = clientsOf(
      [cinv({ company_id: "c1", amount_cents: 1000_00 })],
      cost({ untaggedSpendCents: 1_290_000_00, gaps: { untaggedExpenses: 30, unassignedPayments: 0, foreignCurrencyRows: 0 } }),
    );
    expect(m.unmappedCost).toBe(0);
    expect(m.untaggedSpend).toBe(1_290_000);
    expect(m.costKnown).toBe(false);
    expect(m.clients[0].margin).toBeNull();
  });

  it("keeps unmapped cost visible, including cost whose kind is unknown", () => {
    const m = clientsOf(
      [cinv({ company_id: "c1", amount_cents: 1000_00 })],
      cost({ byClient: [{ companyId: "c1", cents: 100_00 }], mappedCents: 100_00, unmappedCents: 250_00, byKind: { recurring: 0, project: 0, unknown: 100_00 } }),
    );
    expect(m.unmappedCost).toBe(350);
  });

  it("attributes no cost to a client that has no mapped company", () => {
    const m = clientsOf(
      [cinv({ company_id: null, customer_name: "Northwind", amount_cents: 100_00 })],
      cost({ byClient: [{ companyId: "c1", cents: 50_00 }], mappedCents: 50_00 }),
    );
    expect(m.clients[0].cost).toBe(0);
  });

  it("leaves an UNTAGGED client unknown even once another client has cost — the whole point of per-row", () => {
    // Attribution is partial by design, so one tagged expense anywhere must not
    // flip every other client to a perfect margin. 100% is not even amber.
    const m = clientsOf(
      [cinv({ company_id: "c1", amount_cents: 1000_00 }), cinv({ company_id: "c2", amount_cents: 500_00 })],
      cost({ byClient: [{ companyId: "c1", cents: 400_00 }], mappedCents: 400_00, byKind: { recurring: 0, project: 400_00, unknown: 0 } }),
    );
    expect(m.clients.find((c) => c.companyId === "c1")).toMatchObject({ margin: 600, marginPct: 60 });
    const c2 = m.clients.find((c) => c.companyId === "c2");
    expect(c2?.margin).toBeNull();
    expect(c2?.marginPct).toBeNull();
  });

  it("renders no margin at all when the cost read failed", () => {
    // A margin computed on half the cost is a flattering number, not a partial
    // one; the error banner alone is not enough to make it safe to print.
    const m = clientsOf(
      [cinv({ company_id: "c1", amount_cents: 1000_00 })],
      cost({ byClient: [{ companyId: "c1", cents: 400_00 }], mappedCents: 400_00, errors: ["contractor payments: timeout"] }),
    );
    expect(m.costTrusted).toBe(false);
    expect(m.clients[0].margin).toBeNull();
    expect(m.totalMargin).toBeNull();
  });

  it("keeps a client with no mapped company unknown rather than perfect", () => {
    const m = clientsOf(
      [cinv({ company_id: null, customer_name: "Northwind", amount_cents: 100_00 }), cinv({ company_id: "c1", amount_cents: 100_00 })],
      cost({ byClient: [{ companyId: "c1", cents: 40_00 }], mappedCents: 40_00 }),
    );
    expect(m.clients.find((c) => c.companyId === null)?.marginPct).toBeNull();
  });

  it("carries the unmapped bucket into the company total so it cannot flatter", () => {
    const m = clientsOf(
      [cinv({ company_id: "c1", amount_cents: 1000_00 })],
      cost({ byClient: [{ companyId: "c1", cents: 200_00 }], mappedCents: 200_00, unmappedCents: 300_00, byKind: { recurring: 0, project: 200_00, unknown: 0 } }),
    );
    expect(m.totalCost).toBe(500);
    expect(m.totalMargin).toBe(500);
    expect(m.totalMarginPct).toBe(50);
  });
});

describe("RF-7 · lost deals by reason", () => {
  const PSTAGES: PipelineStage[] = [
    { id: "disc", name: "Discovery", position: 0, is_won: false, is_lost: false },
    { id: "won", name: "Won", position: 1, is_won: true, is_lost: false },
    { id: "lost", name: "Lost", position: 2, is_won: false, is_lost: true },
  ];
  const pdeal = (o: Partial<PipelineDeal> & { id: string }): PipelineDeal => ({
    stage_id: "lost", status: "lost", amount_usd_cents: 100_00, amount_cents: null, currency: "usd", probability: null,
    source: null, created_at: "2026-05-01T00:00:00Z", closed_at: "2026-09-01T00:00:00Z", expected_close_date: null,
    lost_reason: null, archived_at: null, ...o,
  });
  const reasonsOf = (deals: PipelineDeal[]) => aggregatePipeline(deals, PSTAGES, [], NOW, { range: "12m" }).lostReasons;

  it("counts by reason, value beside the count, biggest first", () => {
    const r = reasonsOf([
      pdeal({ id: "1", lost_reason: "Price", amount_usd_cents: 400_00 }),
      pdeal({ id: "2", lost_reason: "No decision" }),
      pdeal({ id: "3", lost_reason: "No decision" }),
      pdeal({ id: "4", lost_reason: "No decision" }),
    ]);
    expect(r).toEqual([
      { reason: "No decision", count: 3, usd: 300 },
      { reason: "Price", count: 1, usd: 400 },
    ]);
  });

  it("keeps a deal with no reason visible rather than dropping it", () => {
    const r = reasonsOf([pdeal({ id: "1", lost_reason: null }), pdeal({ id: "2", lost_reason: "   " })]);
    expect(r).toEqual([{ reason: "no reason given", count: 2, usd: 200 }]);
  });

  it("excludes a won deal and a deal lost outside the range", () => {
    const r = reasonsOf([
      pdeal({ id: "won", stage_id: "won", status: "won", lost_reason: "Price" }),
      pdeal({ id: "old", lost_reason: "Price", closed_at: "2024-01-01T00:00:00Z" }),
      pdeal({ id: "in", lost_reason: "Price" }),
    ]);
    expect(r).toEqual([{ reason: "Price", count: 1, usd: 100 }]);
  });

  it("says nothing at all when nothing was lost", () => {
    expect(reasonsOf([])).toEqual([]);
  });
});
