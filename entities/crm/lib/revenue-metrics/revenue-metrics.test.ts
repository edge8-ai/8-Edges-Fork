import { describe, expect, it } from "vitest";
import { aggregatePipeline, type PipelineDeal, type PipelineStage } from "./pipeline";
import { aggregateDemand } from "./demand";
import { aggregateBilling, type BillingDeal } from "./billing";
import { aggregateMarket } from "./market";
import { ageBucket, lastMonths, nextMonths, sourceChannel } from "./shared";

// Fixtures in, numbers out (RH-3). Each aggregate is a pure function over rows,
// so the tests pin the buckets, the month axes, the completeness counts and
// the empty case. None of the row types carries an owner, assignee or author
// column, and this file is where that stays true: adding one is a review flag.

const NOW = new Date("2026-09-13T12:00:00Z");
const STAGES: PipelineStage[] = [
  { id: "new", name: "New", position: 0, is_won: false, is_lost: false },
  { id: "prop", name: "Proposal", position: 3, is_won: false, is_lost: false },
  { id: "won", name: "Won", position: 5, is_won: true, is_lost: false },
  { id: "lost", name: "Lost", position: 6, is_won: false, is_lost: true },
];
const deal = (o: Partial<PipelineDeal> & { id: string }): PipelineDeal => ({
  stage_id: "new", status: "open", amount_usd_cents: null, amount_cents: null, currency: "usd", probability: null, source: null,
  created_at: "2026-09-01T00:00:00Z", closed_at: null, expected_close_date: null, lost_reason: null, archived_at: null, ...o,
});

describe("shared", () => {
  it("builds month axes ending and starting this month", () => {
    expect(lastMonths(3, NOW)).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(nextMonths(2, NOW)).toEqual(["2026-09", "2026-10"]);
  });
  it("buckets ages on the 7/30/90 boundaries", () => {
    expect([0, 7, 8, 30, 31, 90, 91].map(ageBucket)).toEqual(["0–7 d", "0–7 d", "8–30 d", "8–30 d", "31–90 d", "31–90 d", "90+ d"]);
  });
  it("reads the old system's name as a channel and humanises the unknown", () => {
    expect(sourceChannel("thoughtflow_crm")).toBe("legacy import");
    expect(sourceChannel("order:stripe")).toBe("stripe order");
    expect(sourceChannel("linkedin_dm")).toBe("linkedin dm");
    expect(sourceChannel(null)).toBe("no source");
  });
});

