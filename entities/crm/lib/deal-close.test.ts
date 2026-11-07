import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// Closing, reopening and setting aside a deal (A.32, ADR-0011). The lead rule
// is one table; the paths around it run against the kernel fake. The route's
// own tests (revenue/deals/actions.test.ts) pin the win and its announcement.

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (t: string) => builderFor(t) } }));
const getLead = vi.fn();
const recordTransition = vi.fn(async () => {});
const bumpPersonCompanies = vi.fn(async () => {});
vi.mock("./lifecycle", async () => ({
  getLead: (...a: unknown[]) => getLead(...(a as [])),
  recordTransition: (...a: unknown[]) => recordTransition(...(a as [])),
  bumpCompanyLifecycle: vi.fn(async () => {}),
  bumpPersonCompanies: (...a: unknown[]) => bumpPersonCompanies(...(a as [])),
  announceDealWon: vi.fn(async () => {}),
  becomesWon: (await vi.importActual<typeof import("./lifecycle")>("./lifecycle")).becomesWon,
}));
let fromStage = "s-open";
vi.mock("./deal-stage", async () => ({
  loadStageContext: async () => ({
    ok: true,
    deal: { stageId: fromStage, amount_cents: 1000, expected_close_date: "2026-10-01" },
    stages: [
      { id: "s-open", is_won: false, is_lost: false },
      { id: "s-open-2", is_won: false, is_lost: false },
      { id: "s-won", is_won: true, is_lost: false },
      { id: "s-lost", is_won: false, is_lost: true },
    ],
  }),
  forecastInputsError: () => null,
  stageEntryPatch: (await vi.importActual<typeof import("./deal-stage")>("./deal-stage")).stageEntryPatch,
}));
vi.mock("@/kernel/data/fx", () => ({ usdRate: vi.fn(async () => ({ rate: 1, asOf: "2026-09-06" })) }));

import { leadConsequence, moveDealToStage, setDealAside } from "./deal-close";

const mover = { email: "closer@example.com", personId: "closer-person" };
const writes = (table: string, op: string) => calls.filter((c) => c.table === table && c.ops.includes(op));

