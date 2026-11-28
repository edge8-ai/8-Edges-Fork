import { beforeEach, describe, expect, it, vi } from "vitest";

// Finance's actions: the guard comes first in every one, the browser cannot name a file
// kind or who is recording, and a malformed input never reaches the ledger.
const asked = vi.hoisted(() => [] as string[]);
const viewer = vi.hoisted(() => ({ personId: "person-t" as string | null }));
vi.mock("@/kernel/identity/access-request", () => ({
  requirePermission: async (p: string) => {
    asked.push(p);
    return { personId: viewer.personId, user: { email: "payer@test" }, may: () => false };
  },
}));
const refreshed = vi.hoisted(() => [] as string[]);
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => void refreshed.push(p) }));
const lib = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  payouts: [] as Record<string, unknown>[],
  returns: [] as Record<string, unknown>[],
  reinstated: [] as Record<string, unknown>[],
  uploads: [] as Record<string, unknown>[],
  signed: [] as Record<string, unknown>[],
  answer: { ok: true } as { ok: true } | { ok: false; error: string },
}));
vi.mock("@/entities/reimbursements/lib/advance-lifecycle", () => ({ readAdvanceRow: async () => lib.row }));
vi.mock("@/entities/reimbursements/lib/advance-ledger", () => ({
  recordPayout: async (i: Record<string, unknown>) => (lib.payouts.push(i), lib.answer),
  recordReturn: async (i: Record<string, unknown>) => (lib.returns.push(i), lib.answer),
}));
vi.mock("@/entities/reimbursements/lib/advance-reinstate", () => ({
  reinstateAdvance: async (i: Record<string, unknown>) => (lib.reinstated.push(i), lib.answer),
}));
vi.mock("@/entities/reimbursements/lib/advance-files", () => ({
  startAdvanceUpload: async (i: Record<string, unknown>) => (lib.uploads.push(i), { ok: true, fileId: "f", bucket: "b", path: "p", token: "t" }),
  confirmAdvanceUpload: async (i: Record<string, unknown>) => (lib.uploads.push(i), { ok: true }),
  cancelAdvanceUpload: async (i: Record<string, unknown>) => (lib.uploads.push(i), { ok: true }),
  signAdvanceFile: async (i: Record<string, unknown>) => (lib.signed.push(i), { ok: true, url: "https://signed" }),
}));

import { cancelBankReceipt, confirmBankReceipt, openAdvanceFileToPay, payOutAdvance, recordAdvanceReturn, startBankReceipt, reinstateCancelledAdvance } from "./actions";

const ID = "22222222-2222-4222-8222-222222222222";
const FILE = "33333333-3333-4333-8333-333333333333";
const KEY = "44444444-4444-4444-8444-444444444444";
const payout = { amountVnd: 8_000_000, transferredOn: "2026-11-05", requestKey: KEY, receiptFileId: FILE };
const back = { amountVnd: 400_000, transferredOn: "2026-11-05", requestKey: KEY, receiptFileId: null };
const declared = { name: "bank.pdf", size: 10, type: "application/pdf" };

beforeEach(() => {
  asked.length = 0;
  refreshed.length = 0;
  lib.payouts.length = 0;
  lib.returns.length = 0;
  lib.reinstated.length = 0;
  lib.uploads.length = 0;
  lib.signed.length = 0;
  lib.answer = { ok: true };
  lib.row = { id: ID, status: "approved", personId: "person-a" };
  viewer.personId = "person-t";
});

describe("reinstateCancelledAdvance", () => {
  it("hands the lib a payer named by the guard and the trimmed reason, and refreshes on success", async () => {
    expect(await reinstateCancelledAdvance(ID, "  It went at 09:40.  ")).toEqual({ ok: true });
    expect(lib.reinstated[0]).toMatchObject({ reason: "It went at 09:40.", actor: { kind: "payer", personId: "person-t" } });
    expect(refreshed.length).toBeGreaterThan(0);
  });

  it("refuses an empty reason and someone with no person record", async () => {
    expect((await reinstateCancelledAdvance(ID, "   ")).ok).toBe(false);
    viewer.personId = null;
    expect((await reinstateCancelledAdvance(ID, "It went.")).ok).toBe(false);
    expect(lib.reinstated).toEqual([]);
  });

  it("says not found for an id that is not one", async () => {
    expect(await reinstateCancelledAdvance("nope", "It went.")).toEqual({ ok: false, error: "Advance not found." });
  });
});

describe("startBankReceipt", () => {
  it("refuses a receipt on the payer's own advance, because the next payer would be offered it", async () => {
    lib.row = { id: ID, status: "approved", personId: "person-t" };
    const started = await startBankReceipt(ID, declared);
    expect(started.ok === false && started.error).toContain("your own advance");
  });
});

