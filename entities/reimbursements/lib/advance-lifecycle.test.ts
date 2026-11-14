import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script, scriptStorage, storageCalls } from "@/kernel/data/testing/fake-company-os";

// The one step that moves an advance. What these assert is what the history or a
// person would observe: the patch the scoped writer was asked to land, the status it
// was guarded on, the row appended and what the action answers.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: async () => {} }));
const payers = vi.hoisted(() => ({ ids: ["person-t", "person-d"] as string[] }));
vi.mock("@/kernel/identity/people-holding", () => ({ peopleHolding: async () => payers.ids }));
const told = vi.hoisted(() => [] as { what: string; about: Record<string, unknown> }[]);
vi.mock("./advance-notices", () => {
  const tell = (what: string) => async (about: Record<string, unknown>) => void told.push({ what, about });
  return {
    tellApproversOfRequest: tell("approvers"),
    tellOwnerOfDecision: tell("owner decision"),
    tellPayersToTransfer: tell("payers transfer"),
    tellPayersOfCancel: tell("payers cancel"),
    tellOwnerOfClose: tell("owner close"),
    tellOwnerOfPayout: tell("owner payout"),
    tellOwnerOfReturnConfirmed: tell("owner return"),
    tellPayersOfMoneyOwed: tell("payers owed"),
  };
});
const approvals = vi.hoisted(() => [] as { move: string; reason: string | null }[]);
vi.mock("./advance-decisions", () => ({ recordAdvanceApproval: async (i: { move: string; reason: string | null }) => void approvals.push({ move: i.move, reason: i.reason }) }));
const bank = vi.hoisted(() => ({ answer: { ok: true, onFile: true } as { ok: true; onFile: boolean } | { ok: false; error: string } }));
vi.mock("./own-bank-details", () => ({ readBankDetailsOnFile: async () => bank.answer }));

import { advanceRowFrom, advanceWriterFor, createAdvance, deleteDraftAdvance, editAdvance, readAdvanceRow, transitionAdvance, type AdvanceActor, type AdvancePatch, type AdvanceRow } from "./advance-lifecycle";
import type { AdvanceStatus } from "./advance-rules";

const OWNER = "person-a";
const owner: AdvanceActor = { kind: "owner", personId: OWNER, mayDecideOwn: false, label: "Avery" };
const approver: AdvanceActor = { kind: "approver", personId: "person-d", mayDecideOwn: false };
const payer: AdvanceActor = { kind: "payer", personId: "person-t", mayDecideOwn: false };

const row = (status: AdvanceStatus, over: Partial<AdvanceRow> = {}): AdvanceRow => ({
  id: "advance-1",
  refNo: 7,
  status,
  personId: OWNER,
  purpose: "Venue deposit",
  amountVnd: 8_000_000,
  spendEndsOn: "2026-11-13",
  settleBy: null,
  submittedAt: status === "draft" ? null : "2026-11-03T02:00:00Z",
  decidedBy: null,
  balanceVnd: null,
  ...over,
});

type Answer = "lands" | "matches nothing" | { code: string };
function writer(answer: Answer = "lands") {
  const asked: { patch: AdvancePatch; from: AdvanceStatus; submittedAt?: string }[] = [];
  const write = async (patch: AdvancePatch, from: AdvanceStatus, submittedAt?: string) => {
    asked.push({ patch: { ...patch }, from, ...(submittedAt !== undefined ? { submittedAt } : {}) });
    if (typeof answer === "object") return { data: null, error: { message: "raw database words with a row id", code: answer.code } };
    return { data: answer === "lands" ? [{ id: "advance-1" }] : [], error: null };
  };
  return { write, asked };
}

const events = () => calls.filter((c) => c.table === "reimbursement_advance_events" && c.ops[0] === "insert").map((c) => c.payloads[0] as Record<string, unknown>);
const landsEvent = () => script("reimbursement_advance_events", { data: { id: "event-1" } });

function scriptSubmitFacts(evidence = 1, others = 0) {
  script("reimbursement_advance_files", { data: Array.from({ length: evidence }, (_, i) => ({ id: `f${i}` })) });
  script("reimbursement_advances", { data: Array.from({ length: others }, (_, i) => ({ id: `a${i}` })) });
}

