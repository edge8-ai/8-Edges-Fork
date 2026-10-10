import { describe, expect, it } from "vitest";
import { arBucket, compared, parseRange, pctDelta, rangeMonths, rangeWindows } from "./shared";
import { aggregatePipeline, type PipelineDeal, type PipelineStage } from "./pipeline";
import { aggregateBilling, type BillingInvoice } from "./billing";
import { aggregateMarket, findDuplicateCompanies, normalizeCompanyName } from "./market";
import { aggregateClients } from "./clients";
import type { DeliveryCost } from "@/entities/finance";
import { aggregateOverview, dealGaps, type OverviewDeal } from "./overview";
import { buildHealthChecks, computeFocusSets, isDealFocus } from "./health";
import { periodProgress, periodStart, targetFor } from "./targets";
import { aggregateDemand } from "./demand";
import { stageEntryPatch } from "../deal-stage";

// The second pass over the Revenue hub (2026-09-13): the range and its prior
// window, the deltas, the new aggregates (stage flow, channel wins, snapshot
// history, recurring versus project, receivable aging, duplicates, the
// overview's maths) and the focus sets behind every Data health count.

const NOW = new Date("2026-09-13T12:00:00Z");

const STAGES: PipelineStage[] = [
  { id: "new", name: "New", position: 0, is_won: false, is_lost: false },
  { id: "disc", name: "Discovery", position: 1, is_won: false, is_lost: false },
  { id: "prop", name: "Proposal", position: 2, is_won: false, is_lost: false },
  { id: "won", name: "Won", position: 3, is_won: true, is_lost: false },
  { id: "lost", name: "Lost", position: 4, is_won: false, is_lost: true },
];

const deal = (o: Partial<PipelineDeal> & { id: string }): PipelineDeal => ({
  stage_id: "disc",
  status: "open",
  lost_reason: null,
  amount_usd_cents: 100_000,
  amount_cents: 100_000,
  currency: "usd",
  probability: 50,
  source: "referral",
  created_at: "2026-08-01T00:00:00Z",
  closed_at: null,
  expected_close_date: null,
  archived_at: null,
  ...o,
});

describe("range", () => {
  it("parses a known range and falls back to twelve months", () => {
    expect(parseRange("3m")).toBe("3m");
    expect(parseRange(["ytd"])).toBe("ytd");
    expect(parseRange("nonsense")).toBe("12m");
    expect(parseRange(undefined)).toBe("12m");
  });
  it("year to date is the months of the year so far", () => {
    expect(rangeMonths("ytd", NOW)).toBe(9);
    expect(rangeMonths("6m", NOW)).toBe(6);
  });
  it("the prior window is the same length and ends where this one starts", () => {
    const w = rangeWindows("3m", NOW);
    expect(w.months).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(w.prior).toEqual(["2026-04", "2026-05", "2026-06"]);
  });
  it("a delta against an empty prior window is null, not infinity", () => {
    expect(pctDelta(10, 0)).toBeNull();
    expect(pctDelta(150, 100)).toBe(50);
    expect(compared(80, 100)).toEqual({ value: 80, prior: 100, delta: -20 });
  });
  it("receivable ages into five buckets", () => {
    expect(arBucket(-3)).toBe("current");
    expect(arBucket(30)).toBe("1–30 d");
    expect(arBucket(31)).toBe("31–60 d");
    expect(arBucket(91)).toBe("90+ d");
  });
});

