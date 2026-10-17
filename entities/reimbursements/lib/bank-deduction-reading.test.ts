import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script, scriptStorage } from "@/kernel/data/testing/fake-company-os";
import { fakeJsonMessage } from "@/kernel/ai/testing/fake-message";

// RB.20: a purchase abroad on a Vietnamese card is paid back at what the bank
// deducted. The AI reads the bank deduction for its dong figure and fills the
// deducted amount when the owner has not typed one; that amount is the
// receipt's value, and the original receipt's amount stays as its reference.
// The reading never touches the receipt's own reading or warnings.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const create = vi.hoisted(() => vi.fn());
vi.mock("@/kernel/ai/client", () => ({ anthropicIfConfigured: () => ({ messages: { create } }) }));
vi.mock("@/kernel/ai/calls", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/kernel/ai/calls")>()),
  recordAiCall: async () => {},
}));

import { deductionToFill, readBankDeduction } from "./bank-deduction-reading";
import type { ReceiptReadingType } from "./receipt-reading";

const reading = (over: Partial<ReceiptReadingType> = {}): ReceiptReadingType => ({
  amount_minor: 2982634,
  currency: "VND",
  bought_on: "2026-10-06",
  seller: "ANTHROPIC* CLAUDE SUB",
  category: "software",
  is_red_invoice: false,
  buyer_name: null,
  buyer_tax_code: null,
  confidence: "high",
  notes: null,
  ...over,
});
const ITEM = { currency: "usd", amount_cents: 11111, charged_vnd: null };

describe("deductionToFill", () => {
  it("takes the dong figure for a receipt in another currency with no deducted amount yet", () => {
    expect(deductionToFill(reading(), ITEM, true)).toBe(2982634);
  });

  it("never overwrites what the owner typed, nor fills a claim that is no longer theirs", () => {
    expect(deductionToFill(reading(), { ...ITEM, charged_vnd: 2900000 }, true)).toBeNull();
    expect(deductionToFill(reading(), ITEM, false)).toBeNull();
  });

  it("fills nothing it cannot stand behind: a figure not in dong, none at all, or a dong receipt", () => {
    expect(deductionToFill(reading({ currency: "USD", amount_minor: 11111 }), ITEM, true)).toBeNull();
    expect(deductionToFill(reading({ amount_minor: null }), ITEM, true)).toBeNull();
    expect(deductionToFill(null, ITEM, true)).toBeNull();
    expect(deductionToFill(reading(), { ...ITEM, currency: "vnd" }, true)).toBeNull();
  });

  it("waits for the receipt's own amount, which the value is worked out against", () => {
    expect(deductionToFill(reading(), { ...ITEM, amount_cents: 0 }, true)).toBeNull();
  });
});

describe("readBankDeduction", () => {
  const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
  const file = (over: { status?: string; charged_vnd?: number | null } = {}) => ({
    data: {
      id: "file-2",
      kind: "bank_deduction",
      storage_path: "claim/claim-1/item-1/file-2-IMG_5854.jpeg",
      mime_type: "image/jpeg",
      claim_item_id: "item-1",
      reimbursement_claim_items: {
        id: "item-1",
        amount_cents: 11111,
        currency: "usd",
        charged_vnd: over.charged_vnd ?? null,
        reimbursement_claims: { id: "claim-1", status: over.status ?? "draft", person_id: "person-a", title: "Claude Max", submitted_at: null },
      },
    },
  });
  const itemWrite = () => calls.find((c) => c.table === "reimbursement_claim_items" && c.ops[0] === "update");

  beforeEach(() => {
    resetFake();
    create.mockReset();
  });

  it("fills the deducted amount and values the receipt at it, guarded on nobody having typed one meanwhile", async () => {
    script("reimbursement_files", file());
    scriptStorage("download", { data: new Blob([JPEG]) });
    script("reimbursement_claim_items", { data: [{ id: "item-1" }] });
    create.mockResolvedValue(fakeJsonMessage(reading()));
    expect(await readBankDeduction("file-2")).toEqual({ ok: true, deductedVnd: 2982634, filled: true });
    const write = itemWrite();
    expect(write?.payloads[0]).toEqual({ amount_vnd: 2982634, fx_rate: 26843.97444, fx_source: "card", fx_as_of: null, charged_vnd: 2982634 });
    expect(write?.filters).toEqual(expect.arrayContaining([["eq", "id", "item-1"], ["is", "charged_vnd", null]]));
    // The screenshot goes to the model as an image, and only a bank deduction is read here.
    expect(create.mock.calls[0][0].messages[0].content[0]).toMatchObject({ type: "image", source: { media_type: "image/jpeg" } });
    expect(calls.find((c) => c.table === "reimbursement_files")?.filters).toEqual(expect.arrayContaining([["eq", "kind", "bank_deduction"]]));
  });

  it("reads but writes nothing when the owner already typed the deducted amount", async () => {
    script("reimbursement_files", file({ charged_vnd: 2900000 }));
    scriptStorage("download", { data: new Blob([JPEG]) });
    create.mockResolvedValue(fakeJsonMessage(reading()));
    expect(await readBankDeduction("file-2")).toEqual({ ok: true, deductedVnd: 2982634, filled: false });
    expect(itemWrite()).toBeUndefined();
  });

  it("writes nothing on a claim that is no longer its owner's to change", async () => {
    script("reimbursement_files", file({ status: "submitted" }));
    scriptStorage("download", { data: new Blob([JPEG]) });
    create.mockResolvedValue(fakeJsonMessage(reading()));
    expect(await readBankDeduction("file-2")).toEqual({ ok: true, deductedVnd: 2982634, filled: false });
    expect(itemWrite()).toBeUndefined();
  });

  it("writes nothing when the model fails, so the owner can still type the amount", async () => {
    script("reimbursement_files", file());
    scriptStorage("download", { data: new Blob([JPEG]) });
    create.mockRejectedValue(new Error("overloaded"));
    expect(await readBankDeduction("file-2")).toEqual({ ok: false, error: "The bank deduction could not be read just now. Type the amount instead." });
    expect(itemWrite()).toBeUndefined();
  });
});
