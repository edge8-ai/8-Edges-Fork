import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// RB.26: the owner joins a bank deduction or a red invoice that came in on its
// own to the receipt it belongs to, and can take it off again. Join moves the
// file, values the receipt at what the bank took (a deduction) or has the red
// invoice read on it, and takes the emptied row off the way the claim takes a
// receipt off. Driven on the kernel's fake; the bank rate and the AI are stubbed.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const audits: Record<string, unknown>[] = [];
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: async (a: Record<string, unknown>) => void audits.push(a) }));
vi.mock("./vnd-rates", () => ({ fxRateTable: {}, rateFor: async () => ({ rate: 25805, source: "techcombank", asOf: "2026-11-05" }) }));
const readStoredDocument = vi.hoisted(() => vi.fn());
const readReceipt = vi.hoisted(() => vi.fn());
vi.mock("./receipt-reading", () => ({ readStoredDocument, readReceipt }));

const { joinLoneRow, unjoinDocument } = await import("./item-joining");

const CLAIM = "11111111-1111-4111-8111-111111111111";
const RECEIPT = "22222222-2222-4222-8222-222222222222";
const LONE = "44444444-4444-4444-8444-444444444444";
const NEW = "55555555-5555-4555-8555-555555555555";
const OWNER = "person-a";
const claim = (status = "draft", submitted_at: string | null = null) => ({ id: CLAIM, status, person_id: OWNER, title: "Claude November", submitted_at });
const own = (id: string, currency: string, c = claim()) => ({ id, removed_at: null, currency, reimbursement_claims: c });
const receiptRow = { id: RECEIPT, seller: "Anthropic, PBC", description: null, bought_on: "2026-11-05", amount_cents: 11111, currency: "usd", charged_vnd: null, removed_at: null };
const loneRow = { id: LONE, seller: "ANTHROPIC* CLAUDE SUB", description: "IMG_B695CE240FCB-1.jpeg", bought_on: "2026-11-06", amount_cents: 2937648, currency: "vnd", charged_vnd: null, removed_at: null };
const file = (id: string, kind: string, item: string) => ({ id, kind, claim_item_id: item, filename: `${id}.jpeg`, storage_path: `claim/${CLAIM}/${item}/${id}`, mime_type: "image/jpeg", replaced_at: null });

const updates = (table: string) => calls.filter((c) => c.table === table && c.ops[0] === "update");
const deleted = () => calls.some((c) => c.table === "reimbursement_claim_items" && c.ops[0] === "delete");

beforeEach(() => {
  resetFake();
  audits.length = 0;
  readStoredDocument.mockReset();
  readReceipt.mockReset().mockResolvedValue({ ok: true, reading: null, flags: [] });
});