beforeEach(() => {
  resetFake();
  told.length = 0;
  approvals.length = 0;
  bank.answer = { ok: true, onFile: true };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("a close", () => {
  it("is refused without the settlement behind it, since the database's shape check would let it through", async () => {
    const { write, asked } = writer();
    const result = await transitionAdvance({ row: row("paid_out"), move: "close", actor: { kind: "system", personId: "person-t", mayDecideOwn: false }, write, facts: { spentVnd: 8_720_000, balanceVnd: 720_000 } });
    expect(result).toEqual({ ok: false, error: "A close needs the settlement that closes it." });
    expect(asked).toEqual([]);
  });

  it("tells the owner how it ended", async () => {
    landsEvent();
    await transitionAdvance({ row: row("paid_out"), move: "close", actor: { kind: "system", personId: "person-t", mayDecideOwn: false }, write: writer().write, facts: { spentVnd: 7_000_000, balanceVnd: -1_000_000, settledClaimId: "claim-1" } });
    expect(told.map((t) => t.what)).toContain("owner close");
    expect(told.find((t) => t.what === "owner close")?.about).toMatchObject({ balanceVnd: -1_000_000 });
    expect(told.find((t) => t.what === "payers owed")?.about).toMatchObject({ owedVnd: 1_000_000 });
  });
});

describe("the approvals follow the move", () => {
  it("records a move that landed, with its reason", async () => {
    landsEvent();
    const { write } = writer();
    expect(await transitionAdvance({ row: row("submitted"), move: "send_back", actor: approver, write, reason: " Attach the quote. " })).toEqual({ ok: true });
    expect(approvals).toEqual([{ move: "send_back", reason: "Attach the quote." }]);
  });

  it("records nothing for a write that matched nothing, or one the rules refused", async () => {
    const { write } = writer("matches nothing");
    await transitionAdvance({ row: row("submitted"), move: "approve", actor: approver, write });
    await transitionAdvance({ row: row("paid_out"), move: "approve", actor: approver, write: writer().write });
    expect(approvals).toEqual([]);
  });
});

describe("advanceWriterFor", () => {
  const filters = () => calls.filter((c) => c.table === "reimbursement_advances").flatMap((c) => c.filters);

  it("guards the write on the status it read", async () => {
    script("reimbursement_advances", { data: [{ id: "advance-1" }] });
    await advanceWriterFor("advance-1", {})({ status: "approved" }, "submitted");
    expect(filters()).toEqual(expect.arrayContaining([["eq", "id", "advance-1"], ["eq", "status", "submitted"]]));
  });

  it("narrows to the owner, and to the very request a decider read", async () => {
    script("reimbursement_advances", { data: [] });
    await advanceWriterFor("advance-1", { ownedBy: OWNER })({ status: "approved" }, "submitted", "2026-11-03T02:00:00+00:00");
    expect(filters()).toEqual(expect.arrayContaining([["eq", "person_id", OWNER], ["eq", "submitted_at", "2026-11-03T02:00:00+00:00"]]));
  });
});

// RB.28: the approver's mark is compared here, beside the write it protects. An owner can
// withdraw, change the amount and send it again, which leaves the status as it was and
// moves only the stamp; a decision on the request the approver read must not land on that one.
describe("a decision on a request sent again since the approver read it", () => {
  const STAMP = "2026-11-03T02:00:00+00:00";
  const READ_IT_AGAIN = { ok: false, error: "This request changed after you opened it. Reload and read it again before you decide." };

  it("refuses an approval whose stamp is not the request's, and writes nothing", async () => {
    const { write, asked } = writer();
    const answer = await transitionAdvance({ row: { ...row("submitted"), submittedAt: STAMP }, move: "approve", actor: approver, write, mark: { submittedAt: "2026-11-02T02:00:00+00:00" } });
    expect(answer).toEqual(READ_IT_AGAIN);
    expect(asked).toEqual([]);
    expect(approvals).toEqual([]);
  });

  it("refuses a missing stamp, and a request that was never sent", async () => {
    const { write, asked } = writer();
    expect(await transitionAdvance({ row: { ...row("submitted"), submittedAt: STAMP }, move: "approve", actor: approver, write, mark: { submittedAt: "" } })).toEqual(READ_IT_AGAIN);
    expect(await transitionAdvance({ row: { ...row("submitted"), submittedAt: null }, move: "approve", actor: approver, write, mark: { submittedAt: STAMP } })).toEqual(READ_IT_AGAIN);
    expect(asked).toEqual([]);
  });

  it("hands the matching stamp to the write, so a request sent again in between matches nothing", async () => {
    const { write, asked } = writer("matches nothing");
    const answer = await transitionAdvance({ row: { ...row("submitted"), submittedAt: STAMP }, move: "approve", actor: approver, write, mark: { submittedAt: STAMP } });
    expect(answer).toEqual({ ok: false, error: "This advance changed while you were working on it. Reload and try again." });
    expect(asked.map((a) => a.submittedAt)).toEqual([STAMP]);
  });
});

describe("submit", () => {
  it("lands guarded on the status it read, stamps the time, records it and tells the approvers", async () => {
    scriptSubmitFacts();
    landsEvent();
    const { write, asked } = writer();
    expect(await transitionAdvance({ row: row("draft"), move: "submit", actor: owner, write, facts: { promised: true } })).toEqual({ ok: true });
    expect(asked[0].from).toBe("draft");
    expect(asked[0].patch.status).toBe("submitted");
    expect(asked[0].patch.submitted_at).toMatch(/^\d{4}-/);
    expect(events()[0]).toMatchObject({ advance_id: "advance-1", move: "submit", from_status: "draft", to_status: "submitted", actor_person_id: OWNER });
    expect(told.map((t) => t.what)).toEqual(["approvers"]);
    expect(told[0].about.eventId).toBe("event-1");
  });

  it("is refused without evidence, and writes nothing", async () => {
    scriptSubmitFacts(0);
    const { write, asked } = writer();
    const result = await transitionAdvance({ row: row("draft"), move: "submit", actor: owner, write, facts: { promised: true } });
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("quote") });
    expect(asked).toEqual([]);
  });

  it("is refused without the promise, unless it was given", async () => {
    scriptSubmitFacts();
    const { write } = writer();
    expect(await transitionAdvance({ row: row("draft"), move: "submit", actor: owner, write })).toMatchObject({ ok: false, error: expect.stringContaining("promise") });
  });

  it("is refused while another advance is open", async () => {
    scriptSubmitFacts(1, 1);
    const { write } = writer();
    expect(await transitionAdvance({ row: row("draft"), move: "submit", actor: owner, write, facts: { promised: true } })).toMatchObject({ ok: false, error: expect.stringContaining("open advance") });
  });

  it("says why when the bank read fails, rather than passing", async () => {
    script("reimbursement_advance_files", { data: [{ id: "f" }] });
    bank.answer = { ok: false, error: "Could not read your bank details: down" };
    const { write, asked } = writer();
    expect(await transitionAdvance({ row: row("draft"), move: "submit", actor: owner, write, facts: { promised: true } })).toEqual({ ok: false, error: "Could not read your bank details: down" });
    expect(asked).toEqual([]);
  });

  it("is refused when a read of the facts fails, rather than treating it as none", async () => {
    script("reimbursement_advance_files", { data: null, error: { message: "down" } });
    const { write, asked } = writer();
    expect((await transitionAdvance({ row: row("draft"), move: "submit", actor: owner, write, facts: { promised: true } })).ok).toBe(false);
    expect(asked).toEqual([]);
  });

  it("answers ok without writing when it was already submitted", async () => {
    const { write, asked } = writer();
    expect(await transitionAdvance({ row: row("submitted"), move: "submit", actor: owner, write })).toEqual({ ok: true });
    expect(asked).toEqual([]);
    expect(events()).toEqual([]);
  });
});

