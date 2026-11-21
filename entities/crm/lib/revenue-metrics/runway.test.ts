import { describe, expect, it } from "vitest";
import { aggregateRunway, BURN_LOOKBACK_MONTHS, type FxRate, type RunwayExpense, type RunwayInvoice, type RunwayPayment } from "./runway";

// Cash in from what is owed, netted against what the last complete months
// actually cost (S.8). Pure over fixtures, and the rule every case defends is
// the asymmetry that makes a runway honest: understating what is COMING IN is
// conservative, understating what is GOING OUT flatters. So a foreign invoice
// counts as nothing and a foreign cost is converted through the FX table; a
// cost with no rate is counted as a gap, never dropped in silence.
//
// `contractor_payments` carries a `person_id` and no type here has one.

const NOW = new Date("2026-09-14T12:00:00Z");

const inv = (o: Partial<RunwayInvoice> & { id: string }): RunwayInvoice => ({
  balance_cents: 0, balance_usd_cents: null, amount_usd_cents: null, currency: "usd", status: "open", due_date: null, ...o,
});
const exp = (o: Partial<RunwayExpense> & { id: string }): RunwayExpense => ({
  amount_cents: 0, currency: "usd", incurred_on: null, ...o,
});
const pay = (o: Partial<RunwayPayment> & { id: string }): RunwayPayment => ({
  amount_cents: 0, currency: "usd", period_month: null, ...o,
});
const FX: FxRate[] = [{ currency: "vnd", rate_to_usd: 0.00004 }];

// Three complete months before September 2026, which is the burn window.
const BURN_MONTHS = ["2026-06", "2026-07", "2026-08"];

describe("the burn rate is the average of the last complete months", () => {
  it("averages expenses and contractor payments over the lookback, never the current month", () => {
    const expenses = BURN_MONTHS.map((m, i) => exp({ id: `e${i}`, incurred_on: `${m}-05`, amount_cents: 3_000_00 }));
    const payments = BURN_MONTHS.map((m, i) => pay({ id: `p${i}`, period_month: `${m}-01`, amount_cents: 1_000_00 }));
    const m = aggregateRunway([], [...expenses, exp({ id: "now", incurred_on: "2026-09-02", amount_cents: 900_000_00 })], payments, FX, NOW, { horizon: 3 });
    expect(m.burnFromMonths).toEqual(BURN_MONTHS);
    expect(BURN_LOOKBACK_MONTHS).toBe(BURN_MONTHS.length);
    expect(m.expenseBurn).toBe(3_000);
    expect(m.contractorBurn).toBe(1_000);
    expect(m.burnMonthly).toBe(4_000);
  });

  it("converts a foreign cost through the FX table instead of counting it as nothing", () => {
    // 300,000,000 VND at 0.00004 is $12,000 — a third of the window, so $4,000 a month.
    const m = aggregateRunway([], [exp({ id: "e", incurred_on: "2026-07-05", amount_cents: 300_000_000_00, currency: "vnd" })], [], FX, NOW, { horizon: 3 });
    expect(m.burnMonthly).toBe(4_000);
    expect(m.gaps.unconvertedCostRows).toBe(0);
  });

  it("counts a cost it has no rate for rather than dropping it", () => {
    const m = aggregateRunway([], [exp({ id: "e", incurred_on: "2026-07-05", amount_cents: 1_000_00, currency: "eur" })], [], FX, NOW, { horizon: 3 });
    expect(m.burnMonthly).toBe(0);
    expect(m.gaps.unconvertedCostRows).toBe(1);
  });
});

describe("cash in is what is owed, placed in the month it lands", () => {
  it("places an open balance in its due month and sweeps everything past due into this one", () => {
    const invoices = [
      inv({ id: "old", balance_cents: 5_000_00, due_date: "2026-06-30" }),
      inv({ id: "oct", balance_cents: 2_000_00, due_date: "2026-10-15" }),
      inv({ id: "later", balance_cents: 9_000_00, due_date: "2027-05-01" }),
    ];
    const m = aggregateRunway(invoices, [], [], FX, NOW, { horizon: 3 });
    expect(m.months.map((p) => p.cashIn)).toEqual([5_000, 2_000, 0]);
    expect(m.cashInTotal).toBe(7_000);
  });

  it("leaves out a paid invoice and a voided one", () => {
    const invoices = [inv({ id: "paid", balance_cents: 0, due_date: "2026-09-20" }), inv({ id: "void", balance_cents: 4_000_00, due_date: "2026-09-20", status: "voided" })];
    expect(aggregateRunway(invoices, [], [], FX, NOW, { horizon: 3 }).cashInTotal).toBe(0);
  });

  it("reports an undated balance on its own rather than guessing a month for it", () => {
    const m = aggregateRunway([inv({ id: "u", balance_cents: 3_000_00, due_date: null })], [], [], FX, NOW, { horizon: 3 });
    expect(m.cashInTotal).toBe(0);
    expect(m.undatedBalance).toBe(3_000);
  });

  it("counts a foreign receivable as nothing, because understating what comes in is the safe error", () => {
    const m = aggregateRunway([inv({ id: "f", balance_cents: 300_000_000_00, currency: "vnd", due_date: "2026-09-20" })], [], [], FX, NOW, { horizon: 3 });
    expect(m.cashInTotal).toBe(0);
    expect(m.gaps.foreignReceivables).toBe(1);
  });
});

