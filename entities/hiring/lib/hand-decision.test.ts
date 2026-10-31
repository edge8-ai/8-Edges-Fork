import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calls, builderFor, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// Deciding an application by hand (A.36). Every surface that decides one, the
// admin status select and stage field, the admin board and the hiring
// manager's Reject and Advance in Team, goes through this one module, so the
// sequence a decision owes is tested here once: refuse in a live chain, write,
// log the stage move, audit, end the chain run, cancel the interviews.

vi.mock("@/kernel/data/supabase", () => ({
  companyOs: { from: (table: string) => builderFor(table) },
  supabase: { from: (table: string) => builderFor(table) },
  htt: { from: (table: string) => builderFor(table) },
}));
const audited = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[] }));
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: vi.fn(async (row: Record<string, unknown>) => { audited.rows.push(row); }) }));
// The chain's own rule is tested beside the chain; here a case says whether
// the application sits in a live one. The refusal text is the real constant.
const chainRefusal = vi.hoisted(() => ({ value: null as string | null }));
vi.mock("./chain/direct-decision", async (importActual) => ({
  ...(await importActual<typeof import("./chain/direct-decision")>()),
  directDecisionRefusal: vi.fn(async () => chainRefusal.value),
}));
const closed = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock("./chain/close", () => ({ closeChainForDecided: vi.fn(async (...args: unknown[]) => { closed.calls.push(args); }) }));
const cancelled = vi.hoisted(() => ({ ids: [] as string[], answer: { ok: true } as { ok: true } | { ok: false; error: string } }));
vi.mock("./interviews-writes", () => ({
  cancelScheduledInterviews: vi.fn(async (id: string) => { cancelled.ids.push(id); return cancelled.answer; }),
}));

import { PROPOSE_INSTEAD } from "./chain/direct-decision";
import { changeApplicationByHand } from "./hand-decision";

const BY = { personId: "person-9", email: "manager@example.com" };
const written = (table: string) => calls.filter((c) => c.table === table && c.ops[0] !== "select").map((c) => [c.ops[0], c.payloads[0]]);

beforeEach(() => {
  resetFake();
  audited.rows.length = 0;
  closed.calls.length = 0;
  cancelled.ids.length = 0;
  cancelled.answer = { ok: true };
  chainRefusal.value = null;
});
afterEach(() => vi.clearAllMocks());

describe("changeApplicationByHand", () => {
  it("records a rejection onto the reject stage, logs the move, audits it, ends the chain run and cancels the interviews", async () => {
    // The stage it stood on, the reject stage, the write, the stage log.
    script("applications", { data: { current_stage_id: "st-interview" } }, { data: null });
    script("application_stages", { data: { is_terminal: true } });
    script("application_stage_log", { data: null });

    const res = await changeApplicationByHand("app-1", { status: "rejected", stageId: "st-rejected" }, BY);

    expect(res).toMatchObject({ ok: true });
    expect(written("applications")).toEqual([["update", expect.objectContaining({ status: "rejected", current_stage_id: "st-rejected", decided_at: expect.any(String) })]]);
    expect(written("application_stage_log")).toEqual([["insert", expect.objectContaining({ from_stage_id: "st-interview", to_stage_id: "st-rejected" })]]);
    expect(audited.rows).toEqual([expect.objectContaining({ table: "applications", recordId: "app-1", actor: "manager@example.com" })]);
    expect(closed.calls.map((c) => c.slice(0, 2))).toEqual([["app-1", "rejected"]]);
    expect(cancelled.ids).toEqual(["app-1"]);
  });

  it("refuses a rejection in a live hiring chain before reading or writing anything, and marks the refusal as the chain's", async () => {
    chainRefusal.value = PROPOSE_INSTEAD;

    await expect(changeApplicationByHand("app-1", { status: "rejected", stageId: "st-rejected" }, BY)).resolves.toEqual({
      ok: false,
      error: PROPOSE_INSTEAD,
      inLiveChain: true,
    });

    expect(calls).toEqual([]);
    expect(audited.rows).toEqual([]);
    expect(closed.calls).toEqual([]);
    expect(cancelled.ids).toEqual([]);
  });

  it("refuses a move onto a terminal stage in a live hiring chain, having written nothing", async () => {
    chainRefusal.value = PROPOSE_INSTEAD;
    script("applications", { data: { current_stage_id: "st-interview" } });
    script("application_stages", { data: { is_terminal: true } });

    await expect(changeApplicationByHand("app-1", { stageId: "st-hired" }, BY)).resolves.toMatchObject({ ok: false, inLiveChain: true });

    expect(written("applications")).toEqual([]);
    expect(cancelled.ids).toEqual([]);
  });

  it("does not mark a failed chain read as the chain's refusal", async () => {
    // A failed read refuses (the decision must not skip its approval), but it
    // is not a reason to tell a manager that recruiting proposes it.
    chainRefusal.value = "Could not check the application's hiring chain: timeout";

    await expect(changeApplicationByHand("app-1", { status: "rejected" }, BY)).resolves.toEqual({
      ok: false,
      error: "Could not check the application's hiring chain: timeout",
      inLiveChain: false,
    });
  });

  it("stamps a terminal stage's decision without setting the status", async () => {
    script("applications", { data: { current_stage_id: "st-interview" } }, { data: null });
    script("application_stages", { data: { is_terminal: true } });
    script("application_stage_log", { data: null });

    await expect(changeApplicationByHand("app-1", { stageId: "st-hired" }, BY)).resolves.toMatchObject({ ok: true, decidedAt: expect.any(String) });

    const [[, row]] = written("applications") as [string, Record<string, unknown>][];
    expect(row).not.toHaveProperty("status");
    expect(closed.calls.map((c) => c.slice(0, 2))).toEqual([["app-1", "a final stage"]]);
    expect(cancelled.ids).toEqual(["app-1"]);
  });

  it("clears the decision on a move onto a stage that is not terminal, and cancels nothing", async () => {
    script("applications", { data: { current_stage_id: "st-rejected" } }, { data: null });
    script("application_stages", { data: { is_terminal: false } });
    script("application_stage_log", { data: null });

    await expect(changeApplicationByHand("app-1", { stageId: "st-interview" }, BY)).resolves.toEqual({ ok: true, decidedAt: null });

    expect(written("applications")).toEqual([["update", { current_stage_id: "st-interview", decided_at: null }]]);
    expect(closed.calls).toEqual([]);
    expect(cancelled.ids).toEqual([]);
  });

  it("keeps the decision when the interviews cannot be cancelled, and says so", async () => {
    cancelled.answer = { ok: false, error: "calendar unavailable" };
    script("applications", { data: null });

    await expect(changeApplicationByHand("app-1", { status: "rejected" }, BY)).resolves.toEqual({
      ok: false,
      error: "Saved, but the scheduled interviews could not be cancelled: calendar unavailable",
    });

    expect(written("applications")).toEqual([["update", expect.objectContaining({ status: "rejected" })]]);
  });
});
