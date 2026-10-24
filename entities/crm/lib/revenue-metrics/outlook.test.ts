import { describe, expect, it } from "vitest";
import { aggregateRecurringForecast, parseHorizon, type ForecastInvoice, type ForecastProduct, type ForecastSubscription } from "./outlook";

// The recurring roll-forward (S.8), as a pure function over fixtures. The rule
// every case defends is the hub's: a figure the data cannot support arrives as
// null or as a counted gap, never as a zero that reads as good news. No row
// type in this file carries a person column — `subscriptions.person_id` is
// deliberately not on `ForecastSubscription`, so no figure here can be sliced
// by who bought.

const NOW = new Date("2026-09-14T12:00:00Z");

const sub = (o: Partial<ForecastSubscription> & { id: string }): ForecastSubscription => ({
  status: "active", product_id: "p1", current_period_end: null, cancel_at_period_end: false, ...o,
});

const product = (o: Partial<ForecastProduct> & { id: string }): ForecastProduct => ({
  amount_cents: 0, amount_usd_cents: null, currency: "usd", ...o,
});

const inv = (o: Partial<ForecastInvoice> & { id: string }): ForecastInvoice => ({
  amount_cents: 0, amount_usd_cents: null, currency: "usd", status: "paid", txn_date: null, kind: "recurring", ...o,
});

describe("parseHorizon", () => {
  it("takes one of the offered horizons and falls back to the default", () => {
    expect(parseHorizon("3")).toBe(3);
    expect(parseHorizon("12")).toBe(12);
    expect(parseHorizon("7")).toBe(6);
    expect(parseHorizon(undefined)).toBe(6);
  });
});

describe("the baseline is the last COMPLETE month's recurring invoicing", () => {
  it("reads August, not the fortnight of September that has happened", () => {
    const m = aggregateRecurringForecast(
      [],
      [],
      [inv({ id: "a", txn_date: "2026-08-10", amount_cents: 10_000_00 }), inv({ id: "b", txn_date: "2026-09-02", amount_cents: 99_000_00 })],
      NOW,
    );
    expect(m.baselineMonth).toBe("2026-08");
    expect(m.baseline).toBe(10_000);
  });

  it("ignores project invoicing and voided recurring invoices", () => {
    const m = aggregateRecurringForecast(
      [],
      [],
      [
        inv({ id: "a", txn_date: "2026-08-10", amount_cents: 10_000_00 }),
        inv({ id: "b", txn_date: "2026-08-11", amount_cents: 40_000_00, kind: "project" }),
        inv({ id: "c", txn_date: "2026-08-12", amount_cents: 5_000_00, status: "voided" }),
      ],
      NOW,
    );
    expect(m.baseline).toBe(10_000);
  });

  it("counts a foreign recurring invoice as nothing rather than adding it at par", () => {
    const m = aggregateRecurringForecast([], [], [inv({ id: "a", txn_date: "2026-08-10", amount_cents: 300_000_00, currency: "vnd" })], NOW);
    expect(m.baseline).toBe(0);
  });
});

