import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// The ledger: the row first, then the status, so a failure is retryable. What matters
// here is what lands on the ledger and that a retry never records money twice.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: async () => {} }));
const told = vi.hoisted(() => [] as string[]);
vi.mock("./advance-notices", () => {
  const tell = (what: string) => async () => void told.push(what);
  return {
    tellApproversOfRequest: tell("approvers"),
    tellOwnerOfDecision: tell("decision"),
    tellPayersToTransfer: tell("transfer"),
    tellPayersOfCancel: tell("cancel"),
    tellOwnerOfPayout: tell("payout"),
    tellOwnerOfReturnConfirmed: tell("return"),
    tellPayersOfReportedReturn: tell("reported"),
    tellPayersOfMoneyOwed: tell("owed"),
  };
});
const payers = vi.hoisted(() => ({ ids: ["person-t", "person-d"] as string[] }));
vi.mock("@/kernel/identity/people-holding", () => ({ peopleHolding: async () => payers.ids }));
vi.mock("./advance-decisions", () => ({ recordAdvanceApproval: async () => {} }));
vi.mock("./own-bank-details", () => ({ readBankDetailsOnFile: async () => ({ ok: true, onFile: true }) }));
const calendar = vi.hoisted(() => ({ fail: false, rows: [] as { date: string; name: string }[] }));
vi.mock("@/entities/time-off", () => ({
  holidayCalendar: async () => {
    if (calendar.fail) throw new Error("calendar down");
    return calendar.rows;
  },
}));
const ACCOUNT = vi.hoisted(() => "9999 0000 4821");
const bankRead = vi.hoisted(() => ({ answer: null as unknown }));
vi.mock("./bank-details", async (importActual) => ({
  ...(await importActual<typeof import("./bank-details")>()),
  readAdvancePayeeBank: async () => bankRead.answer,
}));

import type { AdvanceActor, AdvanceRow } from "./advance-lifecycle";
import { recordPayout, recordReturn, reportReturnSent } from "./advance-ledger";
import type { AdvanceStatus } from "./advance-rules";

const payer: AdvanceActor = { kind: "payer", personId: "person-t", mayDecideOwn: false, label: "Bookkeeper" };
const row = (status: AdvanceStatus, over: Partial<AdvanceRow> = {}): AdvanceRow => ({
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
  ...over,
});

const inserted = () => calls.filter((c) => c.table === "reimbursement_advance_transfers" && c.ops[0] === "insert").map((c) => c.payloads[0] as Record<string, unknown>);
const statusWrites = () => calls.filter((c) => c.table === "reimbursement_advances" && c.ops[0] === "update").map((c) => c.payloads[0] as Record<string, unknown>);

const KEY = "11111111-1111-4111-8111-111111111111";
const payout = (over: Partial<Parameters<typeof recordPayout>[0]> = {}) =>
  recordPayout({ row: row("approved"), amountVnd: 8_000_000, transferredOn: "2026-10-14", requestKey: KEY, receiptFileId: "file-1", actor: payer, ...over });

