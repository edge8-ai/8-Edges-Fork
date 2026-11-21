import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// The one test the card asks for, and the point of the module: for a settlement against
// 8,000,000, the run pays 0, 0 and 720,000 for 7,360,000, 8,000,000 and 8,720,000, and the
// ledger balances to zero each time. It runs the real lifecycle of both machines on the fake,
// so what it reads is what each surface would have written.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: async () => {} }));
vi.mock("@/kernel/events", () => ({ publish: async () => {} }));
const decided = vi.hoisted(() => [] as Record<string, unknown>[]);
vi.mock("@/kernel/approvals/requests", () => ({
  openApproval: async () => ({ ok: true }),
  cancelApproval: async () => ({ ok: true }),
  decidePendingApproval: async (r: Record<string, unknown>) => (decided.push(r), { ok: true, decided: true }),
  decideApproval: async () => ({ ok: true }),
}));
const told = vi.hoisted(() => [] as string[]);
vi.mock("./notices", () => ({
  tellApproversOfCheck: async () => void told.push("approvers of check"),
  tellOwnerOfDecision: async () => {},
  tellOfSubmission: async () => {},
  ownerName: async () => "Avery",
}));
vi.mock("./advance-notices", () => ({
  tellApproversOfRequest: async () => {},
  tellOwnerOfClose: async () => void told.push("owner close"),
  tellOwnerOfDecision: async () => {},
  tellOwnerOfPayout: async () => {},
  tellOwnerOfReturnConfirmed: async () => {},
  tellPayersOfCancel: async () => {},
  tellPayersOfMoneyOwed: async () => void told.push("payers owed"),
  tellPayersToTransfer: async () => {},
}));
vi.mock("./own-bank-details", () => ({ readBankDetailsOnFile: async () => ({ ok: true, onFile: true }) }));

import { accountOf } from "./advance-books";
import { closeAdvance, returnUnspent, settlementApprovesOnCheck, settlementClaimOf } from "./advance-settlement";
import type { AdvanceRow } from "./advance-lifecycle";
import { declineClaimItem, transitionClaim, type ClaimPatch } from "./claim-lifecycle";
import { enterItemRateByHand } from "./claim-items";
import { openForOwner } from "./own-claims";

const ADVANCED = 8_000_000;
const advanceRaw = (over: Record<string, unknown> = {}) => ({ id: "advance-1", ref_no: 7, status: "paid_out", person_id: "person-a", purpose: "Venue deposit", amount_vnd: ADVANCED, spend_ends_on: "2026-11-13", settle_by: "2026-11-30", submitted_at: "t", decided_by: "person-d", balance_vnd: null, spent_vnd: null, settled_claim_id: null, ...over });
const claim = { id: "claim-1", status: "checked" as const, personId: "person-a", title: "Settlement", submittedAt: "t", advanceId: "advance-1" };
const approver = { kind: "approver" as const, personId: "person-d", mayDecideOwn: false, label: "approver@test" };
const out = { data: [{ amount_vnd: ADVANCED }] };
const advanceWrites = () => calls.filter((c) => c.table === "reimbursement_advances" && c.ops[0] === "update").map((c) => c.payloads[0] as Record<string, unknown>);

function writer(answer: "lands" | "lost" = "lands") {
  const patches: ClaimPatch[] = [];
  const write = async (patch: ClaimPatch) => {
    patches.push(patch);
    return answer === "lands" ? { data: [{ id: "claim-1" }], error: null } : { data: null, error: { message: "the network went" } };
  };
  return { write, patches };
}

function scriptApproval(spent: number, advance: Record<string, unknown> = advanceRaw()) {
  script("reimbursement_claim_items", { data: [{ id: "item-1", amount_vnd: spent, declined_at: null, removed_at: null }] });
  script("reimbursement_advances", { data: advance }, { data: [{ id: "advance-1" }] });
  script("reimbursement_advance_transfers", out);
  script("reimbursement_advance_events", { data: { id: "event-1" } });
  script("reimbursement_claim_events", { data: { id: "claim-event-1" } });
}