describe("aggregatePipeline", () => {
  it("returns zeros and full axes on no rows", () => {
    const m = aggregatePipeline([], STAGES, [], NOW);
    expect(m.open).toBe(0);
    expect(m.byStage.map((s) => s.count)).toEqual([0, 0, 0, 0]);
    expect(m.closedByMonth).toHaveLength(12);
    expect(m.forecastByMonth).toHaveLength(6);
    expect(m.ageInStage.map((b) => b.value)).toEqual([0, 0, 0, 0]);
    expect(m.logSince).toBeNull();
  });

  it("sums open, weighted and won, excludes archived, and counts what is missing", () => {
    const deals = [
      deal({ id: "a", stage_id: "prop", amount_usd_cents: 100_000, probability: 50, expected_close_date: "2026-10-15", source: "referral" }),
      deal({ id: "b", stage_id: "new" }),
      deal({ id: "c", stage_id: "won", status: "won", amount_usd_cents: 250_000, closed_at: "2026-08-20T00:00:00Z", source: "referral" }),
      deal({ id: "d", stage_id: "lost", status: "lost", closed_at: "2026-08-02T00:00:00Z", source: "x" }),
      deal({ id: "e", stage_id: "prop", amount_usd_cents: 999_999, archived_at: "2026-01-01T00:00:00Z" }),
    ];
    const m = aggregatePipeline(deals, STAGES, [], NOW);
    expect(m.live).toBe(4);
    expect(m.archived).toBe(1);
    expect(m.open).toBe(2);
    expect(m.openUsd).toBe(1000);
    expect(m.openWeightedUsd).toBe(500);
    expect(m.wonCount.value).toBe(1);
    expect(m.lostCount).toBe(1);
    expect(m.wonUsd.value).toBe(2500);
    expect(m.winRate).toBe(50);
    expect(m.closedByMonth.find((p) => p.month === "2026-08")).toMatchObject({ won: 1, lost: 1, wonUsd: 2500 });
    expect(m.forecastByMonth.find((p) => p.month === "2026-10")).toMatchObject({ count: 1, usd: 1000, weightedUsd: 500 });
    expect(m.byStage.find((s) => s.stage === "Proposal")).toMatchObject({ count: 1, usd: 1000 });
    expect(m.completeness).toEqual({ noAmount: 1, noExpectedClose: 1, noSource: 1, noStage: 0, foreignNoUsd: 0 });
  });

  it("never adds a native non-USD amount into a dollar total", () => {
    const deals = [
      deal({ id: "thb", stage_id: "prop", amount_cents: 3_500_000, currency: "thb" }),
      deal({ id: "usd", stage_id: "prop", amount_cents: 100_000, currency: "usd" }),
      deal({ id: "fx", stage_id: "prop", amount_cents: 3_500_000, amount_usd_cents: 100_000, currency: "thb" }),
    ];
    expect(aggregatePipeline(deals, STAGES, [], NOW).openUsd).toBe(2000);
  });

  it("ages an open deal from the log row that put it in its stage, else from creation", () => {
    const deals = [deal({ id: "a", stage_id: "prop", created_at: "2026-05-01T00:00:00Z" }), deal({ id: "b", stage_id: "new", created_at: "2026-09-10T00:00:00Z" })];
    const log = [
      { deal_id: "a", to_stage_id: "prop", moved_at: "2026-09-12T00:00:00Z", kind: "move" },
      { deal_id: "a", to_stage_id: "new", moved_at: "2026-06-01T00:00:00Z", kind: "seed" },
    ];
    const m = aggregatePipeline(deals, STAGES, log, NOW);
    expect(m.ageInStage).toEqual([{ label: "0–7 d", value: 2 }, { label: "8–30 d", value: 0 }, { label: "31–90 d", value: 0 }, { label: "90+ d", value: 0 }]);
    expect(m.ageSinceCreated.find((b) => b.label === "90+ d")?.value).toBe(1);
    expect(m.logSince).toBe("2026-06-01T00:00:00Z");
  });
});

describe("aggregateDemand", () => {
  it("counts inquiries by month, site and link, deals by channel, and campaigns by what they produced", () => {
    const inquiries = [
      { id: "1", created_at: "2026-09-02T00:00:00Z", source: null, source_site: "edge8.ai", type: "consultation", status: "new_lead", deal_id: "d1", campaign_id: "c1" },
      { id: "2", created_at: "2026-08-02T00:00:00Z", source: "referral", source_site: null, type: "general", status: "archived", deal_id: null, campaign_id: null },
      { id: "3", created_at: "2025-01-02T00:00:00Z", source: null, source_site: "edge8.ai", type: "retreat", status: "won", deal_id: null, campaign_id: null },
    ];
    const deals = [
      { id: "d1", source: "thoughtflow_crm", campaign_id: "c1", status: "won", amount_usd_cents: 500_000, amount_cents: null, archived_at: null },
      { id: "d2", source: "referral", campaign_id: "c1", status: "open", amount_usd_cents: 100_000, amount_cents: null, archived_at: null },
      { id: "d3", source: "referral", campaign_id: null, status: "open", amount_usd_cents: null, amount_cents: null, archived_at: "2026-01-01" },
    ];
    const m = aggregateDemand(inquiries, deals, [{ id: "c1", name: "Autumn letter" }], NOW);
    expect(m.inquiries).toBe(3);
    expect(m.inquiriesInRange.value).toBe(2);
    expect(m.linkedToDeal).toBe(1);
    expect(m.archived).toBe(1);
    expect(m.byMonth.find((p) => p.month === "2026-09")?.count).toBe(1);
    expect(m.bySite[0]).toEqual({ label: "edge8.ai", value: 2 });
    expect(m.dealsByChannel).toEqual([{ channel: "legacy import", count: 1, usd: 5000 }, { channel: "referral", count: 1, usd: 1000 }]);
    expect(m.campaigns).toEqual([{ campaign: "Autumn letter", inquiries: 1, deals: 2, won: 1, usd: 5000 }]);
    expect(m.unattributed).toEqual({ inquiries: 2, deals: 0 });
  });
  it("is empty-safe", () => {
    const m = aggregateDemand([], [], [], NOW);
    expect(m.byMonth).toHaveLength(12);
    expect(m.campaigns).toEqual([]);
  });
});

