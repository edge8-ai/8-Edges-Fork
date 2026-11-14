import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// RB.26: a dropped file the AI reads as the bank's record of a payment becomes
// a lone bank deduction, for its owner to join to its receipt. Driven on the
// kernel's fake.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const audits: Record<string, unknown>[] = [];
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: async (a: Record<string, unknown>) => void audits.push(a) }));

const { fileAsLoneDeduction, isDongDeduction, justRead } = await import("./lone-deduction");

const CLAIM = "11111111-1111-4111-8111-111111111111";
const ITEM = "22222222-2222-4222-8222-222222222222";
const FILE = "33333333-3333-4333-8333-333333333333";
const bank = { is_bank_deduction: true, amount_minor: 2937648, currency: "VND", bought_on: "2026-11-06", seller: "ANTHROPIC* CLAUDE SUB" };

const fileUpdate = () => calls.find((c) => c.table === "reimbursement_files" && c.ops[0] === "update");
const itemUpdate = () => calls.find((c) => c.table === "reimbursement_claim_items" && c.ops[0] === "update");

beforeEach(() => {
  resetFake();
  audits.length = 0;
});

describe("isDongDeduction", () => {
  it("is the bank's record of a payment in dong with an amount", () => {
    expect(isDongDeduction(bank)).toBe(true);
  });

  it("is not a receipt, a deduction in another currency, or one with no amount", () => {
    expect(isDongDeduction({ ...bank, is_bank_deduction: false })).toBe(false);
    expect(isDongDeduction({ ...bank, currency: "USD" })).toBe(false);
    expect(isDongDeduction({ ...bank, amount_minor: null })).toBe(false);
    expect(isDongDeduction({ ...bank, amount_minor: 0 })).toBe(false);
  });
});

describe("fileAsLoneDeduction", () => {
  const dropped = justRead(FILE, { id: ITEM, seller: null, bought_on: null, amount_cents: 0 }, CLAIM, bank);

  it("refiles a dropped file as a bank deduction and values its row at the dong the bank took", async () => {
    script("reimbursement_files", { data: [] }, { data: [{ id: FILE, kind: "bank_deduction" }] });
    script("reimbursement_claim_items", { data: [{ id: ITEM }] });
    expect(await fileAsLoneDeduction(dropped)).toEqual({ ok: true });

    expect(fileUpdate()?.payloads[0]).toEqual({ kind: "bank_deduction" });
    expect(fileUpdate()?.filters).toEqual(expect.arrayContaining([["eq", "id", FILE], ["eq", "claim_item_id", ITEM]]));
    expect(itemUpdate()?.payloads[0]).toMatchObject({
      seller: "ANTHROPIC* CLAUDE SUB",
      bought_on: "2026-11-06",
      amount_cents: 2937648,
      currency: "vnd",
      amount_vnd: 2937648,
      charged_vnd: null,
      ai_flags: [],
      duplicate_of_item_id: null,
    });
    expect(itemUpdate()?.filters).toEqual(expect.arrayContaining([["eq", "id", ITEM], ["eq", "claim_id", CLAIM]]));
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ table: "reimbursement_files", recordId: FILE, newData: { kind: "bank_deduction" } });
  });

  it("keeps a seller, a date and an amount the row already has", async () => {
    script("reimbursement_files", { data: [] }, { data: [] });
    script("reimbursement_claim_items", { data: [{ id: ITEM }] });
    const unjoined = justRead(FILE, { id: ITEM, seller: "Anthropic card payment", bought_on: "2026-11-07", amount_cents: 2900000 }, CLAIM, bank);
    expect(await fileAsLoneDeduction(unjoined)).toEqual({ ok: true });
    expect(itemUpdate()?.payloads[0]).toMatchObject({ seller: "Anthropic card payment", bought_on: "2026-11-07", amount_cents: 2900000, amount_vnd: 2900000 });
    // Already a bank deduction: nothing was refiled, so nothing is audited.
    expect(audits).toHaveLength(0);
  });

  it("leaves a file on a receipt with other documents as it was read", async () => {
    script("reimbursement_files", { data: [{ id: "another" }] });
    expect(await fileAsLoneDeduction(dropped)).toBeNull();
    expect(fileUpdate()).toBeUndefined();
    expect(itemUpdate()).toBeUndefined();
  });

  it("counts a joined bank deduction as another document, so a receipt beside it is never refiled as a second one", async () => {
    script("reimbursement_files", { data: [{ id: "joined-deduction" }] });
    expect(await fileAsLoneDeduction(dropped)).toBeNull();
    const others = calls.find((c) => c.table === "reimbursement_files" && c.ops[0] === "select");
    expect(others?.filters).not.toContainEqual(["neq", "kind", "bank_deduction"]);
    expect(fileUpdate()).toBeUndefined();
  });

  it("says when the documents could not be read, and writes nothing", async () => {
    script("reimbursement_files", { error: { message: "boom" } });
    expect(await fileAsLoneDeduction(dropped)).toEqual({ ok: false, error: "Could not read the receipt's documents: boom" });
    expect(itemUpdate()).toBeUndefined();
  });
});
