import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// RB.26: a photo read before the reader knew bank deductions is read again
// once, so a bank screenshot read as a dong receipt can become a lone
// deduction its owner joins. Driven on the kernel's fake; the reader is stubbed.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const readReceipt = vi.hoisted(() => vi.fn());
vi.mock("./receipt-reading", () => ({ readReceipt }));

const { rereadBeforeDeductions } = await import("./old-readings");

const CLAIM = "11111111-1111-4111-8111-111111111111";
const photo = (id: string, item: string, over: Record<string, unknown> = {}) => ({ id, claim_item_id: item, kind: "receipt", mime_type: "image/jpeg", ...over });

beforeEach(() => {
  resetFake();
  readReceipt.mockReset().mockResolvedValue({ ok: true, reading: null, flags: [] });
});

describe("rereadBeforeDeductions", () => {
  it("asks only for open rows whose stored reading predates is_bank_deduction", async () => {
    script("reimbursement_claim_items", { data: [] });
    await rereadBeforeDeductions(CLAIM);
    const read = calls.find((c) => c.table === "reimbursement_claim_items");
    expect(read?.filters).toEqual(
      expect.arrayContaining([
        ["eq", "claim_id", CLAIM],
        ["is", "removed_at", null],
        ["not", "ai_reading", "is", null],
        ["is", "ai_reading->>is_bank_deduction", null],
      ]),
    );
    expect(readReceipt).not.toHaveBeenCalled();
  });

  it("reads again a row whose one document is a photo filed as a receipt, and no other", async () => {
    script("reimbursement_claim_items", { data: [{ id: "photo-row" }, { id: "pdf-row" }, { id: "two-files" }] });
    script("reimbursement_files", {
      data: [photo("p1", "photo-row"), photo("p2", "pdf-row", { mime_type: "application/pdf" }), photo("p3", "two-files"), photo("p4", "two-files", { kind: "red_invoice" })],
    });
    await rereadBeforeDeductions(CLAIM);
    // The one-time pass is a first read, so it may file a bank deduction; a re-read elsewhere never does.
    expect(readReceipt.mock.calls).toEqual([["p1", { fileDeductions: true }]]);
  });

  it("reads nothing when the receipts cannot be read, and says so in the log", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    script("reimbursement_claim_items", { error: { message: "boom" } });
    await rereadBeforeDeductions(CLAIM);
    expect(readReceipt).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