describe("aggregatePipeline v2", () => {
  it("compares the range with the prior window and reads win rate by channel", () => {
    const deals = [
      deal({ id: "a", stage_id: "won", status: "won", closed_at: "2026-08-10T00:00:00Z", amount_usd_cents: 300_000, source: "referral" }),
      deal({ id: "b", stage_id: "lost", status: "lost", closed_at: "2026-09-01T00:00:00Z", source: "referral" }),
      deal({ id: "c", stage_id: "won", status: "won", closed_at: "2026-04-10T00:00:00Z", amount_usd_cents: 100_000, source: "inbound" }),
      deal({ id: "d", stage_id: "won", status: "won", closed_at: "2026-08-20T00:00:00Z", amount_usd_cents: 50_000, source: "sdr_handoff" }),
    ];
    const m = aggregatePipeline(deals, STAGES, [], NOW, { range: "3m" });
    expect(m.range).toBe("3m");
    expect(m.wonCount).toEqual({ value: 2, prior: 1, delta: 100 });
    expect(m.wonUsd).toEqual({ value: 3500, prior: 1000, delta: 250 });
    expect(m.winRate).toBe(67);
    expect(m.channelWins).toEqual([
      { channel: "referral", won: 1, lost: 1, winRate: 50, wonUsd: 3000 },
      { channel: "outbound (SDR)", won: 1, lost: 0, winRate: 100, wonUsd: 500 },
    ]);
  });

  it("shapes the velocity rows into stage flow in stage order, open stages only", () => {
    const m = aggregatePipeline([], STAGES, [], NOW, {
      velocity: [
        { stage_id: "disc", entered: 10, exited: 8, advanced: 5, won: 1, lost: 2, avg_days: 12.5, median_days: 9 },
        { stage_id: "won", entered: 3, exited: 0, advanced: 0, won: 0, lost: 0, avg_days: null, median_days: null },
      ],
    });
    expect(m.stageFlow.map((s) => s.stage)).toEqual(["New", "Discovery", "Proposal"]);
    const disc = m.stageFlow[1];
    expect(disc).toMatchObject({ entered: 10, advanced: 6, lost: 2, conversion: 75, medianDays: 9, avgDays: 12.5 });
    expect(m.stageFlow[0].conversion).toBeNull();
  });

  it("orders snapshot history by day and converts cents to dollars", () => {
    const m = aggregatePipeline([], STAGES, [], NOW, {
      snapshots: [
        { taken_on: "2026-09-13", open_deals: 12, open_usd_cents: 80_000_000, open_weighted_usd_cents: 40_000_000 },
        { taken_on: "2026-09-12", open_deals: 11, open_usd_cents: 70_000_000, open_weighted_usd_cents: 35_000_000 },
      ],
    });
    expect(m.history.map((h) => h.date)).toEqual(["2026-09-12", "2026-09-13"]);
    expect(m.history[1]).toMatchObject({ openUsd: 800_000, weightedUsd: 400_000, openDeals: 12, label: "Sep 13" });
  });

  it("separates a foreign deal with no USD figure from a deal with no amount", () => {
    const deals = [deal({ id: "thb", currency: "thb", amount_cents: 500_000, amount_usd_cents: null }), deal({ id: "none", amount_cents: null, amount_usd_cents: null })];
    const m = aggregatePipeline(deals, STAGES, [], NOW);
    expect(m.completeness.foreignNoUsd).toBe(1);
    expect(m.completeness.noAmount).toBe(1);
    expect(m.openUsd).toBe(0);
  });

  it("takes the log's true start from the loader rather than the current rows", () => {
    const m = aggregatePipeline([], STAGES, [{ deal_id: "a", to_stage_id: "disc", moved_at: "2026-09-10T00:00:00Z" }], NOW, { logSince: "2026-06-01T00:00:00Z" });
    expect(m.logSince).toBe("2026-06-01T00:00:00Z");
  });

  it("carries the loader's errors", () => {
    expect(aggregatePipeline([], STAGES, [], NOW, { errors: ["deals: boom"] }).errors).toEqual(["deals: boom"]);
  });
});

