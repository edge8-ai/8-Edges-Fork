import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// Building a payment run (design §1.7). What these assert is what the run's
// page, the claims' history and accounting@ would observe: which claims
// entered which run, the payments and their amounts, the run's totals, and
// whether the notice went — run on a seeded day, then again.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: async () => undefined }));
const told: unknown[] = [];
vi.mock("./notices", () => ({
  tellOfRunBuilt: async (i: unknown) => void told.push(i),
  tellOwnerOfDecision: async () => undefined,
  tellApproversOfCheck: async () => undefined,
}));

import { buildPaymentRun } from "./payment-runs";

const RUN_DATE = "2026-10-15";
const approved = (id: string, person: string, total: number) => ({
  id,
  status: "approved",
  person_id: person,
  title: `Claim ${id}`,
  submitted_at: "2026-10-05T02:00:00Z",
  approved_total_vnd: total,
});
const inRun = (id: string, person: string, total: number, status = "in_run") => ({ id, person_id: person, status, approved_total_vnd: total });

const writesTo = (table: string, op: string) => calls.filter((c) => c.table === table && c.ops[0] === op);

beforeEach(() => {
  resetFake();
  told.length = 0;
  // The run day itself, 08:00 in Vietnam: when the cron fires.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-15T01:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("buildPaymentRun", () => {
  it("builds no run and sends no notice when nothing was approved before the cut-off", async () => {
    script("reimbursement_claims", { data: [] });
    script("reimbursement_payment_runs", { data: null });
    expect(await buildPaymentRun(RUN_DATE)).toEqual({ ok: true, built: false, reason: "Nothing was approved before the cut-off, so there is no run." });
    expect(writesTo("reimbursement_payment_runs", "upsert")).toHaveLength(0);
    expect(told).toEqual([]);
  });

  it("asks for claims approved before 00:00 Vietnam time on the run date and not yet in a run", async () => {
    script("reimbursement_claims", { data: [] });
    script("reimbursement_payment_runs", { data: null });
    await buildPaymentRun(RUN_DATE);
    expect(calls[0].filters).toEqual([
      ["eq", "status", "approved"],
      ["lt", "approved_at", "2026-10-14T17:00:00.000Z"],
      ["is", "payment_run_id", null],
    ]);
  });

  it("puts every eligible claim in one run, one payment per person, and tells accounting@ once", async () => {
    script("reimbursement_claims", { data: [approved("c1", "p1", 1_000_000), approved("c2", "p2", 250_000), approved("c3", "p1", 500_000)] });
    script("reimbursement_payment_runs", { data: null }, { data: { id: "run-1", status: "open", notified_at: null } });
    script("reimbursement_payments", { data: [] });
    // Each claim's guarded move to in_run, and its history row.
    for (const id of ["c1", "c2", "c3"]) {
      script("reimbursement_claims", { data: [{ id }] });
      script("reimbursement_claim_events", { data: { id: `event-${id}` } });
    }
    script("reimbursement_claims", { data: [inRun("c1", "p1", 1_000_000), inRun("c2", "p2", 250_000), inRun("c3", "p1", 500_000)] });
    script("reimbursement_payments", { data: { id: "pay-1" } });
    script("reimbursement_claims", { data: [{ id: "c1" }, { id: "c3" }] });
    script("reimbursement_payments", { data: { id: "pay-2" } });
    script("reimbursement_claims", { data: [{ id: "c2" }] });
    script("reimbursement_payment_runs", { data: null }, { data: [{ id: "run-1" }] });

    const answer = await buildPaymentRun(RUN_DATE);
    expect(answer).toMatchObject({ ok: true, built: true, runId: "run-1", entered: 3, claims: 3, people: 2, totalVnd: 1_750_000, notified: true, waiting: [], failed: [] });

    expect(writesTo("reimbursement_payment_runs", "upsert")[0].payloads[0]).toEqual({ run_date: RUN_DATE, cutoff_at: "2026-10-14T17:00:00.000Z" });
    const moves = writesTo("reimbursement_claims", "update").filter((c) => (c.payloads[0] as { status?: string }).status === "in_run");
    expect(moves.map((m) => (m.payloads[0] as { payment_run_id: string }).payment_run_id)).toEqual(["run-1", "run-1", "run-1"]);
    expect(moves.every((m) => m.filters.some((f) => f[0] === "eq" && f[1] === "status" && f[2] === "approved"))).toBe(true);
    expect(writesTo("reimbursement_payments", "insert").map((c) => c.payloads[0])).toEqual([
      { run_id: "run-1", person_id: "p1", amount_vnd: 1_500_000 },
      { run_id: "run-1", person_id: "p2", amount_vnd: 250_000 },
    ]);
    const runUpdates = writesTo("reimbursement_payment_runs", "update").map((c) => c.payloads[0]);
    expect(runUpdates[0]).toEqual({ claims_count: 3, people_count: 2, total_vnd: 1_750_000 });
    expect(told).toEqual([{ runId: "run-1", runDate: RUN_DATE, people: 2, claims: 3, totalVnd: 1_750_000 }]);
  });

  it("built again the same day, moves nothing twice and sends no second notice", async () => {
    script("reimbursement_claims", { data: [] });
    script("reimbursement_payment_runs", { data: { id: "run-1", status: "open", notified_at: "2026-10-15T01:00:05Z" } });
    script("reimbursement_payments", { data: [{ id: "pay-1", person_id: "p1", status: "to_pay" }, { id: "pay-2", person_id: "p2", status: "to_pay" }] });
    script("reimbursement_claims", { data: [inRun("c1", "p1", 1_000_000), inRun("c2", "p2", 250_000), inRun("c3", "p1", 500_000)] });
    script("reimbursement_payments", { data: null });
    script("reimbursement_claims", { data: [{ id: "c1" }, { id: "c3" }] });
    script("reimbursement_payments", { data: null });
    script("reimbursement_claims", { data: [{ id: "c2" }] });
    script("reimbursement_payment_runs", { data: null });

    const answer = await buildPaymentRun(RUN_DATE);
    expect(answer).toMatchObject({ ok: true, built: true, runId: "run-1", entered: 0, claims: 3, people: 2, notified: false });
    expect(writesTo("reimbursement_payment_runs", "upsert")).toHaveLength(0);
    expect(writesTo("reimbursement_payments", "insert")).toHaveLength(0);
    // The existing payments are brought to their claims' sum only while still to pay.
    const updates = writesTo("reimbursement_payments", "update");
    expect(updates.map((c) => c.payloads[0])).toEqual([{ amount_vnd: 1_500_000 }, { amount_vnd: 250_000 }]);
    expect(updates.every((c) => c.filters.some((f) => f[0] === "eq" && f[1] === "status" && f[2] === "to_pay"))).toBe(true);
    expect(told).toEqual([]);
  });

  it("leaves a late claim of someone already paid in this run for the next run", async () => {
    script("reimbursement_claims", { data: [approved("c4", "p1", 300_000)] });
    script("reimbursement_payment_runs", { data: { id: "run-1", status: "open", notified_at: "2026-10-15T01:00:05Z" } });
    script("reimbursement_payments", { data: [{ id: "pay-1", person_id: "p1", status: "paid" }] });
    script("reimbursement_claim_events", { data: [] });
    script("reimbursement_claims", { data: [inRun("c1", "p1", 1_000_000, "paid")] });
    script("reimbursement_payment_runs", { data: null });

    const answer = await buildPaymentRun(RUN_DATE);
    expect(answer).toMatchObject({ ok: true, built: true, entered: 0, waiting: ["c4"] });
    expect(writesTo("reimbursement_claims", "update")).toHaveLength(0);
    expect(writesTo("reimbursement_payments", "update")).toHaveLength(0);
  });

  it("never takes back a claim whose failed transfer returned it from this run: it waits for the next run, as its owner was told", async () => {
    // c5 was in this run, its transfer bounced and it was returned to
    // approved; it is still approved before this run's cut-off. c6 is new.
    script("reimbursement_claims", { data: [approved("c5", "p1", 400_000), approved("c6", "p2", 100_000)] });
    script("reimbursement_payment_runs", { data: { id: "run-1", status: "open", notified_at: "2026-10-15T01:00:05Z" } });
    script("reimbursement_payments", { data: [{ id: "pay-1", person_id: "p1", status: "to_pay" }] });
    script("reimbursement_claim_events", { data: [{ claim_id: "c5", metadata: { paymentId: "pay-1", runId: "run-1" } }] });
    script("reimbursement_claims", { data: [{ id: "c6" }] });
    script("reimbursement_claim_events", { data: { id: "event-c6" } });
    script("reimbursement_claims", { data: [inRun("c6", "p2", 100_000)] });
    script("reimbursement_payments", { data: { id: "pay-2" } });
    script("reimbursement_claims", { data: [{ id: "c6" }] });
    script("reimbursement_payment_runs", { data: null });

    const answer = await buildPaymentRun(RUN_DATE);
    expect(answer).toMatchObject({ ok: true, built: true, entered: 1, waiting: ["c5"], failed: [] });
    const moved = writesTo("reimbursement_claims", "update").filter((c) => (c.payloads[0] as { status?: string }).status === "in_run");
    expect(moved.map((m) => m.filters.find((f) => f[1] === "id")?.[2])).toEqual(["c6"]);
    // The returned payment is not brought back to life.
    expect(writesTo("reimbursement_payments", "update")).toHaveLength(0);
    const history = calls.find((c) => c.table === "reimbursement_claim_events" && c.ops[0] === "select");
    expect(history?.filters).toEqual(expect.arrayContaining([["in", "claim_id", ["c5", "c6"]], ["eq", "from_status", "in_run"], ["eq", "to_status", "approved"]]));
  });

  it("refuses a date that is not a 1st or a 15th, or has not come yet", async () => {
    expect(await buildPaymentRun("2026-10-14")).toEqual({ ok: false, error: "A run is built on the 1st or the 15th." });
    expect(await buildPaymentRun("2026-11-01")).toEqual({ ok: false, error: "That run date has not come yet." });
    expect(calls).toHaveLength(0);
  });
});