beforeEach(() => {
  resetFake();
  told.length = 0;
  calendar.fail = false;
  calendar.rows = [{ date: "2026-02-16", name: "Tết Nguyên Đán" }];
  bankRead.answer = { ok: true, bank: { bankName: "Techcombank", accountNumber: ACCOUNT, branch: "" } };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("recordPayout", () => {
  function scriptHappy() {
    script("reimbursement_advance_transfers", { data: [] }, { data: null });
    script("reimbursement_advance_files", { data: { id: "file-1" } });
    script("reimbursement_advances", { data: [{ id: "advance-1" }] });
    script("reimbursement_advance_events", { data: { id: "event-1" } });
  }

  it("writes the transfer first, masked, then moves the advance with its deadline", async () => {
    scriptHappy();
    expect(await payout()).toEqual({ ok: true });
    expect(inserted()).toEqual([
      expect.objectContaining({ advance_id: "advance-1", direction: "out", amount_vnd: 8_000_000, transferred_on: "2026-10-14", request_key: KEY, recorded_by: "person-t", bank_receipt_file_id: "file-1", bank_name_snapshot: "Techcombank", bank_account_last4: "4821" }),
    ]);
    // 14 October plus ten working days.
    expect(statusWrites()[0]).toMatchObject({ status: "paid_out", settle_by: "2026-10-28" });
    expect(told).toEqual(["payout"]);
  });

  it("counts from the spend when it is later than the transfer", async () => {
    scriptHappy();
    await payout({ row: row("approved", { spendEndsOn: "2026-10-20" }) });
    expect(statusWrites()[0].settle_by).toBe("2026-11-03");
  });

  it("never stores a full account number", async () => {
    scriptHappy();
    await payout();
    expect(JSON.stringify(inserted())).not.toContain("9999");
  });

  it("refuses anything but the approved amount", async () => {
    script("reimbursement_advance_transfers", { data: [] });
    const result = await payout({ amountVnd: 7_999_999 });
    expect(result.ok === false && result.error).toContain("₫8,000,000");
    expect(inserted()).toEqual([]);
  });

  it("lets the approver record it when the owner is the only other payer, because nobody else can", async () => {
    payers.ids = ["person-d", "person-a"];
    scriptHappy();
    expect(await payout({ actor: { ...payer, personId: "person-d" } })).toEqual({ ok: true });
    expect(inserted()[0]).toMatchObject({ recorded_by: "person-d" });
    payers.ids = ["person-t", "person-d"];
  });

  it("keeps whoever approved it from recording it, before anything is written", async () => {
    script("reimbursement_advance_transfers", { data: [] });
    const result = await payout({ actor: { ...payer, personId: "person-d" } });
    expect(result.ok === false && result.error).toContain("someone else");
    expect(inserted()).toEqual([]);
  });

  it("is Finance's alone", async () => {
    expect((await payout({ actor: { ...payer, kind: "approver" } })).ok).toBe(false);
    expect(calls).toEqual([]);
  });

  it("refuses a transfer dated in the future", async () => {
    script("reimbursement_advance_transfers", { data: [] });
    expect((await payout({ transferredOn: "2999-01-01" })).ok).toBe(false);
    expect(inserted()).toEqual([]);
  });

  it("refuses a receipt that did not finish uploading", async () => {
    script("reimbursement_advance_transfers", { data: [] });
    script("reimbursement_advance_files", { data: null });
    const result = await payout();
    expect(result.ok === false && result.error).toContain("did not finish uploading");
    expect(inserted()).toEqual([]);
  });

  it("stops the payout when the calendar cannot be read, rather than counting without it", async () => {
    script("reimbursement_advance_transfers", { data: [] });
    calendar.fail = true;
    const result = await payout();
    expect(result.ok === false && result.error).toContain("holiday calendar");
    expect(inserted()).toEqual([]);
  });

  it("stops the payout when the deadline reaches a year with no Tết", async () => {
    script("reimbursement_advance_transfers", { data: [] });
    calendar.rows = [{ date: "2025-01-27", name: "Tết Nguyên Đán" }];
    const result = await payout();
    expect(result.ok === false && result.error).toContain("calendar");
    expect(inserted()).toEqual([]);
  });

  it("refuses a first recording with no receipt, because the receipt is the only proof behind it", async () => {
    script("reimbursement_advance_transfers", { data: [] });
    const result = await payout({ receiptFileId: null });
    expect(result.ok === false && result.error).toContain("bank's receipt");
    expect(inserted()).toEqual([]);
  });

  it("refuses a payout with no bank details on file: the snapshot is the only record of where it went", async () => {
    script("reimbursement_advance_transfers", { data: [] });
    script("reimbursement_advance_files", { data: { id: "file-1" } });
    bankRead.answer = { ok: true, bank: null };
    const result = await payout();
    expect(result.ok === false && result.error).toContain("no bank details on file");
    expect(inserted()).toEqual([]);
  });

  it("stops when the bank read fails, rather than recording an empty snapshot", async () => {
    script("reimbursement_advance_transfers", { data: [] });
    script("reimbursement_advance_files", { data: { id: "file-1" } });
    bankRead.answer = { ok: false, error: "Could not read the bank details: down" };
    expect(await payout()).toEqual({ ok: false, error: "Could not read the bank details: down" });
    expect(inserted()).toEqual([]);
  });

  describe("a retry", () => {
    it("after a lost status write finds the row, writes no second one and lands the status", async () => {
      script("reimbursement_advance_transfers", { data: [{ direction: "out", amount_vnd: 8_000_000, transferred_on: "2026-10-14", request_key: KEY }] });
      script("reimbursement_advances", { data: [{ id: "advance-1" }] });
      script("reimbursement_advance_events", { data: { id: "event-1" } });
      expect(await payout()).toEqual({ ok: true });
      expect(inserted()).toEqual([]);
      expect(statusWrites()[0].status).toBe("paid_out");
    });

    it("needs no second receipt, and its deadline comes from the row: a retry days later must not move it", async () => {
      script("reimbursement_advance_transfers", { data: [{ direction: "out", amount_vnd: 8_000_000, transferred_on: "2026-10-14", request_key: "the-first-try" }] });
      script("reimbursement_advances", { data: [{ id: "advance-1" }] });
      script("reimbursement_advance_events", { data: { id: "event-1" } });
      expect(await payout({ receiptFileId: null, transferredOn: "2026-10-20" })).toEqual({ ok: true });
      expect(statusWrites()[0]).toMatchObject({ status: "paid_out", settle_by: "2026-10-28" });
    });

    it("that already landed answers ok and writes nothing", async () => {
      script("reimbursement_advance_transfers", { data: [{ direction: "out", amount_vnd: 8_000_000, request_key: KEY }] });
      expect(await payout({ row: row("paid_out") })).toEqual({ ok: true });
      expect(inserted()).toEqual([]);
      expect(statusWrites()).toEqual([]);
    });

    it("with a different key is someone recording it twice, and is refused", async () => {
      script("reimbursement_advance_transfers", { data: [{ direction: "out", amount_vnd: 8_000_000, request_key: "another" }] });
      expect(await payout({ row: row("paid_out") })).toEqual({ ok: false, error: "This transfer is already recorded." });
      expect(inserted()).toEqual([]);
    });

    it("when two people press at once, the other's row stands and the status is all that is left", async () => {
      script("reimbursement_advance_transfers", { data: [] }, { data: null, error: { message: "duplicate", code: "23505" } as never }, { data: [{ direction: "out", amount_vnd: 8_000_000, transferred_on: "2026-10-14", request_key: "another" }] });
      script("reimbursement_advance_files", { data: { id: "file-1" } });
      script("reimbursement_advances", { data: [{ id: "advance-1" }] });
      script("reimbursement_advance_events", { data: { id: "event-1" } });
      // This person typed a later date; the row that won is what the bank showed.
      expect(await payout({ transferredOn: "2026-10-20" })).toEqual({ ok: true });
      expect(statusWrites()[0]).toMatchObject({ status: "paid_out", settle_by: "2026-10-28" });
    });

    it("whose insert failed with nothing on the ledger does not move the status", async () => {
      script("reimbursement_advance_transfers", { data: [] }, { data: null, error: { message: "refused", code: "P0R02" } as never }, { data: [] });
      script("reimbursement_advance_files", { data: { id: "file-1" } });
      expect((await payout()).ok).toBe(false);
      expect(statusWrites()).toEqual([]);
    });
  });
});

describe("recordReturn", () => {
  const owing = row("to_return", { balanceVnd: -640_000 });
  const back = (over: Partial<Parameters<typeof recordReturn>[0]> = {}) =>
    recordReturn({ row: owing, amountVnd: 400_000, transferredOn: "2026-10-20", requestKey: KEY, actor: payer, ...over });
  const OUT = { direction: "out", amount_vnd: 8_000_000, request_key: "payout" };

  it("records a part, and stays open with what is still owed", async () => {
    script("reimbursement_advance_transfers", { data: [OUT] }, { data: null });
    script("reimbursement_advances", { data: [{ id: "advance-1" }] });
    script("reimbursement_advance_events", { data: { id: "event-1" } });
    expect(await back()).toEqual({ ok: true });
    expect(inserted()[0]).toMatchObject({ direction: "in", amount_vnd: 400_000, request_key: KEY });
    expect(statusWrites()[0]).toEqual({ status: "to_return" });
    expect(told).toEqual(["return"]);
  });

  it("settles on the return that clears it", async () => {
    script("reimbursement_advance_transfers", { data: [OUT, { direction: "in", amount_vnd: 400_000, request_key: "earlier" }] }, { data: null });
    script("reimbursement_advances", { data: [{ id: "advance-1" }] });
    script("reimbursement_advance_events", { data: { id: "event-1" } });
    expect(await back({ amountVnd: 240_000 })).toEqual({ ok: true });
    expect(statusWrites()[0]).toMatchObject({ status: "settled" });
  });

  it("does not wait for the person to say they sent it: the bank is the truth", async () => {
    script("reimbursement_advance_transfers", { data: [OUT] }, { data: null });
    script("reimbursement_advances", { data: [{ id: "advance-1" }] });
    script("reimbursement_advance_events", { data: { id: "event-1" } });
    expect((await back()).ok).toBe(true);
  });

  it("refuses more than is still owed, and says how much that is", async () => {
    script("reimbursement_advance_transfers", { data: [OUT, { direction: "in", amount_vnd: 400_000, request_key: "earlier" }] });
    const result = await back({ amountVnd: 240_001 });
    expect(result.ok === false && result.error).toContain("₫240,000");
    expect(inserted()).toEqual([]);
  });

  it("refuses a zero, a fraction and a future date", async () => {
    for (const change of [{ amountVnd: 0 }, { amountVnd: 1.5 }, { transferredOn: "2999-01-01" }]) {
      script("reimbursement_advance_transfers", { data: [OUT] });
      expect((await back(change)).ok).toBe(false);
    }
    expect(inserted()).toEqual([]);
  });

  it("refuses when nothing is owed, or when the balance is missing", async () => {
    script("reimbursement_advance_transfers", { data: [OUT] });
    expect((await back({ row: row("paid_out") })).ok).toBe(false);
    script("reimbursement_advance_transfers", { data: [OUT] });
    expect((await back({ row: row("to_return", { balanceVnd: null }) })).ok).toBe(false);
    expect(inserted()).toEqual([]);
  });

  it("refuses a receipt another transfer already stands on", async () => {
    script("reimbursement_advance_transfers", { data: [{ ...OUT, bank_receipt_file_id: "file-1" }] });
    const result = await back({ receiptFileId: "file-1" });
    expect(result.ok === false && result.error).toContain("already on another transfer");
    expect(inserted()).toEqual([]);
  });

  it("takes a return's own finished receipt", async () => {
    script("reimbursement_advance_transfers", { data: [{ ...OUT, bank_receipt_file_id: "file-1" }] }, { data: null });
    script("reimbursement_advance_files", { data: { id: "file-2" } });
    script("reimbursement_advances", { data: [{ id: "advance-1" }] });
    script("reimbursement_advance_events", { data: { id: "event-1" } });
    expect(await back({ receiptFileId: "file-2" })).toEqual({ ok: true });
    expect(inserted()[0].bank_receipt_file_id).toBe("file-2");
  });

  it("is Finance's alone", async () => {
    expect((await back({ actor: { ...payer, kind: "owner" } })).ok).toBe(false);
    expect(calls).toEqual([]);
  });

  describe("a retry", () => {
    it("of a part already recorded writes nothing: no second row, no second email", async () => {
      script("reimbursement_advance_transfers", { data: [OUT, { direction: "in", amount_vnd: 400_000, request_key: KEY }] });
      expect(await back()).toEqual({ ok: true });
      expect(inserted()).toEqual([]);
      expect(statusWrites()).toEqual([]);
      expect(told).toEqual([]);
    });

    it("after the last return lost its status write lands the settlement", async () => {
      script("reimbursement_advance_transfers", { data: [OUT, { direction: "in", amount_vnd: 640_000, request_key: KEY }] });
      script("reimbursement_advances", { data: [{ id: "advance-1" }] });
      script("reimbursement_advance_events", { data: { id: "event-1" } });
      expect(await back({ amountVnd: 640_000 })).toEqual({ ok: true });
      expect(inserted()).toEqual([]);
      expect(statusWrites()[0]).toMatchObject({ status: "settled" });
    });

    it("that already landed answers ok", async () => {
      script("reimbursement_advance_transfers", { data: [OUT, { direction: "in", amount_vnd: 640_000, request_key: KEY }] });
      expect(await back({ row: row("settled", { balanceVnd: -640_000 }) })).toEqual({ ok: true });
      expect(statusWrites()).toEqual([]);
    });

    it("with a new key, once all of it is back, settles rather than recording more", async () => {
      script("reimbursement_advance_transfers", { data: [OUT, { direction: "in", amount_vnd: 640_000, request_key: "earlier" }] });
      script("reimbursement_advances", { data: [{ id: "advance-1" }] });
      script("reimbursement_advance_events", { data: { id: "event-1" } });
      expect(await back()).toEqual({ ok: true });
      expect(inserted()).toEqual([]);
      expect(statusWrites()[0]).toMatchObject({ status: "settled" });
    });
  });

  it("when the guard refuses another person's race, says to check, and moves nothing", async () => {
    script("reimbursement_advance_transfers", { data: [OUT] }, { data: null, error: { message: "over", code: "P0R02" } as never }, { data: [OUT, { direction: "in", amount_vnd: 640_000, request_key: "theirs" }] });
    const result = await back();
    expect(result.ok === false && result.error).toContain("Someone else");
    expect(statusWrites()).toEqual([]);
  });
});

describe("who may record money, and when it moved", () => {
  const OUT = { direction: "out", amount_vnd: 8_000_000, transferred_on: "2026-10-14", request_key: "payout" };
  const owing = row("to_return", { balanceVnd: -640_000 });
  const own = { ...payer, personId: "person-a" };

  it("refuses a payer recording the payout of their own advance", async () => {
    script("reimbursement_advance_transfers", { data: [] });
    const result = await recordPayout({ row: row("approved"), amountVnd: 8_000_000, transferredOn: "2026-10-14", requestKey: KEY, receiptFileId: "file-1", actor: own });
    expect(result.ok === false && result.error).toContain("your own advance");
    expect(inserted()).toEqual([]);
  });

  it("refuses a payer recording money back on their own advance, before reading anything", async () => {
    const result = await recordReturn({ row: owing, amountVnd: 640_000, transferredOn: "2026-10-20", requestKey: KEY, actor: own });
    expect(result.ok === false && result.error).toContain("your own advance");
    expect(calls).toEqual([]);
  });

  it("refuses a payout dated before the request existed, in Saigon's calendar", async () => {
    // 18:00 UTC on the 2nd is already the 3rd in Saigon, so the 2nd is too early and the 3rd is not.
    const asked = row("approved", { submittedAt: "2026-10-02T18:00:00Z" });
    script("reimbursement_advance_transfers", { data: [] });
    const result = await recordPayout({ row: asked, amountVnd: 8_000_000, transferredOn: "2026-10-02", requestKey: KEY, receiptFileId: "file-1", actor: payer });
    expect(result.ok === false && result.error).toContain("the day it was asked for");
    expect(inserted()).toEqual([]);
  });

  it("refuses a return dated before the payout", async () => {
    script("reimbursement_advance_transfers", { data: [OUT] });
    const result = await recordReturn({ row: owing, amountVnd: 400_000, transferredOn: "2026-10-13", requestKey: KEY, actor: payer });
    expect(result.ok === false && result.error).toContain("the payout");
    expect(inserted()).toEqual([]);
  });

  it("takes a return dated the same day as the payout", async () => {
    script("reimbursement_advance_transfers", { data: [OUT] }, { data: null });
    script("reimbursement_advances", { data: [{ id: "advance-1" }] });
    script("reimbursement_advance_events", { data: { id: "event-1" } });
    expect((await recordReturn({ row: owing, amountVnd: 400_000, transferredOn: "2026-10-14", requestKey: KEY, actor: payer })).ok).toBe(true);
  });
});

describe("reportReturnSent", () => {
  const owner: AdvanceActor = { kind: "owner", personId: "person-a", mayDecideOwn: false };
  const owing = row("to_return", { balanceVnd: -640_000 });

  it("stamps the advance and tells the payers, and touches no ledger", async () => {
    script("reimbursement_advances", { data: { metadata: { kept: 1 } } }, { data: [{ id: "advance-1" }] });
    script("reimbursement_advance_transfers", { data: [{ direction: "out", amount_vnd: 8_000_000, request_key: "payout" }, { direction: "in", amount_vnd: 400_000, request_key: "part" }] });
    expect(await reportReturnSent({ row: owing, actor: owner })).toEqual({ ok: true });
    // How much had arrived when they said it, so the next transfer can answer it.
    expect(statusWrites()[0].metadata).toMatchObject({ kept: 1, returnReportedAt: expect.any(String), returnReportedAtVnd: 400_000 });
    expect(statusWrites()[0].status).toBeUndefined();
    expect(inserted()).toEqual([]);
    expect(told).toEqual(["reported"]);
  });

  it("reads as not found to anyone but the owner, and refuses when nothing is owed", async () => {
    expect(await reportReturnSent({ row: owing, actor: { ...owner, personId: "someone" } })).toEqual({ ok: false, error: "Advance not found." });
    expect((await reportReturnSent({ row: row("paid_out"), actor: owner })).ok).toBe(false);
    expect(calls).toEqual([]);
  });
});