beforeEach(() => {
  resetFake();
  fromStage = "s-open";
  getLead.mockReset();
  recordTransition.mockClear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-27T05:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("leadConsequence", () => {
  const cases: [string, Parameters<typeof leadConsequence>[0], string][] = [
    ["open to won retires a lead", { from: "open", to: "won", hasLead: true, leadStatus: "open_deal", otherLiveDeals: 0 }, "retire"],
    ["open to won with no lead does nothing", { from: "open", to: "won", hasLead: false, leadStatus: null, otherLiveDeals: 0 }, "none"],
    ["open to lost with no other live deal falls back to nurture", { from: "open", to: "lost", hasLead: true, leadStatus: "open_deal", otherLiveDeals: 0 }, "nurture"],
    ["open to lost with another live deal leaves the lead", { from: "open", to: "lost", hasLead: true, leadStatus: "open_deal", otherLiveDeals: 1 }, "none"],
    ["lost with the lead already at nurture does nothing", { from: "open", to: "lost", hasLead: true, leadStatus: "nurture", otherLiveDeals: 0 }, "none"],
    ["won to lost with no other live deal falls back to nurture", { from: "won", to: "lost", hasLead: false, leadStatus: null, otherLiveDeals: 0 }, "nurture"],
    ["lost reopened puts the person back on an open deal", { from: "lost", to: "open", hasLead: true, leadStatus: "nurture", otherLiveDeals: 0 }, "open_deal"],
    ["won reopened puts the person back on an open deal", { from: "won", to: "open", hasLead: false, leadStatus: null, otherLiveDeals: 0 }, "open_deal"],
    ["a reopen with the lead already on an open deal does nothing", { from: "lost", to: "open", hasLead: true, leadStatus: "open_deal", otherLiveDeals: 0 }, "none"],
    ["a reopen for a customer gives them no lead", { from: "lost", to: "open", hasLead: false, leadStatus: null, otherLiveDeals: 0, isCustomer: true }, "none"],
    ["open to open does nothing", { from: "open", to: "open", hasLead: true, leadStatus: "connected", otherLiveDeals: 0 }, "none"],
    ["won to won does nothing", { from: "won", to: "won", hasLead: false, leadStatus: null, otherLiveDeals: 0 }, "none"],
  ];
  for (const [name, input, want] of cases) it(name, () => expect(leadConsequence(input)).toBe(want));
});

describe("moveDealToStage", () => {
  it("writes the stage and its mover, never the status or the close stamp", async () => {
    script("pipeline_stages", { data: { name: "Discovery", is_won: false, is_lost: false, default_probability: 30 } });
    script("deals", { data: { person_id: null, company_id: null } });

    expect(await moveDealToStage({ dealId: "d1", toStageId: "s-open-2", mover, note: "bulk edit" })).toEqual({ ok: true });

    const [update] = writes("deals", "update");
    expect(update.payloads[0]).toEqual({ stage_id: "s-open-2", stage_moved_by: "closer@example.com", stage_move_note: "bulk edit", probability: 30 });
  });

  it("losing with no other live deal puts the lead at nurture, counting only live deals", async () => {
    getLead.mockResolvedValue({ ok: true, lead: { status: "open_deal" } });
    script("pipeline_stages", { data: { name: "Lost", is_won: false, is_lost: true } });
    script("deals", { data: { person_id: "p1", company_id: null } }, { count: 0 });
    script("lead", {});

    expect(await moveDealToStage({ dealId: "d1", toStageId: "s-lost", mover, lostReason: "price" })).toEqual({ ok: true });

    // The count is of live open or won deals other than this one.
    const count = calls.filter((c) => c.table === "deals")[1];
    expect(count.filters).toEqual(
      expect.arrayContaining([["in", "status", ["open", "won"]], ["is", "archived_at", null], ["neq", "id", "d1"]]),
    );
    expect(writes("lead", "upsert")[0].payloads[0]).toMatchObject({ person_id: "p1", status: "nurture" });
    expect(recordTransition).toHaveBeenCalledWith(expect.objectContaining({ fromStatus: "open_deal", toStatus: "nurture", reason: "deal_lost" }));
  });

  it("losing while another live deal stands leaves the lead alone", async () => {
    getLead.mockResolvedValue({ ok: true, lead: { status: "open_deal" } });
    script("pipeline_stages", { data: { name: "Lost", is_won: false, is_lost: true } });
    script("deals", { data: { person_id: "p1", company_id: null } }, { count: 1 });

    expect(await moveDealToStage({ dealId: "d1", toStageId: "s-lost", mover, lostReason: "price" })).toEqual({ ok: true });
    expect(writes("lead", "upsert")).toHaveLength(0);
  });

  it("a failed count is reported, never read as no other deals", async () => {
    getLead.mockResolvedValue({ ok: true, lead: { status: "open_deal" } });
    script("pipeline_stages", { data: { name: "Lost", is_won: false, is_lost: true } });
    script("deals", { data: { person_id: "p1", company_id: null } }, { error: { message: "timeout" } });

    const res = await moveDealToStage({ dealId: "d1", toStageId: "s-lost", mover, lostReason: "price" });
    expect(res).toEqual({ ok: false, error: "Deal stage saved, but the lead sync failed: timeout" });
    expect(writes("lead", "upsert")).toHaveLength(0);
  });

  it("winning retires the lead and raises the person's companies to customer", async () => {
    getLead.mockResolvedValue({ ok: true, lead: { status: "open_deal" } });
    script("pipeline_stages", { data: { name: "Won", is_won: true, is_lost: false } });
    script("deals", { data: { currency: "usd" } }, { data: { person_id: "p1", company_id: null, closed_at: "2026-09-27T05:00:00Z" } });
    script("lead", {});

    expect(await moveDealToStage({ dealId: "d1", toStageId: "s-won", mover, wonAmount: 500 })).toEqual({ ok: true });
    expect(bumpPersonCompanies).toHaveBeenCalledWith("p1", "customer", { reason: "deal_won" });
    expect(writes("lead", "delete")).toHaveLength(1);
    expect(recordTransition).toHaveBeenCalledWith(expect.objectContaining({ fromStatus: "open_deal", toStatus: null, reason: "deal_won" }));
  });

  it("reopening a deal for a customer gives them no lead row", async () => {
    fromStage = "s-lost";
    getLead.mockResolvedValue({ ok: true, lead: null });
    script("pipeline_stages", { data: { name: "Discovery", is_won: false, is_lost: false, default_probability: null } });
    script("deals", { data: { person_id: "p1", company_id: null } }, { count: 1 });

    expect(await moveDealToStage({ dealId: "d1", toStageId: "s-open", mover })).toEqual({ ok: true });
    const wonCount = calls.filter((c) => c.table === "deals")[1];
    expect(wonCount.filters).toEqual(expect.arrayContaining([["eq", "status", "won"], ["is", "archived_at", null], ["neq", "id", "d1"]]));
    expect(writes("lead", "upsert")).toHaveLength(0);
  });

  it("reopening a lost deal puts the person back on an open deal", async () => {
    fromStage = "s-lost";
    getLead.mockResolvedValue({ ok: true, lead: { status: "nurture" } });
    script("pipeline_stages", { data: { name: "Discovery", is_won: false, is_lost: false, default_probability: null } });
    script("deals", { data: { person_id: "p1", company_id: null } }, { count: 0 });
    script("lead", {});

    expect(await moveDealToStage({ dealId: "d1", toStageId: "s-open", mover })).toEqual({ ok: true });
    expect(writes("lead", "upsert")[0].payloads[0]).toMatchObject({ person_id: "p1", status: "open_deal" });
    expect(recordTransition).toHaveBeenCalledWith(expect.objectContaining({ toStatus: "open_deal", reason: "deal_reopened" }));
  });

  it("a move between open stages never reads the lead", async () => {
    script("pipeline_stages", { data: { name: "Proposal", is_won: false, is_lost: false, default_probability: null } });
    script("deals", { data: { person_id: "p1", company_id: null } });

    expect(await moveDealToStage({ dealId: "d1", toStageId: "s-open-2", mover })).toEqual({ ok: true });
    expect(getLead).not.toHaveBeenCalled();
  });
});

describe("setDealAside", () => {
  it("archives the deal with the caller's answer and reopens the lead at connected", async () => {
    getLead.mockResolvedValue({ ok: true, lead: null });
    script("deals", {});
    script("lead", {});

    const res = await setDealAside({
      dealId: "d1",
      personId: "p1",
      mover,
      transitionReason: "handoff_rejected",
      note: "not_qualified",
      clearDisqualifiedReason: false,
      extra: { handoff_status: "rejected" },
    });

    expect(res).toEqual({ ok: true });
    expect(writes("deals", "update")[0].payloads[0]).toEqual({
      handoff_status: "rejected",
      archived_at: "2026-09-27T05:00:00.000Z",
      archived_by: "closer@example.com",
    });
    expect(writes("lead", "upsert")[0].payloads[0]).toMatchObject({ status: "connected" });
  });

  it("moves the lead first, so a failed lead leaves the deal as it was and can be retried", async () => {
    getLead.mockResolvedValue({ ok: true, lead: null });
    script("lead", { error: { message: "lead locked" } });
    const res = await setDealAside({ dealId: "d1", personId: "p1", mover, transitionReason: "handoff_rejected", note: null, clearDisqualifiedReason: false, extra: { handoff_status: "rejected" } });
    expect(res).toEqual({ ok: false, error: "lead locked" });
    // The deal is untouched: a pending handoff is still pending.
    expect(calls.some((c) => c.table === "deals")).toBe(false);
  });
});
