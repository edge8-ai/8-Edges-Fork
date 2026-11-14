import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// Putting a cancelled advance back. The promises: only a payer who is neither its owner nor its
// approver, only one that was approved, always with a reason, and the owner is told.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: async () => {} }));
const told = vi.hoisted(() => [] as { what: string; about: Record<string, unknown> }[]);
vi.mock("./advance-notices", () => ({
  tellOwnerOfReinstate: async (about: Record<string, unknown>) => void told.push({ what: "owner reinstate", about }),
  tellPayersOfReinstate: async (about: Record<string, unknown>) => void told.push({ what: "payers reinstate", about }),
  tellPayersToTransfer: async (about: Record<string, unknown>) => void told.push({ what: "payers transfer", about }),
  tellOwnerOfDecision: async (about: Record<string, unknown>) => void told.push({ what: "owner decision", about }),
}));
const approvals = vi.hoisted(() => [] as { move: string }[]);
vi.mock("./advance-decisions", () => ({ recordAdvanceApproval: async (i: { move: string }) => void approvals.push(i) }));
vi.mock("./own-bank-details", () => ({ readBankDetailsOnFile: async () => ({ ok: true, onFile: true }) }));
const payers = vi.hoisted(() => ({ ids: ["person-t", "person-d"] as string[] }));
vi.mock("@/kernel/identity/people-holding", () => ({ peopleHolding: async () => payers.ids }));

import type { AdvanceActor, AdvanceRow } from "./advance-lifecycle";
import { reinstateAdvance } from "./advance-reinstate";
import type { AdvanceStatus } from "./advance-rules";

const payer: AdvanceActor = { kind: "payer", personId: "person-t", mayDecideOwn: false, label: "Bookkeeper" };
const row = (status: AdvanceStatus = "cancelled"): AdvanceRow => ({
  id: "advance-1",
  refNo: 7,
  status,
  personId: "person-a",
  purpose: "Venue deposit",
  amountVnd: 8_000_000,
  spendEndsOn: "2026-10-13",
  settleBy: null,
  submittedAt: "2026-10-03T02:00:00Z",
  decidedBy: "person-d",
  balanceVnd: null,
});
const REASON = "Transfer went out at 09:40, before the cancel.";
const go = (over: Partial<Parameters<typeof reinstateAdvance>[0]> = {}) => reinstateAdvance({ row: row(), reason: REASON, actor: payer, ...over });
const writes = () => calls.filter((c) => c.table === "reimbursement_advances" && c.ops[0] === "update");
const eventRows = () => calls.filter((c) => c.table === "reimbursement_advance_events" && c.ops[0] === "insert").map((c) => c.payloads[0] as Record<string, unknown>);
const wasApproved = () => script("reimbursement_advance_events", { data: [{ id: "event-approve" }] }, { data: { id: "event-1" } });

beforeEach(() => {
  resetFake();
  told.length = 0;
  approvals.length = 0;
  payers.ids = ["person-t", "person-d"];
});

describe("reinstateAdvance", () => {
  it("puts it back to approved, keeps the approver's decision, records why and tells the owner", async () => {
    wasApproved();
    script("reimbursement_advances", { data: [{ id: "advance-1" }] });
    expect(await go()).toEqual({ ok: true });
    expect(writes()[0].payloads[0]).toEqual({ status: "approved" });
    expect(eventRows()[0]).toMatchObject({ move: "reinstate", from_status: "cancelled", to_status: "approved", actor_person_id: "person-t", reason: REASON });
    expect(told.map((t) => t.what)).toEqual(["owner reinstate", "payers reinstate"]);
    expect(told[0].about).toMatchObject({ reason: REASON });
    // The other payers were told not to send it, so they hear it is back on, and the one who did this does not.
    expect(told[1].about).toMatchObject({ putBackBy: "person-t" });
    expect(approvals[0].move).toBe("reinstate");
  });

  it("refuses the approver and the owner, before anything is read or written", async () => {
    const asApprover = await go({ actor: { ...payer, personId: "person-d" } });
    expect(asApprover.ok === false && asApprover.error).toContain("You approved this advance");
    const asOwner = await go({ actor: { ...payer, personId: "person-a" } });
    expect(asOwner.ok === false && asOwner.error).toContain("your own advance");
    expect(calls).toEqual([]);
  });

  it("lets the approver do it when the owner is the only other payer, the same as the payout", async () => {
    payers.ids = ["person-d", "person-a"];
    wasApproved();
    script("reimbursement_advances", { data: [{ id: "advance-1" }] });
    expect(await go({ actor: { ...payer, personId: "person-d" } })).toEqual({ ok: true });
  });

  it("refuses anyone but a payer", async () => {
    const result = await go({ actor: { kind: "approver", personId: "person-z", mayDecideOwn: false } });
    expect(result).toEqual({ ok: false, error: "Only Finance can put an advance back." });
    expect(calls).toEqual([]);
  });

  it("refuses an advance nobody approved, because no money can have gone", async () => {
    script("reimbursement_advance_events", { data: [] });
    const result = await go();
    expect(result.ok === false && result.error).toContain("Nobody approved");
    expect(calls.find((c) => c.table === "reimbursement_advance_events")?.filters).toEqual(expect.arrayContaining([["eq", "move", "approve"]]));
    expect(writes()).toEqual([]);
  });

  it("refuses without a reason", async () => {
    wasApproved();
    expect(await go({ reason: "   " })).toEqual({ ok: false, error: "Give a reason." });
    expect(writes()).toEqual([]);
  });

  it.each(["approved", "paid_out", "settled", "draft"] as const)("refuses one that is %s", async (status) => {
    expect((await go({ row: row(status) })).ok).toBe(false);
    expect(writes()).toEqual([]);
  });

  it("works again after the owner cancels a second time, because Finance can still say the money went", async () => {
    wasApproved();
    script("reimbursement_advances", { data: [{ id: "advance-1" }] });
    expect(await go()).toEqual({ ok: true });
  });

  it("says what to do when the owner has opened another advance, not the owner's own words for it", async () => {
    script("reimbursement_advance_events", { data: [{ id: "event-approve" }] });
    script("reimbursement_advances", { data: null, error: { message: "duplicate", code: "23505" } as never });
    const result = await go();
    expect(result.ok === false && result.error).toContain("opened another advance");
    expect(eventRows()).toEqual([]);
    expect(told).toEqual([]);
  });
});