describe("netting the two gives the month-by-month position", () => {
  const burn = BURN_MONTHS.map((m, i) => exp({ id: `e${i}`, incurred_on: `${m}-05`, amount_cents: 4_000_00 }));

  it("runs the net forward so a reader can see the month it turns negative", () => {
    const invoices = [inv({ id: "a", balance_cents: 10_000_00, due_date: "2026-09-20" })];
    const m = aggregateRunway(invoices, burn, [], FX, NOW, { horizon: 3 });
    expect(m.months.map((p) => p.net)).toEqual([6_000, -4_000, -4_000]);
    expect(m.months.map((p) => p.cumulative)).toEqual([6_000, 2_000, -2_000]);
    expect(m.firstNegativeMonth).toBe("2026-11");
    expect(m.netTotal).toBe(-2_000);
  });

  it("has no negative month when the receivables cover the whole horizon", () => {
    const invoices = [inv({ id: "a", balance_cents: 100_000_00, due_date: "2026-09-20" })];
    expect(aggregateRunway(invoices, burn, [], FX, NOW, { horizon: 3 }).firstNegativeMonth).toBeNull();
  });
});

describe("the runway figure says what it is measured from, and admits what it cannot see", () => {
  const burn = BURN_MONTHS.map((m, i) => exp({ id: `e${i}`, incurred_on: `${m}-05`, amount_cents: 4_000_00 }));

  it("divides the collectible pool by the burn rate", () => {
    const invoices = [inv({ id: "a", balance_cents: 10_000_00, due_date: "2026-09-20" })];
    const m = aggregateRunway(invoices, burn, [], FX, NOW, { horizon: 3 });
    expect(m.collectible).toBe(10_000);
    expect(m.runwayMonths).toBe(2.5);
  });

  it("returns null rather than infinity when nothing was spent in the window", () => {
    const m = aggregateRunway([inv({ id: "a", balance_cents: 10_000_00, due_date: "2026-09-20" })], [], [], FX, NOW, { horizon: 3 });
    expect(m.runwayMonths).toBeNull();
  });

  it("states that no bank balance is recorded, so the figure is receivables only", () => {
    const text = aggregateRunway([], burn, [], FX, NOW, { horizon: 3 }).assumptions.join(" ");
    expect(text).toContain("bank balance");
    expect(text).toContain("June 2026");
  });
});

// S.19.3. A failed cost read understates the burn, which makes the runway look
// longer than it is; the figure is withheld instead of shown beside a banner.
describe("the runway when a cost read failed", () => {
  it("gives no runway figure and no first negative month, and says why", () => {
    const invoices = [inv({ id: "i", balance_cents: 100_000_00, due_date: "2026-10-15" })];
    const m = aggregateRunway(invoices, [exp({ id: "e", incurred_on: "2026-07-05", amount_cents: 1_000_00 })], [], FX, NOW, { horizon: 3, costsIncomplete: true });
    expect(m.costsIncomplete).toBe(true);
    expect(m.runwayMonths).toBeNull();
    expect(m.firstNegativeMonth).toBeNull();
    expect(m.assumptions[0]).toMatch(/cost read failed/);
  });

  it("gives the figure when every cost read succeeded", () => {
    const invoices = [inv({ id: "i", balance_cents: 100_000_00, due_date: "2026-10-15" })];
    const m = aggregateRunway(invoices, [exp({ id: "e", incurred_on: "2026-07-05", amount_cents: 1_000_00 })], [], FX, NOW, { horizon: 3 });
    expect(m.costsIncomplete).toBe(false);
    expect(m.runwayMonths).not.toBeNull();
  });
});