describe("aggregateBilling", () => {
  it("ignores voided invoices, lists overdue by age, and matches won deals to their linked invoices", () => {
    const invoices = [
      { id: "i1", doc_number: "1001", customer_name: "Acme", amount_cents: 100_000, amount_usd_cents: null, balance_cents: 0, balance_usd_cents: null, currency: "usd", status: "paid", txn_date: "2026-08-10", due_date: "2026-09-01", deal_id: "d1", company_id: "co" },
      { id: "i2", doc_number: "1002", customer_name: "Acme", amount_cents: 50_000, amount_usd_cents: null, balance_cents: 50_000, balance_usd_cents: null, currency: "usd", status: "overdue", txn_date: "2026-08-20", due_date: "2026-09-03", deal_id: null, company_id: "co" },
      { id: "i3", doc_number: "1003", customer_name: "Void", amount_cents: 999_999, amount_usd_cents: null, balance_cents: 999_999, balance_usd_cents: null, currency: "usd", status: "voided", txn_date: "2026-08-21", due_date: "2026-08-01", deal_id: null, company_id: "co" },
    ];
    const billingDeal = (o: Partial<BillingDeal> & { id: string }): BillingDeal => ({
      title: null, status: "open", stage_id: null, amount_usd_cents: null, amount_cents: null, currency: "usd",
      probability: null, closed_at: null, expected_close_date: null, archived_at: null, ...o,
    });
    const deals = [
      billingDeal({ id: "d1", title: "Acme program", status: "won", amount_usd_cents: 120_000, closed_at: "2026-08-01" }),
      billingDeal({ id: "d2", title: "Beta", status: "won", amount_usd_cents: 30_000, closed_at: "2026-07-01" }),
      billingDeal({ id: "d3", title: "Open one", status: "open", amount_usd_cents: 30_000 }),
    ];
    const m = aggregateBilling(invoices, deals, NOW);
    expect(m.byMonth.find((p) => p.month === "2026-08")).toMatchObject({ count: 2, amount: 1500 });
    expect(m.openBalance).toBe(500);
    expect(m.overdue).toEqual([{ id: "i2", companyId: "co", docNumber: "1002", customer: "Acme", balance: 500, dueDate: "2026-09-03", daysOverdue: 10 }]);
    expect(m.wonBilled).toEqual([
      { dealId: "d1", title: "Acme program", wonUsd: 1200, billedUsd: 1000, invoices: 1, closedAt: "2026-08-01" },
      { dealId: "d2", title: "Beta", wonUsd: 300, billedUsd: 0, invoices: 0, closedAt: "2026-07-01" },
    ]);
    expect(m.unlinkedInvoices).toBe(1);
    expect(m.wonWithoutInvoice).toBe(1);
  });
});

describe("aggregateMarket", () => {
  it("counts the live company base and picks the newest trend report", () => {
    const companies = [
      { id: "1", lifecycle_stage: "customer", industry_normalized: "Technology", country: "Vietnam", size_band: "11-50", archived_at: null },
      { id: "2", lifecycle_stage: null, industry_normalized: null, country: "Vietnam", size_band: null, archived_at: null },
      { id: "3", lifecycle_stage: "lead", industry_normalized: "Retail", country: "Australia", size_band: null, archived_at: "2026-01-01" },
    ];
    const m = aggregateMarket(companies, [
      { themes: ["old"], source_count: 3, generated_at: "2026-08-25T00:00:00Z" },
      { themes: ["new theme"], source_count: 5, generated_at: "2026-09-07T00:00:00Z" },
    ]);
    expect(m.companies).toBe(2);
    expect(m.byLifecycle).toEqual([{ label: "customer", value: 1 }, { label: "none", value: 1 }]);
    expect(m.byCountry).toEqual([{ label: "Vietnam", value: 2 }]);
    expect(m.trend).toEqual({ themes: ["new theme"], sourceCount: 5, generatedAt: "2026-09-07T00:00:00Z" });
    expect(m.trendHistory).toBe(2);
  });
  it("has no trend when there are no reports", () => {
    expect(aggregateMarket([], []).trend).toBeNull();
  });
});