describe("the approver's decision", () => {
  it("approves, stamping who, and tells the owner and the payers", async () => {
    landsEvent();
    const { write, asked } = writer();
    expect(await transitionAdvance({ row: row("submitted"), move: "approve", actor: approver, write })).toEqual({ ok: true });
    expect(asked[0].patch).toMatchObject({ status: "approved", decided_by: "person-d" });
    expect(told.map((t) => t.what)).toEqual(["owner decision", "payers transfer"]);
  });

  it("asks the approver to transfer it when the owner is the only other payer", async () => {
    payers.ids = ["person-d", "person-a"];
    landsEvent();
    const { write } = writer();
    await transitionAdvance({ row: row("submitted"), move: "approve", actor: approver, write });
    expect(told.find((t) => t.what === "payers transfer")?.about.approvedBy).toBeNull();
    payers.ids = ["person-t", "person-d"];
  });

  it("needs a reason to send back or reject, and tells the owner why", async () => {
    const { write, asked } = writer();
    expect(await transitionAdvance({ row: row("submitted"), move: "send_back", actor: approver, write, reason: "  " })).toEqual({ ok: false, error: "Give a reason." });
    expect(await transitionAdvance({ row: row("submitted"), move: "reject", actor: approver, write })).toEqual({ ok: false, error: "Give a reason." });
    expect(asked).toEqual([]);
    landsEvent();
    expect(await transitionAdvance({ row: row("submitted"), move: "send_back", actor: approver, write, reason: " The quote is smaller. " })).toEqual({ ok: true });
    expect(events()[0].reason).toBe("The quote is smaller.");
    expect(told[0]).toMatchObject({ what: "owner decision", about: { became: "sent_back", reason: "The quote is smaller." } });
  });

  it("refuses an approver deciding their own, unless they may", async () => {
    const mine = row("submitted", { personId: "person-d" });
    const { write, asked } = writer();
    expect(await transitionAdvance({ row: mine, move: "approve", actor: approver, write })).toEqual({ ok: false, error: "You cannot decide your own advance." });
    expect(asked).toEqual([]);
    landsEvent();
    expect(await transitionAdvance({ row: mine, move: "approve", actor: { ...approver, mayDecideOwn: true }, write })).toEqual({ ok: true });
  });

  it("refuses a repeated decision", async () => {
    const { write, asked } = writer();
    expect((await transitionAdvance({ row: row("approved"), move: "approve", actor: approver, write })).ok).toBe(false);
    expect(asked).toEqual([]);
  });
});