describe("every action", () => {
  it.each([
    ["payout", () => payOutAdvance(ID, payout)],
    ["return", () => recordAdvanceReturn(ID, back)],
    ["reinstate", () => reinstateCancelledAdvance(ID, "It went.")],
    ["start", () => startBankReceipt(ID, declared)],
    ["confirm", () => confirmBankReceipt(ID, FILE)],
    ["cancel", () => cancelBankReceipt(ID, FILE)],
    ["open", () => openAdvanceFileToPay(ID, FILE)],
  ])("%s asks for reimbursements.pay first", async (_name, act) => {
    await act();
    expect(asked[0]).toBe("reimbursements.pay");
  });

  it.each([
    ["payout", () => payOutAdvance("nope", payout)],
    ["return", () => recordAdvanceReturn("nope", back)],
    ["start", () => startBankReceipt("nope", declared)],
    ["confirm", () => confirmBankReceipt("nope", FILE)],
    ["cancel", () => cancelBankReceipt("nope", FILE)],
    ["open", () => openAdvanceFileToPay("nope", FILE)],
  ])("%s refuses an id that could not be one", async (_name, act) => {
    expect((await act()).ok).toBe(false);
    expect([...lib.payouts, ...lib.returns, ...lib.uploads, ...lib.signed]).toHaveLength(0);
  });
});

describe("payOutAdvance", () => {
  it("hands the ledger the row and a payer named by the guard, never by the browser", async () => {
    expect(await payOutAdvance(ID, payout)).toEqual({ ok: true });
    expect(lib.payouts[0]).toMatchObject({ row: lib.row, amountVnd: 8_000_000, requestKey: KEY, receiptFileId: FILE, actor: { kind: "payer", personId: "person-t", mayDecideOwn: false, label: "payer@test" } });
    expect(refreshed).toEqual(expect.arrayContaining(["/team/finance/advances", `/team/finance/advances/${ID}`, `/team/claims/advances/${ID}`]));
  });

  it("refuses someone with no person record, because the ledger names who recorded it", async () => {
    viewer.personId = null;
    expect(await payOutAdvance(ID, payout)).toMatchObject({ ok: false, error: expect.stringMatching(/no person record/) });
    expect(lib.payouts).toHaveLength(0);
  });

  it.each([
    ["a fraction of a dong", { amountVnd: 1.5 }],
    ["a negative amount", { amountVnd: -1 }],
    ["a string for an amount", { amountVnd: "8000000" }],
    ["a receipt that is not an id", { receiptFileId: "../other" }],
    ["a key that is not an id", { requestKey: "again" }],
  ])("refuses %s before the ledger hears of it", async (_name, over) => {
    expect((await payOutAdvance(ID, { ...payout, ...over } as unknown as typeof payout)).ok).toBe(false);
    expect(lib.payouts).toHaveLength(0);
  });

  it("answers not found for a missing advance", async () => {
    lib.row = null;
    expect(await payOutAdvance(ID, payout)).toEqual({ ok: false, error: "Advance not found." });
  });

  it("refreshes nothing when the ledger refused", async () => {
    lib.answer = { ok: false, error: "No." };
    expect(await payOutAdvance(ID, payout)).toEqual({ ok: false, error: "No." });
    expect(refreshed).toHaveLength(0);
  });
});

describe("recordAdvanceReturn", () => {
  it("takes a return with no receipt, since one is optional", async () => {
    expect(await recordAdvanceReturn(ID, back)).toEqual({ ok: true });
    expect(lib.returns[0]).toMatchObject({ amountVnd: 400_000, receiptFileId: null, actor: { kind: "payer", personId: "person-t" } });
  });

  it("lets zero through to the ledger, which alone knows whether there is anything to finish", async () => {
    await recordAdvanceReturn(ID, { ...back, amountVnd: 0 });
    expect(lib.returns[0]).toMatchObject({ amountVnd: 0 });
  });

  it("takes a return with one", async () => {
    await recordAdvanceReturn(ID, { ...back, receiptFileId: FILE });
    expect(lib.returns[0]).toMatchObject({ receiptFileId: FILE });
  });

  it("refuses an amount that is not whole VND", async () => {
    expect((await recordAdvanceReturn(ID, { ...back, amountVnd: 0.5 })).ok).toBe(false);
    expect(lib.returns).toHaveLength(0);
  });

  it("refuses someone with no person record", async () => {
    viewer.personId = null;
    expect((await recordAdvanceReturn(ID, back)).ok).toBe(false);
    expect(lib.returns).toHaveLength(0);
  });
});

describe("startBankReceipt", () => {
  it("can only start a bank receipt, whatever the browser sends, under the signed-in person's name", async () => {
    await startBankReceipt(ID, { ...declared, kind: "evidence" } as typeof declared);
    expect(lib.uploads[0]).toMatchObject({ kind: "bank_receipt", personId: "person-t", advance: { id: ID, status: "approved" } });
  });
});

describe("confirming and cancelling an upload", () => {
  it("reaches only a bank receipt: Finance cannot finish or drop an owner's evidence", async () => {
    await confirmBankReceipt(ID, FILE);
    await cancelBankReceipt(ID, FILE);
    expect(lib.uploads).toEqual([{ advanceId: ID, fileId: FILE, onlyKind: "bank_receipt" }, { advanceId: ID, fileId: FILE, onlyKind: "bank_receipt" }]);
  });
});

describe("openAdvanceFileToPay", () => {
  it("signs any file on the advance, since a bank receipt is Finance's own", async () => {
    expect(await openAdvanceFileToPay(ID, FILE)).toEqual({ ok: true, url: "https://signed" });
    expect(lib.signed).toEqual([{ advanceId: ID, fileId: FILE }]);
  });
});
