import { describe, expect, it } from "vitest";
import { aggregateCashForecast, type BillingDeal } from "./billing";
import { computeFocusSets } from "./health";
import { aggregateOverview, type OverviewDeal, type OverviewInputs, type OverviewStage } from "./overview";
import { aggregatePipeline, type PipelineDeal } from "./pipeline";
import { dealState, type StageFlags } from "./shared";

// One deal, four tabs, one answer.
//
// `dealState` exists so the Revenue hub's tabs cannot disagree about which
// deals are won, and until A.9 only Pipeline and Billing called it — Overview
// and Data health each restated the predicate. All three copies agreed, so
// this is drift prevention rather than a bug fix, and the way to prevent drift
// is to ask all four the same question in one test.
//
// The deal below is the case the seam was built for: its own status was never
// moved off "open", but it sits in a stage flagged won. Counting it as
// pipeline is how a forecast quietly inflates.

const NOW = new Date("2026-09-14T12:00:00Z");
const STAGES: StageFlags[] = [
  { id: "disc", is_won: false, is_lost: false },
  { id: "won", is_won: true, is_lost: false },
];
const NAMED_STAGES: OverviewStage[] = [
  { id: "disc", name: "Discovery", position: 1, is_won: false, is_lost: false },
  { id: "won", name: "Closed Won", position: 2, is_won: true, is_lost: false },
];

// Won by its stage, never by its status.
const WON_BY_STAGE = {
  id: "d1",
  status: "open",
  stage_id: "won",
  archived_at: null,
  amount_cents: 10_000_00,
  amount_usd_cents: 10_000_00,
  currency: "usd",
  closed_at: "2026-09-01T00:00:00Z",
  expected_close_date: "2026-09-30",
};

const overviewDeal: OverviewDeal = {
  ...WON_BY_STAGE,
  title: "A deal",
  probability: null,
  owner_id: null,
  next_step: null,
  next_step_date: null,
  created_at: "2026-01-01T00:00:00Z",
};

const overviewInput: OverviewInputs = {
  deals: [overviewDeal],
  stages: NAMED_STAGES,
  invoices: [],
  orders: [],
  leads90: [],
  activeLeads: [],
  inquiries30: 0,
};

describe("the Revenue tabs agree about a deal won by its stage", () => {
  it("shared.ts calls it won and closed", () => {
    const { isWon, isOpen } = dealState(STAGES);
    expect(isWon(WON_BY_STAGE)).toBe(true);
    expect(isOpen(WON_BY_STAGE)).toBe(false);
  });

  it("Overview keeps it out of open pipeline and counts it in won YTD", () => {
    const m = aggregateOverview(overviewInput, NOW);
    expect(m.openPipeline).toBe(0);
    expect(m.openCount).toBe(0);
    expect(m.wonYtd).toBe(10_000);
  });

  it("Data health calls it won-unbilled, not an open-deal gap", () => {
    // The tab whose whole job is catching tabs that disagree.
    const focus = computeFocusSets([{ ...WON_BY_STAGE, source: "referral", campaign_id: "c", company_id: "co", next_step: null, next_step_date: null, updated_at: NOW.toISOString() }], STAGES, new Set(), new Set(["d1"]), NOW);
    expect(focus["won-unbilled"]).toEqual(["d1"]);
    expect(focus["no-next-step"]).toEqual([]);
  });

  it("Pipeline counts it won, not open", () => {
    const deal: PipelineDeal = { ...WON_BY_STAGE, probability: null, source: null, created_at: "2026-01-01T00:00:00Z", lost_reason: null };
    const m = aggregatePipeline([deal], NAMED_STAGES, [], NOW);
    expect(m.open).toBe(0);
    expect(m.openUsd).toBe(0);
    expect(m.wonUsd.value).toBe(10_000);
  });

  it("Billing forecasts no cash from it, because it is not open", () => {
    const deal: BillingDeal = { ...WON_BY_STAGE, title: null, probability: null };
    expect(aggregateCashForecast([], [deal], STAGES, NOW).total).toBe(0);
  });
});