describe("the owner's other moves", () => {
  it("reads as not found to someone else", async () => {
    const { write, asked } = writer();
    expect(await transitionAdvance({ row: row("submitted"), move: "withdraw", actor: { ...owner, personId: "someone" }, write })).toEqual({ ok: false, error: "Advance not found." });
    expect(asked).toEqual([]);
  });

  it("cancels an approved advance with a reason, and tells the payers so nobody transfers it", async () => {
    const { write } = writer();
    expect(await transitionAdvance({ row: row("approved"), move: "cancel", actor: owner, write })).toEqual({ ok: false, error: "Give a reason." });
    landsEvent();
    expect(await transitionAdvance({ row: row("approved"), move: "cancel", actor: owner, write, reason: "The trip moved." })).toEqual({ ok: true });
    expect(told.map((t) => t.what)).toEqual(["payers cancel"]);
  });

  it("says the money has gone when a cancel loses to a transfer, in words rather than the database's", async () => {
    const { write } = writer({ code: "P0R02" });
    expect(await transitionAdvance({ row: row("approved"), move: "cancel", actor: owner, write, reason: "The trip moved." })).toEqual({
      ok: false,
      error: "The money has already been sent, so this advance can no longer be cancelled.",
    });
    expect(events()).toEqual([]);
    expect(told).toEqual([]);
  });

  it("deletes a never-submitted draft rather than cancelling it", async () => {
    const { write, asked } = writer();
    expect(await transitionAdvance({ row: row("draft"), move: "cancel", actor: owner, write })).toEqual({ ok: false, error: "This draft was never sent, so delete it instead." });
    expect(asked).toEqual([]);
  });
});

describe("the payout", () => {
  it("writes the deadline and tells the owner", async () => {
    landsEvent();
    const { write, asked } = writer();
    expect(await transitionAdvance({ row: row("approved", { decidedBy: "person-d" }), move: "pay_out", actor: payer, write, facts: { settleBy: "2026-11-30" } })).toEqual({ ok: true });
    expect(asked[0].patch).toMatchObject({ status: "paid_out", settle_by: "2026-11-30" });
    expect(asked[0].patch.paid_out_at).toMatch(/^\d{4}-/);
    expect(told[0]).toMatchObject({ what: "owner payout", about: { settleBy: "2026-11-30" } });
  });

  it("keeps whoever approved it from recording it", async () => {
    const { write, asked } = writer();
    const result = await transitionAdvance({ row: row("approved", { decidedBy: "person-t" }), move: "pay_out", actor: payer, write, facts: { settleBy: "2026-11-30" } });
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("someone else") });
    expect(asked).toEqual([]);
  });

  it("needs its deadline", async () => {
    const { write, asked } = writer();
    expect((await transitionAdvance({ row: row("approved"), move: "pay_out", actor: payer, write })).ok).toBe(false);
    expect(asked).toEqual([]);
  });
});