describe("aggregateDemand v2", () => {
  it("reads touches from the aggregated rows and compares the range", () => {
    const inquiries = [
      { id: "i1", created_at: "2026-09-02T00:00:00Z", source: "site", source_site: "edge8.ai", type: "consultation", status: "new_lead", deal_id: null, campaign_id: null },
      { id: "i2", created_at: "2026-05-02T00:00:00Z", source: "site", source_site: "edge8.ai", type: "consultation", status: "new_lead", deal_id: null, campaign_id: null },
    ];
    const m = aggregateDemand(inquiries, [], [], NOW, {
      range: "3m",
      touches: [
        { month: "2026-09", kind: "email", n: 40 },
        { month: "2026-09", kind: "call", n: 2 },
        { month: "2026-08", kind: "email", n: 10 },
      ],
    });
    expect(m.inquiriesInRange).toEqual({ value: 1, prior: 1, delta: 0 });
    expect(m.interactionsByMonth.find((p) => p.month === "2026-09")?.count).toBe(42);
    expect(m.interactionsByKind).toEqual([
      { label: "email", value: 50 },
      { label: "call", value: 2 },
    ]);
  });
});

describe("aggregateBilling v2", () => {
  const inv = (o: Partial<BillingInvoice> & { id: string }): BillingInvoice => ({
    doc_number: o.id,
    customer_name: "Acme",
    amount_cents: 100_000,
    amount_usd_cents: null,
    balance_cents: 0,
    balance_usd_cents: null,
    currency: "usd",
    status: "paid",
    txn_date: "2026-09-01",
    due_date: "2026-09-30",
    deal_id: null,
    company_id: null,
    kind: null,
    ...o,
  });
  it("splits the month into recurring and project and ages the receivable", () => {
    const invoices = [
      inv({ id: "r1", kind: "recurring", amount_cents: 300_000 }),
      inv({ id: "p1", kind: "project", amount_cents: 100_000 }),
      inv({ id: "u1", amount_cents: 100_000 }),
      inv({ id: "late", status: "overdue", balance_cents: 50_000, due_date: "2026-07-01" }),
      inv({ id: "soon", status: "open", balance_cents: 20_000, due_date: "2026-10-01" }),
    ];
    const m = aggregateBilling(invoices, [], NOW, { range: "3m" });
    const sep = m.byMonth.find((p) => p.month === "2026-09");
    expect(sep).toMatchObject({ recurring: 3000, project: 4000, amount: 7000 });
    expect(m.recurringLastMonth).toBe(3000);
    expect(m.unclassified).toBe(3);
    expect(m.arAging).toEqual([
      { label: "current", value: 200 },
      { label: "1–30 d", value: 0 },
      { label: "31–60 d", value: 0 },
      { label: "61–90 d", value: 500 },
      { label: "90+ d", value: 0 },
    ]);
    expect(m.invoicedInRange.value).toBe(7000);
  });
});

describe("aggregateMarket v2", () => {
  it("finds duplicates once suffixes and punctuation are dropped", () => {
    expect(normalizeCompanyName("Acme Pty Ltd.")).toBe("acme");
    expect(normalizeCompanyName("The ACME Group")).toBe("acme");
    const groups = findDuplicateCompanies([
      { id: "1", name: "Acme Pty Ltd", lifecycle_stage: null, industry_normalized: null, country: null, size_band: null, archived_at: null },
      { id: "2", name: "ACME", lifecycle_stage: null, industry_normalized: null, country: null, size_band: null, archived_at: null },
      { id: "3", name: "Other Co", lifecycle_stage: null, industry_normalized: null, country: null, size_band: null, archived_at: null },
    ]);
    expect(groups).toEqual([{ name: "acme", ids: ["1", "2"] }]);
    expect(aggregateMarket([], [], ["companies: x"]).errors).toEqual(["companies: x"]);
  });
});