beforeEach(() => {
  resetFake();
  told.length = 0;
  decided.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("the money path, against ₫8,000,000", () => {
  it.each([
    { spent: 7_360_000, claimStatus: "settled", runPays: 0, advance: "to_return", balance: -640_000, returned: 640_000 },
    { spent: 8_000_000, claimStatus: "settled", runPays: 0, advance: "settled", balance: 0, returned: 0 },
    { spent: 8_720_000, claimStatus: "approved", runPays: 720_000, advance: "settled", balance: 720_000, returned: 0 },
  ])("spending $spent: the run pays $runPays, the advance ends $advance, and the ledger balances to zero", async ({ spent, claimStatus, runPays: paid, advance, balance, returned }) => {
    scriptApproval(spent);
    const { write, patches } = writer();
    expect(await transitionClaim({ row: claim, move: "approve", actor: approver, write })).toEqual({ ok: true });

    // The claim froze the difference, never the spend, so the run cannot pay the advance twice.
    expect(patches[0]).toMatchObject({ status: claimStatus, approved_total_vnd: paid, approved_by: "person-d" });
    // What a real run does with that status and figure is in payment-runs.test.ts.

    // The advance froze the spend and the signed balance, and names the claim that closed it.
    expect(advanceWrites()[0]).toMatchObject({ status: advance, spent_vnd: spent, balance_vnd: balance, settled_claim_id: "claim-1" });

    // Account 141 ends on zero once what was owed has come back.
    const account = accountOf({
      amountVnd: ADVANCED,
      spentVnd: spent,
      closedOn: "2026-11-16",
      transfers: [{ direction: "out", amountVnd: ADVANCED, transferredOn: "2026-11-04" }, ...(returned > 0 ? [{ direction: "in" as const, amountVnd: returned, transferredOn: "2026-11-20" }] : [])],
    });
    expect(account.balanceVnd).toBe(0);
  });

  // The paper signs these two differently, and the event is all it has to go on.
  it("records on the close whether the approver decided it or a check under the limit did", async () => {
    scriptApproval(8_000_000);
    expect(await transitionClaim({ row: claim, move: "approve", actor: approver, write: writer().write })).toEqual({ ok: true });
    const decided = calls.find((c) => c.table === "reimbursement_advance_events" && c.ops[0] === "insert")?.payloads[0] as { metadata: { approvedAs: string } };
    expect(decided.metadata.approvedAs).toBe("approval");

    resetFake();
    scriptApproval(8_000_000);
    expect(await transitionClaim({ row: claim, move: "approve", actor: approver, write: writer().write, approvedOnCheck: true })).toEqual({ ok: true });
    const onCheck = calls.find((c) => c.table === "reimbursement_advance_events" && c.ops[0] === "insert")?.payloads[0] as { metadata: { approvedAs: string } };
    expect(onCheck.metadata.approvedAs).toBe("check");
  });

  it("writes the advance before the claim, so a failed claim write leaves a close that approving again finishes", async () => {
    scriptApproval(8_720_000);
    const first = writer("lost");
    expect((await transitionClaim({ row: claim, move: "approve", actor: approver, write: first.write })).ok).toBe(false);
    expect(advanceWrites()).toHaveLength(1);

    // Approving again: the advance is closed by this claim on these figures, so only the claim moves.
    resetFake();
    script("reimbursement_claim_items", { data: [{ id: "item-1", amount_vnd: 8_720_000, declined_at: null, removed_at: null }] });
    script("reimbursement_advances", { data: advanceRaw({ status: "settled", balance_vnd: 720_000, spent_vnd: 8_720_000, settled_claim_id: "claim-1" }) });
    script("reimbursement_advance_transfers", out);
    script("reimbursement_claim_events", { data: { id: "claim-event-2" } });
    const again = writer();
    expect(await transitionClaim({ row: claim, move: "approve", actor: approver, write: again.write })).toEqual({ ok: true });
    expect(again.patches[0]).toMatchObject({ status: "approved", approved_total_vnd: 720_000 });
    expect(advanceWrites()).toEqual([]);
  });

  it("changes nothing on the claim when the advance could not be closed", async () => {
    script("reimbursement_claim_items", { data: [{ id: "item-1", amount_vnd: 8_000_000, declined_at: null, removed_at: null }] });
    script("reimbursement_advances", { data: null, error: { message: "down" } });
    const { write, patches } = writer();
    expect((await transitionClaim({ row: claim, move: "approve", actor: approver, write })).ok).toBe(false);
    expect(patches).toEqual([]);
  });

  it("settles a settlement whose every receipt was declined: nothing was spent, and all of it comes back", async () => {
    script("reimbursement_claim_items", { data: [{ id: "item-1", amount_vnd: 2_000_000, declined_at: "t", removed_at: null }] });
    script("reimbursement_advances", { data: advanceRaw() }, { data: [{ id: "advance-1" }] });
    script("reimbursement_advance_transfers", out);
    script("reimbursement_advance_events", { data: { id: "event-1" } });
    script("reimbursement_claim_events", { data: { id: "claim-event-1" } });
    const { write, patches } = writer();
    expect(await transitionClaim({ row: claim, move: "approve", actor: approver, write })).toEqual({ ok: true });
    expect(patches[0]).toMatchObject({ status: "settled", approved_total_vnd: 0 });
    expect(advanceWrites()[0]).toMatchObject({ status: "to_return", spent_vnd: 0, balance_vnd: -ADVANCED });
  });

  it("still refuses that on an ordinary claim", async () => {
    script("reimbursement_claim_items", { data: [{ id: "item-1", amount_vnd: 2_000_000, declined_at: "t", removed_at: null }] });
    const { write, patches } = writer();
    const result = await transitionClaim({ row: { ...claim, advanceId: undefined }, move: "approve", actor: approver, write });
    expect(result.ok === false && result.error).toMatch(/reject the claim/);
    expect(patches).toEqual([]);
  });
});

describe("what a settlement cannot do", () => {
  it.each(["submitted", "checked"] as const)("is never rejected from %s, because the money is already out", async (status) => {
    const { write, patches } = writer();
    const actor = status === "submitted" ? { ...approver, kind: "checker" as const } : approver;
    const result = await transitionClaim({ row: { ...claim, status }, move: "reject", actor, write, reason: "No." });
    expect(result.ok === false && result.error).toMatch(/never rejected/);
    expect(patches).toEqual([]);
  });

  it("may still be sent back, which leaves the advance open", async () => {
    script("reimbursement_advances", { data: advanceRaw() });
    script("reimbursement_claim_items", { data: [] });
    script("reimbursement_claim_events", { data: { id: "claim-event-1" } });
    const { write, patches } = writer();
    expect(await transitionClaim({ row: claim, move: "send_back", actor: approver, write, reason: "Attach the invoice." })).toEqual({ ok: true });
    expect(patches[0].status).toBe("sent_back");
    expect(advanceWrites()).toEqual([]);
  });
});

// The advance closes first, so a close can land while the claim stays where it was. From there
// the only way out is to approve the same figures again: what would change them strands it.
describe("a settlement whose advance has already closed on it", () => {
  const closed = advanceRaw({ status: "to_return", settled_claim_id: "claim-1", spent_vnd: 7_360_000 });

  it("cannot be sent back, and writes nothing", async () => {
    script("reimbursement_advances", { data: closed });
    const { write, patches } = writer();
    expect(await transitionClaim({ row: claim, move: "send_back", actor: approver, write, reason: "Attach the invoice." })).toEqual({
      ok: false,
      error: expect.stringContaining("Approve it to finish"),
    });
    expect(patches).toEqual([]);
  });

  it("refuses the send-back when the advance cannot be read, rather than risk stranding it", async () => {
    script("reimbursement_advances", { error: { message: "down" } });
    const { write, patches } = writer();
    expect((await transitionClaim({ row: claim, move: "send_back", actor: approver, write, reason: "Attach the invoice." })).ok).toBe(false);
    expect(patches).toEqual([]);
  });

  it("can still be sent back when another claim closed the advance, because this one's receipts are free to change", async () => {
    script("reimbursement_advances", { data: advanceRaw({ status: "to_return", settled_claim_id: "claim-2" }) });
    script("reimbursement_claim_items", { data: [] });
    script("reimbursement_claim_events", { data: { id: "claim-event-1" } });
    const { write, patches } = writer();
    expect(await transitionClaim({ row: claim, move: "send_back", actor: approver, write, reason: "Attach the invoice." })).toEqual({ ok: true });
    expect(patches[0].status).toBe("sent_back");
  });

  // The same race from the checker's side: a decline or a restore changes what was spent, which
  // the advance has closed on, and then approving would be refused for ever.
  it.each([["declining", "Not ours"], ["restoring", null]])("refuses %s a receipt, and writes nothing", async (_move, reason) => {
    script("reimbursement_advances", { data: closed });
    const row = { ...claim, status: "submitted" as const };
    const answer = await declineClaimItem({ row, itemId: "item-1", actor: { ...approver, kind: "checker" as const }, reason });
    expect(answer).toEqual({ ok: false, error: expect.stringContaining("stay as they are") });
    expect(calls.some((c) => c.table === "reimbursement_claim_items" && c.ops[0] === "update")).toBe(false);
  });

  // The same again by another door: a rate by hand revalues a receipt that has one.
  it("refuses a rate by hand, and writes nothing", async () => {
    script("reimbursement_advances", { data: closed });
    const row = { ...claim, status: "submitted" as const };
    const answer = await enterItemRateByHand({ row, itemId: "item-1", actor: { ...approver, kind: "checker" as const }, rate: "26,000" });
    expect(answer).toEqual({ ok: false, error: expect.stringContaining("rates stay as they are") });
    expect(calls.some((c) => c.table === "reimbursement_claim_items" && c.ops[0] === "update")).toBe(false);
    expect(calls.some((c) => c.table === "reimbursement_fx_rates")).toBe(false);
  });

  it("still lets a checker decline a receipt on a settlement whose advance is open", async () => {
    script("reimbursement_advances", { data: advanceRaw() });
    script("reimbursement_claim_items", { data: [{ id: "item-1" }] });
    const row = { ...claim, status: "submitted" as const };
    expect(await declineClaimItem({ row, itemId: "item-1", actor: { ...approver, kind: "checker" as const }, reason: "Not ours" })).toEqual({ ok: true });
  });

  // The same moment's race: a send-back landed just as the close did. The owner cannot change the
  // figures, so sending it again and approving finishes it.
  it("keeps its receipts from their owner, and says how it finishes", async () => {
    script("reimbursement_claims", { data: { id: "claim-1", status: "sent_back", person_id: "person-a", title: "Settlement", submitted_at: "t", advance_id: "advance-1" } });
    script("reimbursement_advances", { data: closed });
    expect(await openForOwner({ claimId: "claim-1" }, "person-a", "edit")).toEqual({ ok: false, error: expect.stringContaining("Send the settlement again") });
  });

  it("leaves a settlement its advance has not closed on open to its owner", async () => {
    script("reimbursement_claims", { data: { id: "claim-1", status: "sent_back", person_id: "person-a", title: "Settlement", submitted_at: "t", advance_id: "advance-1" } });
    script("reimbursement_advances", { data: advanceRaw() });
    expect((await openForOwner({ claimId: "claim-1" }, "person-a", "edit")).ok).toBe(true);
  });
});

describe("the approval limit reads the new money", () => {
  it.each([
    { spent: 12_999_999, approves: true, why: "₫4,999,999 of new money" },
    { spent: 13_000_000, approves: false, why: "₫5,000,000 of new money" },
    { spent: 7_000_000, approves: true, why: "nothing new at all" },
  ])("$spent: $why", async ({ spent, approves }) => {
    script("reimbursement_advance_transfers", out);
    expect(await settlementApprovesOnCheck("advance-1", spent)).toBe(approves);
  });

  it("leaves it with the approver when the advance cannot be read", async () => {
    script("reimbursement_advance_transfers", { data: null, error: { message: "down" } });
    expect(await settlementApprovesOnCheck("advance-1", 7_000_000)).toBe(false);
  });

  it("asks the approver for a check at or over the limit, and the advance does not close", async () => {
    script("reimbursement_claim_items", { data: [] }, { data: [] }, { data: [{ id: "item-1", amount_vnd: 13_000_000, declined_at: null, removed_at: null }] });
    script("reimbursement_claim_events", { data: { id: "claim-event-1" } });
    script("reimbursement_advance_transfers", out);
    const { write, patches } = writer();
    const checker = { ...approver, kind: "checker" as const };
    expect(await transitionClaim({ row: { ...claim, status: "submitted" }, move: "check", actor: checker, write })).toEqual({ ok: true });
    expect(patches.map((p) => p.status)).toEqual(["checked"]);
    expect(told).toContain("approvers of check");
    expect(advanceWrites()).toEqual([]);
  });
});

describe("closeAdvance", () => {
  const actor = { kind: "approver" as const, personId: "person-d", mayDecideOwn: false };
  const input = { claimId: "claim-1", advanceId: "advance-1", spentVnd: 8_000_000, actor };

  it("refuses when another claim or other figures closed it", async () => {
    script("reimbursement_advances", { data: advanceRaw({ status: "settled", balance_vnd: 0, spent_vnd: 8_000_000, settled_claim_id: "claim-2" }) });
    script("reimbursement_advance_transfers", out);
    expect((await closeAdvance(input)).ok).toBe(false);

    script("reimbursement_advances", { data: advanceRaw({ status: "settled", balance_vnd: 100, spent_vnd: 8_000_100, settled_claim_id: "claim-1" }) });
    script("reimbursement_advance_transfers", out);
    expect((await closeAdvance(input)).ok).toBe(false);
  });

  it("refuses an advance with nothing on its ledger", async () => {
    script("reimbursement_advances", { data: advanceRaw() });
    script("reimbursement_advance_transfers", { data: [] });
    const result = await closeAdvance(input);
    expect(result.ok === false && result.error).toMatch(/no transfer/);
  });

  it("refuses one that was never paid out", async () => {
    script("reimbursement_advances", { data: advanceRaw({ status: "approved" }) });
    script("reimbursement_advance_transfers", out);
    expect((await closeAdvance(input)).ok).toBe(false);
    expect(advanceWrites()).toEqual([]);
  });

  it("answers not found for an advance that is not there", async () => {
    script("reimbursement_advances", { data: null });
    expect((await closeAdvance(input)).ok).toBe(false);
  });
});

describe("returnUnspent", () => {
  const row: AdvanceRow = { id: "advance-1", refNo: 7, status: "paid_out", personId: "person-a", purpose: "Venue deposit", amountVnd: ADVANCED, spendEndsOn: "2026-11-13", settleBy: "2026-11-30", submittedAt: "t", decidedBy: "person-d", balanceVnd: null };
  const owner = { kind: "owner" as const, personId: "person-a", mayDecideOwn: false };

  it("owes the whole amount back, with no claim, narrowed to the owner in the write", async () => {
    script("reimbursement_claims", { data: [] });
    script("reimbursement_advance_transfers", out);
    script("reimbursement_advances", { data: [{ id: "advance-1" }] });
    script("reimbursement_advance_events", { data: { id: "event-1" } });
    expect(await returnUnspent({ row, actor: owner })).toEqual({ ok: true });
    expect(told).toContain("payers owed");
    expect(advanceWrites()[0]).toMatchObject({ status: "to_return", spent_vnd: 0, balance_vnd: -ADVANCED, settled_claim_id: null });
    expect(calls.filter((c) => c.table === "reimbursement_advances").flatMap((c) => c.filters)).toEqual(expect.arrayContaining([["eq", "person_id", "person-a"]]));
  });

  it("is refused while a settlement exists, because the person said they spent some of it", async () => {
    script("reimbursement_claims", { data: [{ id: "claim-1" }] });
    const result = await returnUnspent({ row, actor: owner });
    expect(result.ok === false && result.error).toMatch(/started a settlement/);
    expect(advanceWrites()).toEqual([]);
  });

  it("is refused when the settlement cannot be read, rather than assuming there is none", async () => {
    script("reimbursement_claims", { data: null, error: { message: "down" } });
    expect((await returnUnspent({ row, actor: owner })).ok).toBe(false);
    expect(advanceWrites()).toEqual([]);
  });

  it("is someone else's to refuse: only the owner may", async () => {
    script("reimbursement_claims", { data: [] });
    script("reimbursement_advance_transfers", out);
    expect((await returnUnspent({ row, actor: { ...owner, personId: "person-b" } })).ok).toBe(false);
    expect(advanceWrites()).toEqual([]);
  });

  it("is refused once it has moved on", async () => {
    script("reimbursement_claims", { data: [] });
    script("reimbursement_advance_transfers", out);
    expect((await returnUnspent({ row: { ...row, status: "settled" }, actor: owner })).ok).toBe(false);
  });
});

describe("settlementClaimOf", () => {
  it("raises on a failed read, because none would start a second claim", async () => {
    script("reimbursement_claims", { data: null, error: { message: "down" } });
    await expect(settlementClaimOf("advance-1")).rejects.toThrow("down");
  });
});