describe("joining a bank deduction to its receipt", () => {
  function scriptJoin(c = claim()) {
    script(
      "reimbursement_claim_items",
      { data: own(LONE, "vnd", c) }, // the owner's gate on the lone row
      { data: [loneRow, receiptRow] }, // both rows as they are now
      { data: [{ id: RECEIPT }] }, // the receipt valued at what the bank took
    );
    script("reimbursement_files", { data: [file("ded", "bank_deduction", LONE), file("pdf", "receipt", RECEIPT)] }, { data: [{ id: "ded" }] });
  }

  it("moves the file onto the receipt, values it at what the bank took, and deletes the emptied row of a draft", async () => {
    scriptJoin();
    script("reimbursement_claim_items", { data: own(LONE, "vnd") }, { data: [{ id: LONE }] }); // removeClaimItem: its gate, its delete
    script("reimbursement_files", { data: [] }); // removeClaimItem: the row's remaining objects
    expect(await joinLoneRow({ personId: OWNER, loneItemId: LONE, receiptItemId: RECEIPT })).toEqual({ ok: true });

    const move = updates("reimbursement_files")[0];
    expect(move.payloads[0]).toEqual({ claim_item_id: RECEIPT });
    expect(move.filters).toEqual(expect.arrayContaining([["eq", "claim_item_id", LONE], ["eq", "kind", "bank_deduction"], ["is", "replaced_at", null]]));
    expect(updates("reimbursement_claim_items")[0].payloads[0]).toMatchObject({ amount_vnd: 2937648, charged_vnd: 2937648, fx_source: "card" });
    expect(deleted()).toBe(true);
    expect(audits[0]).toMatchObject({ recordId: RECEIPT, context: { move: "join_bank_deduction" } });
  });

  it("marks the emptied row removed, with why, on a claim that was submitted before", async () => {
    const sentBack = claim("sent_back", "2026-11-01T03:00:00Z");
    scriptJoin(sentBack);
    script("reimbursement_claim_items", { data: own(LONE, "vnd", sentBack) }, { data: [{ id: LONE }] }); // markClaimItemRemoved: its gate, its mark
    expect(await joinLoneRow({ personId: OWNER, loneItemId: LONE, receiptItemId: RECEIPT })).toEqual({ ok: true });
    expect(updates("reimbursement_claim_items")[1].payloads[0]).toMatchObject({ remove_reason: "Joined to Anthropic, PBC · Nov 5, 2026 as its bank deduction." });
    expect(deleted()).toBe(false);
  });

  it("says the file moved when the receipt could not then be valued, and has audited the move", async () => {
    script("reimbursement_claim_items", { data: own(LONE, "vnd") }, { data: [loneRow, receiptRow] }, { data: [] });
    script("reimbursement_files", { data: [file("ded", "bank_deduction", LONE), file("pdf", "receipt", RECEIPT)] }, { data: [{ id: "ded" }] });
    const answer = await joinLoneRow({ personId: OWNER, loneItemId: LONE, receiptItemId: RECEIPT });
    expect(answer.ok).toBe(false);
    expect(!answer.ok && answer.error).toMatch(/^The bank deduction is now on Anthropic, PBC · Nov 5, 2026, but the receipt was not valued at it/);
    expect(audits).toHaveLength(1);
  });

  it("refuses a receipt in dong, and moves nothing", async () => {
    script("reimbursement_claim_items", { data: own(LONE, "vnd") }, { data: [loneRow, { ...receiptRow, currency: "vnd" }] });
    script("reimbursement_files", { data: [file("ded", "bank_deduction", LONE), file("pdf", "receipt", RECEIPT)] });
    expect(await joinLoneRow({ personId: OWNER, loneItemId: LONE, receiptItemId: RECEIPT })).toEqual({ ok: false, error: "A bank deduction joins a receipt paid in another currency." });
    expect(updates("reimbursement_files")).toHaveLength(0);
  });

  it("refuses a receipt on another claim", async () => {
    script("reimbursement_claim_items", { data: own(LONE, "vnd") }, { data: [loneRow] });
    script("reimbursement_files", { data: [file("ded", "bank_deduction", LONE)] });
    expect(await joinLoneRow({ personId: OWNER, loneItemId: LONE, receiptItemId: RECEIPT })).toEqual({ ok: false, error: "That receipt is not on this claim." });
  });

  it("refuses on a claim that is not the owner's to change", async () => {
    script("reimbursement_claim_items", { data: own(LONE, "vnd", claim("submitted", "2026-11-01T03:00:00Z")) });
    expect((await joinLoneRow({ personId: OWNER, loneItemId: LONE, receiptItemId: RECEIPT })).ok).toBe(false);
    expect(updates("reimbursement_files")).toHaveLength(0);
  });
});

describe("joining a red invoice to its Vietnamese receipt", () => {
  const grab = { ...receiptRow, seller: "Highlands Coffee", amount_cents: 500000, currency: "vnd" };
  const invoiceRow = { ...loneRow, seller: "CÔNG TY TNHH HIGHLANDS", amount_cents: 500000 };

  it("moves the red invoice onto the receipt, reads it there, changes no value, and takes the emptied row off", async () => {
    script("reimbursement_claim_items", { data: own(LONE, "vnd") }, { data: [invoiceRow, grab] }, { data: own(LONE, "vnd") }, { data: [{ id: LONE }] });
    script("reimbursement_files", { data: [file("hd", "red_invoice", LONE), file("photo", "receipt", RECEIPT)] }, { data: [{ id: "hd" }] }, { data: [] });
    expect(await joinLoneRow({ personId: OWNER, loneItemId: LONE, receiptItemId: RECEIPT })).toEqual({ ok: true });

    expect(updates("reimbursement_files")[0].filters).toEqual(expect.arrayContaining([["eq", "kind", "red_invoice"]]));
    expect(updates("reimbursement_claim_items")).toHaveLength(0);
    expect(readReceipt).toHaveBeenCalledWith("hd", { onlyIfUnread: true });
    expect(deleted()).toBe(true);
    expect(audits[0]).toMatchObject({ context: { move: "join_red_invoice" } });
  });

  it("refuses a receipt abroad", async () => {
    script("reimbursement_claim_items", { data: own(LONE, "vnd") }, { data: [invoiceRow, receiptRow] });
    script("reimbursement_files", { data: [file("hd", "red_invoice", LONE), file("pdf", "receipt", RECEIPT)] });
    expect(await joinLoneRow({ personId: OWNER, loneItemId: LONE, receiptItemId: RECEIPT })).toEqual({ ok: false, error: "A red invoice joins a receipt bought in Vietnam, in dong." });
  });
});