describe("aggregateOverview", () => {
  const od = (o: Partial<OverviewDeal> & { id: string }): OverviewDeal => ({
    title: null,
    stage_id: "disc",
    status: "open",
    amount_cents: 100_000,
    amount_usd_cents: 100_000,
    currency: "usd",
    probability: 50,
    owner_id: "o",
    next_step: "call",
    next_step_date: "2026-09-20",
    expected_close_date: null,
    created_at: "2026-09-01T00:00:00Z",
    closed_at: null,
    archived_at: null,
    ...o,
  });
  it("names the four gaps a deal can have", () => {
    expect(dealGaps({ owner_id: null, amount_usd_cents: null, amount_cents: null, currency: "usd", next_step: null, next_step_date: null })).toEqual(["Owner", "Value", "Next step", "Date"]);
    expect(dealGaps({ owner_id: "o", amount_usd_cents: null, amount_cents: 500, currency: "usd", next_step: "x", next_step_date: "2026-01-01" })).toEqual([]);
  });
  it("adds invoices and paid orders into revenue and sorts attention by value", () => {
    const m = aggregateOverview(
      {
        deals: [od({ id: "big", owner_id: null, amount_usd_cents: 900_000, company_name: "Big Co" }), od({ id: "small", next_step: null, title: "Small" }), od({ id: "won", status: "won", stage_id: "won", created_at: "2026-02-01T00:00:00Z", closed_at: "2026-03-01T00:00:00Z", amount_usd_cents: 250_000 })],
        stages: STAGES,
        invoices: [
          { txn_date: "2026-09-01", amount_cents: 100_000, amount_usd_cents: null, balance_cents: 100_000, balance_usd_cents: null, currency: "usd", status: "open", entity: "edge8", kind: "recurring" },
          { txn_date: "2025-12-01", amount_cents: 50_000, amount_usd_cents: null, balance_cents: 0, balance_usd_cents: null, currency: "usd", status: "paid", entity: "aio" },
          { txn_date: "2024-01-01", amount_cents: 999_999, amount_usd_cents: null, balance_cents: 0, balance_usd_cents: null, currency: "usd", status: "paid", entity: "aio" },
        ],
        orders: [{ created_at: "2026-09-05T00:00:00Z", amount_usd_cents: 20_000, status: "paid" }, { created_at: "2026-09-05T00:00:00Z", amount_usd_cents: 20_000, status: "refunded" }],
        leads90: [{ created_at: "2026-09-01T00:00:00Z" }, { created_at: "2026-07-20T00:00:00Z" }],
        activeLeads: [{ created_at: "2026-09-01T00:00:00Z", sla_due_at: "2026-09-01T00:00:00Z" }],
        inquiries30: 4,
      },
      NOW,
    );
    expect(m.revenue12m.value).toBe(1700);
    expect(m.revenueYtd).toBe(1200);
    expect(m.revenueByMonth.find((p) => p.month === "2026-09")).toMatchObject({ usd: 1200, recurring: 1000 });
    expect(m.arOutstanding).toBe(1000);
    expect(m.wonYtd).toBe(2500);
    expect(m.openPipeline).toBe(10_000);
    expect(m.newLeads30).toEqual({ value: 1, prior: 1, delta: 0 });
    expect(m.slaOverdue).toBe(1);
    expect(m.funnel30.map((f) => f.value)).toEqual([4, 1, 2, 0]);
    expect(m.conversion90).toBe(0);
    expect(m.needsAttention.map((d) => d.title)).toEqual(["Big Co", "Small"]);
    expect(m.needsAttention[0].gaps).toEqual(["Owner"]);
  });
});

