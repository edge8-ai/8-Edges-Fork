import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script, timeline } from "@/kernel/data/testing/fake-company-os";

// Characterisation tests for the four deal actions that carried duplicated
// blocks: the USD conversion (moveDealStage / updateDeal) and the "put the lead
// back at connected" step (demoteDealToLead / decideHandoff). They pin the
// exact update payloads, the upsert rows, the transition records and the error
// strings, so extracting the shared helpers cannot change behaviour.
//
// The fake Supabase client is the house one, kernel/data/testing/fake-company-os.ts.

vi.mock("@/kernel/data/supabase", () => ({
  companyOs: { from: (table: string) => builderFor(table), rpc: vi.fn(async () => ({ error: null })) },
  supabase: { from: (table: string) => builderFor(table) },
  htt: { from: (table: string) => builderFor(table) },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// The action asks for its declared permission (ADR 0013); recorded so the test pins which one.
const asked: string[] = [];
vi.mock("@/kernel/identity/access-request", () => ({
  requirePermission: async (p: string) => {
    asked.push(p);
    return { user: { email: "admin@example.com" } };
  },
}));
vi.mock("@/kernel/audit/audit", () => ({
  recordAudit: vi.fn(async () => {}),
  recordAuditMany: vi.fn(async () => {}),
}));
vi.mock("@/kernel/identity/writes", () => ({ insertPeople: vi.fn() }));
vi.mock("@/kernel/identity/person-by-email", () => ({ personIdForEmailOrNull: async () => "admin-person" }));
vi.mock("@/kernel/messaging/writes", () => ({ insertInteractions: vi.fn() }));
vi.mock("@/entities/crm/lib/mutations", () => ({
  archiveRecord: vi.fn(),
  guardedDelete: vi.fn(),
  restoreRecord: vi.fn(),
}));

const getLead = vi.fn(async () => ({ ok: true, lead: { status: "engaged" } }) as { ok: true; lead: { status: string } | null } | { ok: false; error: string });
const recordTransition = vi.fn(async () => {});
const bumpCompanyLifecycle = vi.fn(async () => {});
const bumpPersonCompanies = vi.fn(async () => {});
const announceDealWon = vi.fn(async () => {});
vi.mock("@/entities/crm/lib/lifecycle", async () => ({
  getLead: (...a: unknown[]) => getLead(...(a as [])),
  recordTransition: (...a: unknown[]) => recordTransition(...(a as [])),
  bumpCompanyLifecycle: (...a: unknown[]) => bumpCompanyLifecycle(...(a as [])),
  bumpPersonCompanies: (...a: unknown[]) => bumpPersonCompanies(...(a as [])),
  announceDealWon: (...a: unknown[]) => announceDealWon(...(a as [])),
  // Not a spy: whether a move wins the deal is the rule under test here, so the
  // gate has to be the real one. A copy in this mock would keep passing after
  // the real predicate changed, which is the whole failure this test exists for.
  becomesWon: (await vi.importActual<typeof import("@/entities/crm/lib/lifecycle")>(
    "@/entities/crm/lib/lifecycle",
  )).becomesWon,
}));

const usdRate = vi.fn(async () => ({ rate: 1.5, asOf: "2026-09-06" }));
// The stage gate and the stage log are lib/deal-stage's and have their own
// tests; here they are inert so the scripted chains below stay as they were.
// Where the deal is before the move, and the stages it could have come from.
// Mutable because moveDealStage now compares the two: a deal already sitting in
// a won stage has not just been won.
let stageContext: { stageId: string | null; stages: { id: string; is_won: boolean; is_lost?: boolean; name?: string; position?: number }[] };
const loadStageContext = vi.fn(async () => ({
  ok: true,
  deal: { stageId: stageContext.stageId, amount_cents: 1000, expected_close_date: "2026-10-01" },
  stages: stageContext.stages,
}) as { ok: true; deal: { stageId: string | null; amount_cents: number; expected_close_date: string }; stages: typeof stageContext.stages } | { ok: false; error: string });
vi.mock("@/entities/crm/lib/deal-stage", async () => {
  const actual = await vi.importActual<typeof import("@/entities/crm/lib/deal-stage")>("@/entities/crm/lib/deal-stage");
  return {
    loadStageContext: (...a: unknown[]) => loadStageContext(...(a as [])),
    forecastInputsError: () => null,
    // Real, not inert: whether an edit may clear a forecast input is the rule
    // updateDeal is tested for (R.23), and a stub would pass with the call deleted.
    forecastEditError: actual.forecastEditError,
    clearedForecastInputs: actual.clearedForecastInputs,
    recordDealStageMove: vi.fn(async () => ({ ok: true })),
    // The real rule: the stage's default probability applies on entry to an open stage.
    stageEntryPatch: (stage: { is_won: boolean; is_lost: boolean; default_probability?: number | null }) => (stage.is_won || stage.is_lost || stage.default_probability == null ? {} : { probability: stage.default_probability }),
  };
});
vi.mock("@/kernel/data/fx", () => ({
  usdRate: (...a: unknown[]) => usdRate(...(a as [])),
}));

import { decideHandoff, demoteDealToLead, moveDealStage, updateDeal } from "./actions";

const only = (table: string) => calls.filter((c) => c.table === table);
/** The row handed to `op` on the nth query against that table. */
const payloadFor = (table: string, op: string, n = 0) => {
  const record = only(table)[n];
  expect(record.ops).toContain(op);
  return record.payloads[0];
};

beforeEach(() => {
  resetFake();
  asked.length = 0;
  stageContext = { stageId: "s-open", stages: [{ id: "s-open", is_won: false }, { id: "s-won", is_won: true }] };
  getLead.mockClear();
  getLead.mockResolvedValue({ ok: true, lead: { status: "engaged" } });
  recordTransition.mockClear();
  bumpCompanyLifecycle.mockClear();
  bumpPersonCompanies.mockClear();
  usdRate.mockClear();
  usdRate.mockResolvedValue({ rate: 1.5, asOf: "2026-09-06" });
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-06T12:00:00.000Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("deal actions · access", () => {
  it("asks for crm.pipeline before moving a deal", async () => {
    script("pipeline_stages", { data: { name: "Lost", is_won: false, is_lost: true } });
    await moveDealStage("d1", "s-lost");
    expect(asked[0]).toBe("crm.pipeline");
  });
});

describe("moveDealStage", () => {
  const openStage = { name: "Discovery", is_won: false, is_lost: false };

  it("refuses a lost move with no reason and a won move with no amount", async () => {
    script("pipeline_stages", { data: { name: "Lost", is_won: false, is_lost: true } });
    expect(await moveDealStage("d1", "s-lost")).toEqual({ ok: false, error: "Losing a deal needs a reason." });

    resetFake();
    script("pipeline_stages", { data: { name: "Won", is_won: true, is_lost: false } });
    expect(await moveDealStage("d1", "s-won")).toEqual({
      ok: false,
      error: "Marking a deal won needs the final deal amount.",
    });
  });

  it("takes the stage's default probability on entry", async () => {
    script("pipeline_stages", { data: { name: "Contract Sent", is_won: false, is_lost: false, default_probability: 90 } });
    script("deals", { data: { person_id: null, company_id: null } });

    expect(await moveDealStage("d1", "s-cs")).toEqual({ ok: true });
    // No status or close stamp: the database derives both from the stage, and
    // writes the stage log from the mover (ADR-0011).
    expect(payloadFor("deals", "update")).toEqual({
      stage_id: "s-cs",
      stage_moved_by: "admin@example.com",
      stage_move_note: null,
      probability: 90,
    });
  });

  it("refreshes the cached rate for the deal's currency, then writes the won amount without a USD figure", async () => {
    script("pipeline_stages", { data: { name: "Won", is_won: true, is_lost: false } });
    script("deals", { data: { currency: "eur" } }, { data: { person_id: null, company_id: "c1" } });
    script("fx_rates", {});

    expect(await moveDealStage("d1", "s-won", undefined, 100)).toEqual({ ok: true });

    expect(usdRate).toHaveBeenCalledWith("eur");
    expect(payloadFor("fx_rates", "upsert")).toEqual({ currency: "eur", rate_to_usd: 1.5, updated_at: "2026-09-06T12:00:00.000Z" });
    // The database derives the USD value from that cache as the row lands
    // (deals_derive_usd, R.24), so the rate has to be cached first.
    expect(timeline().filter((e) => e !== "pipeline_stages:select")).toEqual(["deals:select", "fx_rates:upsert", "deals:update"]);
    expect(payloadFor("deals", "update", 1)).toEqual({
      stage_id: "s-won",
      stage_moved_by: "admin@example.com",
      stage_move_note: null,
      amount_cents: 10000,
    });
    expect(bumpCompanyLifecycle).toHaveBeenCalledWith("c1", "customer", { reason: "deal_won" });
  });

  it("announces the win from the row that came back, not from the patch it sent", async () => {
    // The person has a live lead, which a win retires.
    script("lead", {});
    // The USD figure is the database's (R.24), so `updates` is not evidence of
    // what landed; the subscriber has to be told what the database holds (S.2).
    script("pipeline_stages", { data: { name: "Won", is_won: true, is_lost: false } });
    script(
      "deals",
      { data: { currency: "usd" } },
      {
        data: {
          person_id: "p1",
          company_id: "c1",
          amount_usd_cents: 12345,
          closed_at: "2026-09-06T12:00:00.000Z",
          owner_id: "owner-1",
          title: "Northwind pilot",
        },
      },
    );

    expect(await moveDealStage("d1", "s-won", undefined, 100)).toEqual({ ok: true });
    // The owner and title come back too: the inbox (S.3) tells the owner.
    expect(announceDealWon).toHaveBeenCalledWith({
      id: "d1",
      company_id: "c1",
      person_id: "p1",
      amount_usd_cents: 12345,
      closed_at: "2026-09-06T12:00:00.000Z",
      owner_id: "owner-1",
      title: "Northwind pilot",
    }, "admin-person");
  });

  it("still announces the win and raises the account when the lead sync fails (S.19.2)", async () => {
    // The row already says won, and a retry would be won-to-won, which states
    // nothing: returning before the announcement lost deal.won for good.
    getLead.mockResolvedValueOnce({ ok: false, error: "lead read failed" });
    script("pipeline_stages", { data: { name: "Won", is_won: true, is_lost: false } });
    script(
      "deals",
      { data: { currency: "usd" } },
      { data: { person_id: "p1", company_id: "c1", amount_usd_cents: 12345, closed_at: "2026-09-06T12:00:00.000Z", owner_id: "owner-1", title: "Northwind pilot" } },
    );

    expect(await moveDealStage("d1", "s-won", undefined, 100)).toEqual({
      ok: false,
      error: "Deal stage saved, but the lead sync failed: lead read failed",
    });
    expect(bumpCompanyLifecycle).toHaveBeenCalledWith("c1", "customer", { reason: "deal_won" });
    expect(announceDealWon).toHaveBeenCalledTimes(1);
  });

  it("says nothing on a move that did not win the deal", async () => {
    // A valid reason, so the move really lands: "no_budget" was refused before
    // anything ran, and the assertion passed without exercising the lost path.
    script("pipeline_stages", { data: { name: "Lost", is_won: false, is_lost: true } });
    script("deals", { data: { person_id: null, company_id: null } });
    expect(await moveDealStage("d1", "s-lost", "price")).toEqual({ ok: true });
    expect(payloadFor("deals", "update")).toMatchObject({ stage_id: "s-lost", lost_reason: "price" });
    expect(announceDealWon).not.toHaveBeenCalled();
  });

  it("says nothing when the deal was already won", async () => {
    // The person has a live lead, which a win retires.
    script("lead", {});
    // Re-saving the stage a won deal is already in. The row is written again,
    // and the win happened once — the bus states transitions, not states, so
    // nothing is announced (hiring says the same of a re-saved hire).
    stageContext.stageId = "s-won";
    script("pipeline_stages", { data: { name: "Won", is_won: true, is_lost: false } });
    script("deals", { data: { currency: "usd" } }, { data: { person_id: "p1", company_id: "c1" } });

    expect(await moveDealStage("d1", "s-won", undefined, 100)).toEqual({ ok: true });

    expect(payloadFor("deals", "update", 1)).toMatchObject({ stage_id: "s-won" });
    expect(announceDealWon).not.toHaveBeenCalled();
  });

  it("says nothing moving a won deal between two won stages", async () => {
    // The person has a live lead, which a win retires.
    script("lead", {});
    stageContext.stageId = "s-won";
    stageContext.stages.push({ id: "s-won-2", is_won: true });
    script("pipeline_stages", { data: { name: "Won — renewal", is_won: true, is_lost: false } });
    script("deals", { data: { currency: "usd" } }, { data: { person_id: "p1", company_id: "c1" } });

    expect(await moveDealStage("d1", "s-won-2", undefined, 100)).toEqual({ ok: true });
    expect(announceDealWon).not.toHaveBeenCalled();
  });

  it("announces the win when the stage it came from is no longer on the board", async () => {
    // The person has a live lead, which a win retires.
    script("lead", {});
    // A deleted stage leaves a deal pointing at an id the list cannot resolve.
    // Unresolvable counts as not-won: a duplicate reaches idempotent
    // subscribers, while a swallowed win is a delivery board that never opens.
    stageContext.stageId = "s-deleted";
    script("pipeline_stages", { data: { name: "Won", is_won: true, is_lost: false } });
    script("deals", { data: { currency: "usd" } }, { data: { person_id: "p1", company_id: "c1", closed_at: "2026-09-06T12:00:00.000Z" } });

    expect(await moveDealStage("d1", "s-won", undefined, 100)).toEqual({ ok: true });
    expect(announceDealWon).toHaveBeenCalled();
  });

  it("saves the deal anyway when the FX lookup throws, and caches nothing", async () => {
    script("pipeline_stages", { data: { name: "Won", is_won: true, is_lost: false } });
    script("deals", { data: { currency: "aud" } }, { data: { person_id: null, company_id: null } });
    usdRate.mockRejectedValue(new Error("fx down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await moveDealStage("d1", "s-won", undefined, 100)).toEqual({ ok: true });
    expect(usdRate).toHaveBeenCalledWith("aud");
    expect(only("fx_rates")).toHaveLength(0);
    expect(payloadFor("deals", "update", 1)).toEqual({
      stage_id: "s-won",
      stage_moved_by: "admin@example.com",
      stage_move_note: null,
      amount_cents: 10000,
    });
    spy.mockRestore();
  });

  it("never asks for a rate for a USD deal, or one with no currency", async () => {
    script("pipeline_stages", { data: { name: "Won", is_won: true, is_lost: false } });
    script("deals", { data: { currency: null } }, { data: { person_id: null, company_id: null } });

    expect(await moveDealStage("d1", "s-won", undefined, 100)).toEqual({ ok: true });
    expect(usdRate).not.toHaveBeenCalled();
    expect(only("fx_rates")).toHaveLength(0);
  });

  it("returns the currency read error rather than closing the deal", async () => {
    script("pipeline_stages", { data: { name: "Won", is_won: true, is_lost: false } });
    script("deals", { error: { message: "no row" } });
    expect(await moveDealStage("d1", "s-won", undefined, 100)).toEqual({ ok: false, error: "no row" });
  });

  it("leaves an open move untouched by FX", async () => {
    script("pipeline_stages", { data: openStage });
    script("deals", { data: { person_id: null, company_id: null } });
    await moveDealStage("d1", "s-open");
    expect(usdRate).not.toHaveBeenCalled();
  });
});

describe("updateDeal", () => {
  it("caches today's rate for the stored currency before writing a new amount", async () => {
    script("deals", { data: { currency: "gbp" } }, {});
    script("fx_rates", {});

    expect(await updateDeal("d1", { amount: 250 })).toEqual({ ok: true });

    expect(usdRate).toHaveBeenCalledWith("gbp");
    expect(payloadFor("fx_rates", "upsert")).toEqual({
      currency: "gbp",
      rate_to_usd: 1.5,
      updated_at: "2026-09-06T12:00:00.000Z",
    });
    expect(timeline().filter((e) => e !== "pipeline_stages:select")).toEqual(["deals:select", "fx_rates:upsert", "deals:update"]);
    // No USD columns: the database derives them from the rate just cached.
    expect(payloadFor("deals", "update", 1)).toEqual({ amount_cents: 25000 });
  });

  it("does not re-read the deal when the currency is in the patch", async () => {
    script("deals", {});
    script("fx_rates", {});

    await updateDeal("d1", { amount: 10, currency: " EUR " });

    expect(usdRate).toHaveBeenCalledWith("eur");
    expect(only("deals")).toHaveLength(1);
    expect(payloadFor("deals", "update", 0)).toEqual({ amount_cents: 1000, currency: "eur" });
  });

  it("saves the amount when caching the rate fails", async () => {
    script("deals", {});
    script("fx_rates", { error: { message: "cache down" } });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await updateDeal("d1", { amount: 10, currency: "aud" })).toEqual({ ok: true });
    expect(payloadFor("deals", "update", 0)).toEqual({ amount_cents: 1000, currency: "aud" });
    expect(spy).toHaveBeenCalledWith("[crm] caching the aud rate failed:", "cache down");
    spy.mockRestore();
  });

  it("asks for no rate when the deal is in USD", async () => {
    script("deals", {});

    expect(await updateDeal("d1", { amount: 10, currency: "usd" })).toEqual({ ok: true });
    expect(usdRate).not.toHaveBeenCalled();
    expect(only("fx_rates")).toHaveLength(0);
  });

  it("returns the existing-deal read error", async () => {
    script("deals", { error: { message: "gone" } });
    expect(await updateDeal("d1", { amount: 10 })).toEqual({ ok: false, error: "gone" });
  });

  it("validates before touching FX", async () => {
    expect(await updateDeal("d1", { title: "  " })).toEqual({ ok: false, error: "Title can't be empty." });
    expect(await updateDeal("d1", { amount: -1 })).toEqual({ ok: false, error: "Amount must be zero or more." });
    expect(await updateDeal("d1", { currency: " " })).toEqual({ ok: false, error: "Currency is required." });
    expect(await updateDeal("d1", { probability: 101 })).toEqual({
      ok: false,
      error: "Probability must be between 0 and 100.",
    });
    expect(usdRate).not.toHaveBeenCalled();
  });

  it("stores a document link through externalHref, adding https to a bare host", async () => {
    script("deals", {});
    expect(
      await updateDeal("d1", { proposal_url: "  docs.google.com/x  ", contract_url: "example.com:8080/contract" }),
    ).toEqual({ ok: true });
    expect(payloadFor("deals", "update")).toEqual({
      proposal_url: "https://docs.google.com/x",
      contract_url: "https://example.com:8080/contract",
    });
  });

  it("clears a document link on empty, blank or null", async () => {
    script("deals", {});
    expect(await updateDeal("d1", { proposal_url: "   ", contract_url: null })).toEqual({ ok: true });
    expect(payloadFor("deals", "update")).toEqual({ proposal_url: null, contract_url: null });
  });

  it("refuses a document link that is not a web link, and writes nothing", async () => {
    // Before W.117 these were stored with https:// glued on ("https://notes",
    // "https://javascript:alert(1)"); returning null instead would have cleared
    // the saved link without a word.
    for (const bad of ["notes", "javascript:alert(1)", "mailto:a@b.com", "ftp://files.example.com"]) {
      expect(await updateDeal("d1", { proposal_url: bad })).toEqual({
        ok: false,
        error: "Proposal link isn't a web link. Paste the full address (e.g. a Google Doc URL).",
      });
    }
    expect(await updateDeal("d1", { title: "Renewal", contract_url: "localhost:3000" })).toEqual({
      ok: false,
      error: "Contract link isn't a web link. Paste the full address (e.g. a Google Doc URL).",
    });
    expect(only("deals")).toHaveLength(0);
  });

  // R.23: a deal past Proposal keeps its forecast inputs through an edit.
  describe("on a deal already at Proposal or later", () => {
    const pipeline = [
      { id: "s-disc", name: "Discovery", position: 1, is_won: false, is_lost: false },
      { id: "s-prop", name: "Proposal", position: 2, is_won: false, is_lost: false },
      { id: "s-neg", name: "Negotiation", position: 3, is_won: false, is_lost: false },
      { id: "s-won", name: "Won", position: 4, is_won: true, is_lost: false },
    ];

    it("refuses clearing the amount or the close date, and writes nothing", async () => {
      stageContext = { stageId: "s-neg", stages: pipeline };
      expect(await updateDeal("d1", { amount: null })).toEqual({
        ok: false,
        error: "A deal in Negotiation keeps an amount, so the forecast can count it.",
      });
      expect(await updateDeal("d1", { title: "Renewal", expected_close_date: "" })).toEqual({
        ok: false,
        error: "A deal in Negotiation keeps an expected close date, so the forecast can count it.",
      });
      expect(only("deals")).toHaveLength(0);
      expect(usdRate).not.toHaveBeenCalled();
    });

    it("lets the same clearing edit through before Proposal and once the deal is won", async () => {
      for (const stageId of ["s-disc", "s-won"]) {
        resetFake();
        stageContext = { stageId, stages: pipeline };
        script("deals", {});
        expect(await updateDeal("d1", { expected_close_date: null })).toEqual({ ok: true });
        expect(payloadFor("deals", "update")).toEqual({ expected_close_date: null });
      }
    });

    it("reads the stage only when the edit clears an input", async () => {
      stageContext = { stageId: "s-neg", stages: pipeline };
      script("deals", {});
      expect(await updateDeal("d1", { expected_close_date: "2026-12-01", next_step: "Send the SOW" })).toEqual({ ok: true });
      expect(loadStageContext).not.toHaveBeenCalled();
    });

    it("returns the stage read error rather than saving unjudged", async () => {
      loadStageContext.mockResolvedValueOnce({ ok: false, error: "stages unavailable" });
      expect(await updateDeal("d1", { amount: 0 })).toEqual({ ok: false, error: "stages unavailable" });
      expect(only("deals")).toHaveLength(0);
    });
  });
});

describe("demoteDealToLead", () => {
  const deal = { person_id: "p1", status: "open", handoff_status: null, archived_at: null };

  it("archives the deal and reopens the lead at connected, clearing the disqualification", async () => {
    script("deals", { data: deal }, {});
    script("lead", {});

    expect(await demoteDealToLead("d1", "  needs work  ")).toEqual({ ok: true });

    expect(payloadFor("deals", "update", 1)).toEqual({
      archived_at: "2026-09-06T12:00:00.000Z",
      archived_by: "admin@example.com",
    });
    expect(payloadFor("lead", "upsert")).toEqual({
      person_id: "p1",
      status: "connected",
      sla_due_at: null,
      disqualified_reason: null,
      updated_at: "2026-09-06T12:00:00.000Z",
    });
    expect(only("lead")[0].options[0]).toEqual({ onConflict: "person_id" });
    expect(recordTransition).toHaveBeenCalledWith({
      personId: "p1",
      fromStatus: "engaged",
      toStatus: "connected",
      reason: "demoted_from_deal",
      note: "needs work",
    });
  });

  it("returns the lead upsert error", async () => {
    script("deals", { data: deal }, {});
    script("lead", { error: { message: "lead locked" } });

    expect(await demoteDealToLead("d1", "x")).toEqual({ ok: false, error: "lead locked" });
    expect(recordTransition).not.toHaveBeenCalled();
  });

  it("refuses deals that are archived, closed, pending handoff or contactless", async () => {
    script("deals", { data: { ...deal, archived_at: "2026-01-01" } });
    expect(await demoteDealToLead("d1", "x")).toEqual({ ok: false, error: "This deal is already archived." });

    resetFake();
    script("deals", { data: { ...deal, status: "won" } });
    expect(await demoteDealToLead("d1", "x")).toEqual({ ok: false, error: "Only open deals can be demoted." });

    resetFake();
    script("deals", { data: { ...deal, handoff_status: "pending" } });
    expect(await demoteDealToLead("d1", "x")).toEqual({
      ok: false,
      error: "This deal is still a pending handoff — accept or reject it instead.",
    });

    resetFake();
    script("deals", { data: { ...deal, person_id: null } });
    expect(await demoteDealToLead("d1", "x")).toEqual({ ok: false, error: "This deal isn't linked to a contact." });
  });
});

describe("decideHandoff", () => {
  it("rejects with a reason by setting the deal aside, not losing it, and reopens the lead at connected", async () => {
    script("deals", { data: { person_id: "p1", handoff_status: "pending" } }, {});
    script("lead", {});

    expect(await decideHandoff("d1", "rejected", "not_qualified", "  note  ")).toEqual({ ok: true });

    // Archived with the answer recorded; no status, close or lost reason, so it
    // never reaches the win rate (CONTEXT.md, Handoff).
    expect(payloadFor("deals", "update", 1)).toEqual({
      handoff_status: "rejected",
      handoff_decided_at: "2026-09-06T12:00:00.000Z",
      handoff_note: "note",
      handoff_rejected_reason: "not_qualified",
      archived_at: "2026-09-06T12:00:00.000Z",
      archived_by: "admin@example.com",
    });
    // No `disqualified_reason` here: the reject path leaves it alone.
    expect(payloadFor("lead", "upsert")).toEqual({
      person_id: "p1",
      status: "connected",
      sla_due_at: null,
      updated_at: "2026-09-06T12:00:00.000Z",
    });
    expect(recordTransition).toHaveBeenCalledWith({
      personId: "p1",
      fromStatus: "engaged",
      toStatus: "connected",
      reason: "handoff_rejected",
      note: "not_qualified",
    });
  });

  it("says so when the lead cannot be reopened, rather than reporting a clean reject", async () => {
    // The deal is already set aside; a person who did not make it back to the
    // SDR queue is somebody nobody is working, so the closer is told.
    script("deals", { data: { person_id: "p1", handoff_status: "pending" } }, {});
    script("lead", { error: { message: "lead locked" } });

    expect(await decideHandoff("d1", "rejected", "not_qualified")).toEqual({ ok: false, error: "lead locked" });
    expect(recordTransition).not.toHaveBeenCalled();
  });

  it("accepting touches no lead row", async () => {
    script("deals", { data: { person_id: "p1", handoff_status: "pending" } }, {});

    expect(await decideHandoff("d1", "accepted")).toEqual({ ok: true });
    expect(payloadFor("deals", "update", 1)).toEqual({
      handoff_status: "accepted",
      handoff_decided_at: "2026-09-06T12:00:00.000Z",
      handoff_note: null,
    });
    expect(only("lead")).toHaveLength(0);
    expect(recordTransition).not.toHaveBeenCalled();
  });

  it("refuses a reject with no valid reason and a already-decided handoff", async () => {
    expect(await decideHandoff("d1", "rejected")).toEqual({
      ok: false,
      error: "Rejecting a handoff needs a reason.",
    });

    script("deals", { data: { person_id: "p1", handoff_status: "accepted" } });
    expect(await decideHandoff("d1", "accepted")).toEqual({ ok: false, error: "Handoff already decided." });
  });
});