describe("the roll-forward carries the book forward and subtracts only known cancellations", () => {
  const invoices = [inv({ id: "a", txn_date: "2026-08-10", amount_cents: 10_000_00 })];

  it("repeats the baseline across the horizon when nothing is cancelling", () => {
    const m = aggregateRecurringForecast([sub({ id: "s1" })], [product({ id: "p1", amount_cents: 4_000_00 })], invoices, NOW, { horizon: 3 });
    expect(m.months.map((p) => p.month)).toEqual(["2026-09", "2026-10", "2026-11"]);
    expect(m.months.map((p) => p.recurring)).toEqual([10_000, 10_000, 10_000]);
    expect(m.total).toBe(30_000);
    expect(m.churn).toBe(0);
  });

  it("steps the book down in the month after a subscription's last billed month", () => {
    const subs = [
      sub({ id: "s1" }),
      sub({ id: "s2", product_id: "p2", cancel_at_period_end: true, current_period_end: "2026-10-20" }),
    ];
    const products = [product({ id: "p1", amount_cents: 4_000_00 }), product({ id: "p2", amount_cents: 1_500_00 })];
    const m = aggregateRecurringForecast(subs, products, invoices, NOW, { horizon: 3 });
    // October is the last month s2 bills, so the step lands in November.
    expect(m.months.map((p) => p.recurring)).toEqual([10_000, 10_000, 8_500]);
    expect(m.months.map((p) => p.ending)).toEqual([0, 1_500, 0]);
    expect(m.endingCount).toBe(1);
    expect(m.churn).toBe(1_500);
  });

  it("never rolls the book below zero when the cancellations exceed the invoiced baseline", () => {
    const subs = [sub({ id: "s1", cancel_at_period_end: true, current_period_end: "2026-09-30" })];
    const products = [product({ id: "p1", amount_cents: 99_000_00 })];
    const m = aggregateRecurringForecast(subs, products, invoices, NOW, { horizon: 3 });
    expect(m.months.map((p) => p.recurring)).toEqual([10_000, 0, 0]);
  });

  it("draws the contracted book beside it, so a reader can see how much the subscriptions explain", () => {
    const subs = [sub({ id: "s1" }), sub({ id: "s2", product_id: "p2", cancel_at_period_end: true, current_period_end: "2026-10-20" })];
    const products = [product({ id: "p1", amount_cents: 4_000_00 }), product({ id: "p2", amount_cents: 1_500_00 })];
    const m = aggregateRecurringForecast(subs, products, invoices, NOW, { horizon: 3 });
    expect(m.months.map((p) => p.contracted)).toEqual([5_500, 5_500, 4_000]);
    expect(m.contractedNow).toBe(5_500);
    expect(m.coveragePct).toBe(55);
  });

  it("reports coverage as unknown, not as zero, when nothing was invoiced to compare against", () => {
    const m = aggregateRecurringForecast([sub({ id: "s1" })], [product({ id: "p1", amount_cents: 4_000_00 })], [], NOW, { horizon: 3 });
    expect(m.baseline).toBe(0);
    expect(m.coveragePct).toBeNull();
  });
});

describe("what the subscription book cannot price is counted, never guessed", () => {
  it("counts a subscription whose product is missing or has no price", () => {
    const subs = [sub({ id: "s1", product_id: "gone" }), sub({ id: "s2", product_id: null }), sub({ id: "s3", product_id: "p1" })];
    const m = aggregateRecurringForecast(subs, [product({ id: "p1", amount_cents: 4_000_00 })], [], NOW, { horizon: 3 });
    expect(m.contractedNow).toBe(4_000);
    expect(m.gaps.unpricedSubscriptions).toBe(2);
  });

  it("counts a product priced in another currency as a gap rather than adding it at par", () => {
    const m = aggregateRecurringForecast(
      [sub({ id: "s1", product_id: "p2" })],
      [product({ id: "p2", amount_cents: 300_000_00, currency: "vnd" })],
      [],
      NOW,
      { horizon: 3 },
    );
    expect(m.contractedNow).toBe(0);
    expect(m.gaps.foreignProducts).toBe(1);
    expect(m.gaps.unpricedSubscriptions).toBe(0);
  });

  it("takes the normalised USD figure over the native amount when the product carries one", () => {
    const m = aggregateRecurringForecast(
      [sub({ id: "s1", product_id: "p2" })],
      [product({ id: "p2", amount_cents: 300_000_00, amount_usd_cents: 1_200_00, currency: "vnd" })],
      [],
      NOW,
      { horizon: 3 },
    );
    expect(m.contractedNow).toBe(1_200);
    expect(m.gaps.foreignProducts).toBe(0);
  });

  it("leaves a cancelled or unpaid subscription out of the book entirely", () => {
    const subs = [sub({ id: "s1", status: "canceled" }), sub({ id: "s2", status: "unpaid" }), sub({ id: "s3", status: "trialing" })];
    const m = aggregateRecurringForecast(subs, [product({ id: "p1", amount_cents: 4_000_00 })], [], NOW, { horizon: 3 });
    expect(m.contractedNow).toBe(4_000);
    expect(m.liveSubscriptions).toBe(1);
  });
});

describe("the assumptions are part of the answer", () => {
  it("names the baseline month and its figure, so the page can print what the number rests on", () => {
    const m = aggregateRecurringForecast([], [], [inv({ id: "a", txn_date: "2026-08-10", amount_cents: 10_000_00 })], NOW, { horizon: 3 });
    expect(m.assumptions.join(" ")).toContain("August 2026");
    expect(m.assumptions.join(" ")).toContain("$10,000");
  });

  it("says so when there is no month of recurring invoicing to roll forward", () => {
    const m = aggregateRecurringForecast([], [], [], NOW, { horizon: 3 });
    expect(m.assumptions.join(" ")).toContain("no recurring invoicing");
  });
});