describe("focus sets and the checklist", () => {
  it("puts each live deal into the focuses it belongs to", () => {
    const deals = [
      { id: "a", stage_id: "prop", status: "open", amount_cents: null, amount_usd_cents: null, currency: "usd", source: null, campaign_id: null, company_id: null, next_step: null, next_step_date: null, expected_close_date: null, updated_at: "2026-01-01T00:00:00Z", archived_at: null },
      { id: "b", stage_id: "won", status: "won", amount_cents: 100, amount_usd_cents: 100, currency: "usd", source: "thoughtflow_crm", campaign_id: "c", company_id: "co", next_step: "x", next_step_date: "2026-09-20", expected_close_date: "2026-09-20", updated_at: "2026-09-10T00:00:00Z", archived_at: null },
      { id: "z", stage_id: "prop", status: "open", amount_cents: null, amount_usd_cents: null, currency: "usd", source: null, campaign_id: null, company_id: null, next_step: null, next_step_date: null, expected_close_date: null, updated_at: null, archived_at: "2026-01-01" },
    ];
    const f = computeFocusSets(deals, STAGES, new Set(), new Set(["a"]), NOW);
    expect(f["no-amount"]).toEqual(["a"]);
    expect(f["no-close-date"]).toEqual(["a"]);
    expect(f["no-source"]).toEqual(["a"]);
    expect(f["legacy-import"]).toEqual(["b"]);
    expect(f["no-campaign"]).toEqual(["a"]);
    expect(f["no-company"]).toEqual(["a"]);
    expect(f["no-next-step"]).toEqual(["a"]);
    expect(f["stale-90"]).toEqual(["a"]);
    expect(f["won-unbilled"]).toEqual(["b"]);
    expect(f["no-stage-log"]).toEqual(["b"]);
    expect(isDealFocus("no-amount")).toBe(true);
    expect(isDealFocus("owner-x")).toBe(false);
  });

  const emptyDeliveryCost = (): DeliveryCost => ({
    byClient: [], byKind: { recurring: 0, project: 0, unknown: 0 }, unmappedCents: 0, untaggedSpendCents: 0,
    mappedCents: 0, gaps: { untaggedExpenses: 0, unassignedPayments: 0, foreignCurrencyRows: 0 }, errors: [],
  });

  it("every deal check links to its focus, and advisory rows are marked", () => {
    const p = aggregatePipeline([], STAGES, [], NOW);
    const d = aggregateDemand([], [], [], NOW);
    const b = aggregateBilling([], [], NOW);
    const m = aggregateMarket([], []);
    const f = computeFocusSets([], STAGES, new Set(), new Set(), NOW);
    const c = aggregateClients([], [], emptyDeliveryCost(), [], "12m");
    const checks = buildHealthChecks(p, d, b, m, f, c);
    for (const c of checks.filter((c) => c.href.startsWith("/admin/revenue/deals?focus="))) {
      expect(isDealFocus(c.href.split("focus=")[1])).toBe(true);
    }
    expect(checks.find((c) => c.key === "inv-unlinked")?.href).toBe("/admin/revenue/invoices?deal=none");
    expect(checks.find((c) => c.key === "no-campaign")?.tone).toBe("info");
    expect(checks.every((c) => c.count === 0)).toBe(true);
  });
});

describe("targets", () => {
  it("knows the current period's first day and how far along it is", () => {
    expect(periodStart("month", NOW)).toBe("2026-09-01");
    expect(periodStart("quarter", NOW)).toBe("2026-07-01");
    expect(periodStart("year", NOW)).toBe("2026-01-01");
    expect(periodProgress("month", NOW)).toBeCloseTo(12.5 / 30, 2);
    expect(periodProgress("year", NOW)).toBeGreaterThan(0.69);
  });
  it("finds the row for the current period only", () => {
    const rows = [
      { id: "1", metric: "won_usd", period_kind: "month", period_start: "2026-09-01", amount: 50_000, note: null, updated_at: "" },
      { id: "2", metric: "won_usd", period_kind: "month", period_start: "2026-08-01", amount: 40_000, note: null, updated_at: "" },
    ];
    expect(targetFor(rows, "won_usd", "month", NOW)?.amount).toBe(50_000);
    expect(targetFor(rows, "inquiries", "month", NOW)).toBeNull();
  });
});

describe("stageEntryPatch", () => {
  it("applies the stage's default and leaves closed stages alone", () => {
    expect(stageEntryPatch({ is_won: false, is_lost: false, default_probability: 90 })).toEqual({ probability: 90 });
    expect(stageEntryPatch({ is_won: false, is_lost: false, default_probability: null })).toEqual({});
    expect(stageEntryPatch({ is_won: true, is_lost: false, default_probability: 90 })).toEqual({});
  });
});