describe("the two moves with more than one ending", () => {
  const system: AdvanceActor = { kind: "system", personId: "person-t", mayDecideOwn: false };

  it("close freezes the figures, and settles only when nothing is owed back", async () => {
    landsEvent();
    const { write, asked } = writer();
    await transitionAdvance({ row: row("paid_out"), move: "close", actor: system, write, facts: { spentVnd: 7_360_000, balanceVnd: -640_000, settledClaimId: "claim-1" } });
    expect(asked[0].patch).toEqual({ status: "to_return", spent_vnd: 7_360_000, balance_vnd: -640_000, settled_claim_id: "claim-1" });

    landsEvent();
    const more = writer();
    await transitionAdvance({ row: row("paid_out"), move: "close", actor: system, write: more.write, facts: { spentVnd: 8_720_000, balanceVnd: 720_000, settledClaimId: "claim-1" } });
    expect(more.asked[0].patch).toMatchObject({ status: "settled", spent_vnd: 8_720_000, balance_vnd: 720_000 });
    expect(more.asked[0].patch.settled_at).toMatch(/^\d{4}-/);
  });

  it("close is refused without its figures", async () => {
    const { write, asked } = writer();
    expect((await transitionAdvance({ row: row("paid_out"), move: "close", actor: system, write, facts: { balanceVnd: 0 } })).ok).toBe(false);
    expect((await transitionAdvance({ row: row("paid_out"), move: "close", actor: system, write })).ok).toBe(false);
    expect(asked).toEqual([]);
  });

  it("a return stays open while money is owed, and settles when none is", async () => {
    landsEvent();
    const part = writer();
    await transitionAdvance({ row: row("to_return"), move: "confirm_return", actor: payer, write: part.write, facts: { outstandingAfterVnd: 240_000 } });
    expect(part.asked[0].patch).toEqual({ status: "to_return" });
    expect(told[0]).toMatchObject({ what: "owner return", about: { outstandingAfterVnd: 240_000 } });

    landsEvent();
    const whole = writer();
    await transitionAdvance({ row: row("to_return"), move: "confirm_return", actor: payer, write: whole.write, facts: { outstandingAfterVnd: 0 } });
    expect(whole.asked[0].patch).toMatchObject({ status: "settled" });
  });
});

describe("a write that does not land", () => {
  it("answers that it changed and records nothing, when it matched nothing", async () => {
    const { write } = writer("matches nothing");
    const result = await transitionAdvance({ row: row("submitted"), move: "approve", actor: approver, write });
    expect(result).toEqual({ ok: false, error: "This advance changed while you were working on it. Reload and try again." });
    expect(events()).toEqual([]);
    expect(told).toEqual([]);
  });

  it("keeps a lost history row from reading as a failed move", async () => {
    script("reimbursement_advance_events", { data: null, error: { message: "down" } });
    const { write } = writer();
    expect(await transitionAdvance({ row: row("submitted"), move: "approve", actor: approver, write })).toEqual({ ok: true });
    expect(told[0].about.eventId).toBeNull();
  });
});

describe("createAdvance", () => {
  const start = { purpose: " Venue deposit ", amountVnd: 8_000_000, spendEndsOn: "2026-11-13", owner: { personId: OWNER, teamMemberId: "member-a" }, actor: owner };

  it("starts a draft for the person the guard proved, and records it", async () => {
    script("reimbursement_advances", { data: { id: "advance-9" } });
    landsEvent();
    expect(await createAdvance(start)).toEqual({ ok: true, id: "advance-9" });
    const insert = calls.find((c) => c.table === "reimbursement_advances" && c.ops[0] === "insert");
    expect(insert?.payloads[0]).toEqual({ purpose: "Venue deposit", amount_vnd: 8_000_000, spend_ends_on: "2026-11-13", person_id: OWNER, team_member_id: "member-a" });
    expect(events()[0]).toMatchObject({ move: "create", from_status: null, to_status: "draft" });
  });

  const BAD: [string, Partial<typeof start>, RegExp][] = [
    ["a blank purpose", { purpose: "  " }, /what it is for/],
    ["no amount", { amountVnd: 0 }, /amount/],
    ["a fraction", { amountVnd: 1.5 }, /amount/],
    ["over the maximum", { amountVnd: 10_000_001 }, /10,000,000/],
    ["no date", { spendEndsOn: "" }, /date/],
  ];
  for (const [what, change, words] of BAD) {
    it(`refuses ${what} before writing`, async () => {
      const result = await createAdvance({ ...start, ...change });
      expect(result.ok === false && result.error).toMatch(words);
      expect(calls).toEqual([]);
    });
  }

  it("takes the maximum itself", async () => {
    script("reimbursement_advances", { data: { id: "advance-9" } });
    landsEvent();
    expect((await createAdvance({ ...start, amountVnd: 10_000_000 })).ok).toBe(true);
  });

  it("says one at a time when the unique index refuses a second open advance", async () => {
    script("reimbursement_advances", { data: null, error: { message: "duplicate key", code: "23505" } as never });
    expect(await createAdvance(start)).toEqual({ ok: false, error: "Settle your open advance first: one at a time." });
  });
});