describe("unjoining", () => {
  const joined = { ...receiptRow, charged_vnd: 2937648 };

  it("puts a bank deduction back on a row of its own at what the bank took, and values the receipt at the bank's rate", async () => {
    script(
      "reimbursement_claim_items",
      { data: own(RECEIPT, "usd") }, // the owner's gate
      { data: [joined] }, // the receipt as it is now
      { data: [{ position: 1 }] }, // the new row's position
      { data: { id: NEW } }, // the new row
      { data: [{ id: RECEIPT }] }, // the receipt valued again
      { data: [{ id: NEW }] }, // the new row named from the read
    );
    script("reimbursement_claims", { data: claim() });
    script(
      "reimbursement_files",
      { data: [file("pdf", "receipt", RECEIPT), file("ded", "bank_deduction", RECEIPT)] },
      { data: [{ id: "ded" }] }, // moved
      { data: [] }, // the new row has no other document
      { data: [] }, // already a bank deduction: nothing refiled
    );
    readStoredDocument.mockResolvedValue({
      ok: true,
      reading: { is_bank_deduction: true, amount_minor: 2937648, currency: "VND", bought_on: "2026-11-06", seller: "ANTHROPIC* CLAUDE SUB" },
    });
    expect(await unjoinDocument({ personId: OWNER, itemId: RECEIPT, fileId: "ded" })).toEqual({ ok: true });

    const inserted = calls.find((c) => c.table === "reimbursement_claim_items" && c.ops[0] === "insert")?.payloads[0];
    expect(inserted).toMatchObject({ claim_id: CLAIM, amount_cents: 2937648, currency: "vnd", amount_vnd: 2937648 });
    const [move] = updates("reimbursement_files");
    expect(move.payloads[0]).toEqual({ claim_item_id: NEW });
    expect(move.filters).toEqual(expect.arrayContaining([["eq", "id", "ded"], ["eq", "claim_item_id", RECEIPT]]));
    expect(updates("reimbursement_claim_items")[0].payloads[0]).toMatchObject({ charged_vnd: null, fx_source: "techcombank", fx_rate: 25805, amount_vnd: 2867194 });
    expect(updates("reimbursement_claim_items")[1].payloads[0]).toMatchObject({ seller: "ANTHROPIC* CLAUDE SUB", bought_on: "2026-11-06", amount_cents: 2937648 });
  });

  it("puts a red invoice back on a row of its own, read for what it names, and leaves the receipt's value alone", async () => {
    const grab = { ...receiptRow, currency: "vnd", amount_cents: 500000 };
    script("reimbursement_claim_items", { data: own(RECEIPT, "vnd") }, { data: [grab] }, { data: [{ position: 1 }] }, { data: { id: NEW } });
    script("reimbursement_claims", { data: claim() });
    script("reimbursement_files", { data: [file("photo", "receipt", RECEIPT), file("hd", "red_invoice", RECEIPT)] }, { data: [{ id: "hd" }] });
    expect(await unjoinDocument({ personId: OWNER, itemId: RECEIPT, fileId: "hd" })).toEqual({ ok: true });
    expect(calls.find((c) => c.ops[0] === "insert")?.payloads[0]).toMatchObject({ amount_cents: 0, currency: "vnd" });
    expect(updates("reimbursement_claim_items")).toHaveLength(0);
    expect(readReceipt).toHaveBeenCalledWith("hd");
  });

  it("refuses a file that is not joined to the receipt", async () => {
    script("reimbursement_claim_items", { data: own(RECEIPT, "usd") }, { data: [receiptRow] });
    script("reimbursement_files", { data: [file("pdf", "receipt", RECEIPT)] });
    expect(await unjoinDocument({ personId: OWNER, itemId: RECEIPT, fileId: "pdf" })).toEqual({ ok: false, error: "That file is not joined to this receipt." });
    expect(calls.some((c) => c.ops[0] === "insert")).toBe(false);
  });
});