describe("editAdvance", () => {
  const edit = { purpose: "Venue", amountVnd: 7_000_000, spendEndsOn: "2026-11-13", actor: owner };

  it("changes a draft or a sent-back advance, guarded on owner and status", async () => {
    script("reimbursement_advances", { data: [{ id: "advance-1" }] });
    expect(await editAdvance({ ...edit, row: row("sent_back") })).toEqual({ ok: true });
    const update = calls.find((c) => c.ops[0] === "update");
    expect(update?.filters).toEqual(expect.arrayContaining([["eq", "person_id", OWNER], ["eq", "status", "sent_back"]]));
  });

  it("refuses once it is with the approver, and for anyone but the owner", async () => {
    expect((await editAdvance({ ...edit, row: row("submitted") })).ok).toBe(false);
    expect(await editAdvance({ ...edit, row: row("draft"), actor: { ...owner, personId: "someone" } })).toEqual({ ok: false, error: "Advance not found." });
    expect(calls).toEqual([]);
  });
});

describe("deleteDraftAdvance", () => {
  it("deletes only a never-submitted draft, guarded in the query, and its objects after the row", async () => {
    script("reimbursement_advance_files", { data: [{ storage_path: "advance/advance-1/q.pdf" }] });
    script("reimbursement_advances", { data: [{ id: "advance-1" }] });
    scriptStorage("remove", { data: [] });
    expect(await deleteDraftAdvance({ row: row("draft"), actor: owner })).toEqual({ ok: true });
    const del = calls.find((c) => c.ops[0] === "delete");
    expect(del?.filters).toEqual(expect.arrayContaining([["eq", "person_id", OWNER], ["eq", "status", "draft"], ["is", "submitted_at", null]]));
    expect(storageCalls.map((c) => c.args[0])).toEqual([["advance/advance-1/q.pdf"]]);
  });

  it("keeps one that was ever submitted, and says why", async () => {
    const result = await deleteDraftAdvance({ row: row("draft", { submittedAt: "2026-11-03T02:00:00Z" }), actor: owner });
    expect(result.ok === false && result.error).toMatch(/ten years/);
    expect(calls).toEqual([]);
  });

  it("removes no object when the row did not go", async () => {
    script("reimbursement_advance_files", { data: [{ storage_path: "advance/advance-1/q.pdf" }] });
    script("reimbursement_advances", { data: [] });
    expect((await deleteDraftAdvance({ row: row("draft"), actor: owner })).ok).toBe(false);
    expect(storageCalls).toEqual([]);
  });
});

describe("advanceRowFrom", () => {
  it("reads a row, and refuses a status this code does not know rather than guessing", () => {
    const raw = { id: "a", ref_no: 7, status: "paid_out", person_id: "p", purpose: "x", amount_vnd: 8_000_000, spend_ends_on: "2026-11-13", settle_by: "2026-11-30", submitted_at: "t", decided_by: "d", balance_vnd: null };
    expect(advanceRowFrom(raw)).toMatchObject({ refNo: 7, status: "paid_out", amountVnd: 8_000_000, balanceVnd: null, settleBy: "2026-11-30" });
    expect(advanceRowFrom({ ...raw, balance_vnd: -640_000 })?.balanceVnd).toBe(-640_000);
    expect(advanceRowFrom({ ...raw, status: "overdue" })).toBeNull();
  });
});

describe("readAdvanceRow", () => {
  it("answers the row, or null when there is none", async () => {
    script("reimbursement_advances", { data: { id: "a", ref_no: 1, status: "draft", person_id: "p", purpose: "x", amount_vnd: 1, spend_ends_on: "2026-11-13" } }, { data: null });
    expect((await readAdvanceRow("a"))?.status).toBe("draft");
    expect(await readAdvanceRow("b")).toBeNull();
  });

  it("raises when the read fails: not found would be a wrong answer", async () => {
    script("reimbursement_advances", { data: null, error: { message: "down" } });
    await expect(readAdvanceRow("a")).rejects.toThrow("down");
  });
});
