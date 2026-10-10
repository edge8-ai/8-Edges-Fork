import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script, scriptStorage } from "@/kernel/data/testing/fake-company-os";
import { fakeJsonMessage } from "@/kernel/ai/testing/fake-message";

// The AI receipt reading (design §1.9): a suggestion, never a decision. These
// assert what the person and the checker would see: the reading stored on the
// item, the fields it fills in only where the person typed nothing, and the
// warnings beside the document. A flag never blocks submit; nothing here is
// read by canSubmit.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const create = vi.hoisted(() => vi.fn());
vi.mock("@/kernel/ai/client", () => ({ anthropicIfConfigured: () => ({ messages: { create } }) }));
vi.mock("@/kernel/ai/calls", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/kernel/ai/calls")>()),
  recordAiCall: async () => {},
}));

// The bank's rate for a receipt abroad (RB.10), asked only when the reading fills one in.
const rateFor = vi.hoisted(() => vi.fn());
vi.mock("./vnd-rates", () => ({ rateFor }));

import { RECEIPT_READ_CLASS, ReceiptReading, flagsFor, prefillFor, readReceipt, type ReceiptReadingType } from "./receipt-reading";

// Fictional codes, held in constants: the fork scanner refuses a tax-code key beside a quoted value.
const OUR_CODE = "0300000001";
const OUR_CODE_SPACED = "0300-000-001";
const OTHER_CODE = "0311111111";
const reading = (over: Partial<ReceiptReadingType> = {}): ReceiptReadingType => ({
  amount_minor: 126000,
  currency: "VND",
  bought_on: "2026-10-02",
  seller: "Grab",
  category: "transport",
  is_red_invoice: true,
  buyer_name: "CÔNG TY TNHH ACME VIỆT NAM",
  buyer_tax_code: OUR_CODE,
  confidence: "high",
  notes: null,
  ...over,
});
const READY = { state: "ready" as const, slug: "acme-vn", legalName: "Công ty TNHH Acme Việt Nam", address: null, taxCode: "0300000001" };
const NONE = { sha256: "aaa", item: { id: "item-1", seller: "Grab", boughtOn: "2026-10-02", amount: 126000 }, files: [], items: [] };

describe("ReceiptReading", () => {
  it("is class S, which never leaves api.anthropic.com", () => {
    expect(RECEIPT_READ_CLASS).toBe("S");
  });

  it("accepts a reading of the design's shape", () => {
    expect(ReceiptReading.safeParse(reading()).success).toBe(true);
  });

  it("rejects a malformed reading", () => {
    expect(ReceiptReading.safeParse(reading({ bought_on: "2 Oct 2026" })).success).toBe(false);
    expect(ReceiptReading.safeParse(reading({ category: "groceries" as never })).success).toBe(false);
    expect(ReceiptReading.safeParse({ ...reading(), confidence: undefined }).success).toBe(false);
  });
});

describe("flagsFor", () => {
  it("raises nothing for a red invoice issued to the organisation, whatever the spelling of its name", () => {
    expect(flagsFor(reading({ buyer_tax_code: OUR_CODE_SPACED }), "red_invoice", READY, NONE)).toEqual({ flags: [], duplicateOfItemId: null });
  });

  it("flags a red invoice whose tax code differs", () => {
    expect(flagsFor(reading({ buyer_tax_code: OTHER_CODE }), "red_invoice", READY, NONE).flags).toEqual(["buyer_tax_code_differs"]);
  });

  it("flags a red invoice that carries no tax code at all, since it was not issued to the organisation", () => {
    expect(flagsFor(reading({ buyer_tax_code: null }), "red_invoice", READY, NONE).flags).toEqual(["buyer_tax_code_differs"]);
  });

  it("flags a red invoice made out to someone else", () => {
    expect(flagsFor(reading({ buyer_name: "Nguyen Van A" }), "red_invoice", READY, NONE).flags).toEqual(["buyer_not_organisation"]);
  });

  it("checks only the name while no tax code is configured", () => {
    const noCode = { state: "no_tax_code" as const, slug: READY.slug, legalName: READY.legalName, address: null };
    expect(flagsFor(reading({ buyer_tax_code: OTHER_CODE }), "red_invoice", noCode, NONE).flags).toEqual([]);
    expect(flagsFor(reading({ buyer_name: "Nguyen Van A" }), "red_invoice", noCode, NONE).flags).toEqual(["buyer_not_organisation"]);
  });

  it("checks no buyer when the organisation has none configured, or it could not be read", () => {
    const other = reading({ buyer_name: "Nguyen Van A", buyer_tax_code: OTHER_CODE });
    expect(flagsFor(other, "red_invoice", { state: "not_configured" }, NONE).flags).toEqual([]);
    expect(flagsFor(other, "red_invoice", { state: "unavailable" }, NONE).flags).toEqual([]);
  });

  it("asks nothing of a buyer on a plain receipt", () => {
    expect(flagsFor(reading({ is_red_invoice: false, buyer_name: null, buyer_tax_code: null }), "receipt", READY, NONE).flags).toEqual([]);
  });

  it("flags a document filed as a red invoice that the reader says is not one, and checks no buyer on it", () => {
    const grab = reading({ is_red_invoice: false, buyer_name: null, buyer_tax_code: null });
    expect(flagsFor(grab, "red_invoice", READY, NONE).flags).toEqual(["not_a_red_invoice"]);
    // Whatever the organisation's buyer state: the flag is about the document, not the buyer.
    expect(flagsFor(grab, "red_invoice", { state: "not_configured" }, NONE).flags).toEqual(["not_a_red_invoice"]);
  });

  it("does not call a receipt that turns out to be a red invoice anything but its buyer checks", () => {
    expect(flagsFor(reading(), "receipt", READY, NONE).flags).toEqual([]);
  });

  it("calls an unreadable document unreadable, not 'not a red invoice': the reader cannot tell what it is", () => {
    const blank = reading({ amount_minor: null, bought_on: null, seller: null, is_red_invoice: false, buyer_name: null, buyer_tax_code: null, confidence: "medium" });
    expect(flagsFor(blank, "red_invoice", READY, NONE).flags).toEqual(["unreadable"]);
    expect(flagsFor(reading({ is_red_invoice: false, confidence: "low" }), "red_invoice", READY, NONE).flags).toEqual(["unreadable"]);
    expect(flagsFor(null, "red_invoice", READY, NONE).flags).toEqual(["unreadable"]);
  });

  it("flags a document the model could not read", () => {
    expect(flagsFor(reading({ confidence: "low" }), "red_invoice", READY, NONE).flags).toContain("unreadable");
    const blank = reading({ amount_minor: null, bought_on: null, seller: null, is_red_invoice: false, buyer_name: null, buyer_tax_code: null, confidence: "medium" });
    expect(flagsFor(blank, "red_invoice", READY, NONE).flags).toEqual(["unreadable"]);
    expect(flagsFor(null, "red_invoice", READY, NONE).flags).toEqual(["unreadable"]);
  });

  it("flags a file the person already uploaded on another receipt, by its hash", () => {
    const existing = { ...NONE, files: [{ itemId: "item-1", sha256: "aaa" }, { itemId: "item-7", sha256: "aaa" }] };
    expect(flagsFor(reading(), "red_invoice", READY, existing)).toEqual({ flags: ["possible_duplicate"], duplicateOfItemId: "item-7" });
  });

  it("flags another receipt with the same seller, date and amount", () => {
    const existing = {
      ...NONE,
      items: [
        { id: "item-8", seller: "Grab", boughtOn: "2026-10-03", amount: 126000 },
        { id: "item-9", seller: " grab ", boughtOn: "2026-10-02", amount: 126000 },
      ],
    };
    expect(flagsFor(reading(), "red_invoice", READY, existing)).toEqual({ flags: ["possible_duplicate"], duplicateOfItemId: "item-9" });
  });

  it("does not call two receipts duplicates on a missing seller, date or amount", () => {
    const item = { id: "item-1", seller: null, boughtOn: "2026-10-02", amount: 0 };
    const existing = { sha256: null, item, files: [{ itemId: "item-7", sha256: null }], items: [{ ...item, id: "item-9" }] };
    expect(flagsFor(reading(), "red_invoice", READY, existing).flags).toEqual([]);
  });
});

describe("prefillFor", () => {
  const blank = { seller: null, bought_on: null, amount_cents: 0, currency: "vnd", category: "other", description: "IMG_0412.jpg" };

  it("fills every field the drop left empty", () => {
    expect(prefillFor(reading(), blank, "IMG_0412.jpg")).toEqual({
      seller: "Grab",
      bought_on: "2026-10-02",
      amount_cents: 126000,
      amount_vnd: 126000,
      category: "transport",
      description: null,
    });
  });

  it("never overwrites what the person typed", () => {
    const typed = { seller: "Xanh SM", bought_on: "2026-10-01", amount_cents: 99000, currency: "vnd", category: "meals_travel", description: "Lunch" };
    expect(prefillFor(reading(), typed, "IMG_0412.jpg")).toEqual({});
    // Other with the person's own words is a choice, not a blank.
    expect(prefillFor(reading(), { ...blank, description: "Visa fee" }, "IMG_0412.jpg")).not.toHaveProperty("category");
  });

  it("fills a total paid abroad in its own currency, moving the receipt abroad, and leaves its value to the bank's rate (RB.10)", () => {
    const patch = prefillFor(reading({ currency: "AUD", amount_minor: 6280 }), blank, "IMG_0412.jpg");
    expect(patch).toMatchObject({ amount_cents: 6280, currency: "aud", bought_in_vietnam: false });
    expect(patch).not.toHaveProperty("amount_vnd");
  });

  it("leaves the amount alone when the model reads a negative total, which the schema cannot refuse", () => {
    expect(prefillFor(reading({ amount_minor: -126000 }), blank, "IMG_0412.jpg")).not.toHaveProperty("amount_cents");
  });

  it("leaves the amount alone in a currency no bank quotes", () => {
    expect(prefillFor(reading({ currency: "XYZ", amount_minor: 1250 }), blank, "IMG_0412.jpg")).not.toHaveProperty("amount_cents");
  });

  it("keeps the file name as the description when the model suggests Other or nothing", () => {
    expect(prefillFor(reading({ category: "other" }), blank, "IMG_0412.jpg")).not.toHaveProperty("category");
    expect(prefillFor(reading({ category: null }), blank, "IMG_0412.jpg")).not.toHaveProperty("description");
  });
});

describe("readReceipt", () => {
  const PDF = new TextEncoder().encode("%PDF-1.7\n1 0 obj");
  const file = (status = "draft") => ({
    data: {
      id: "file-1",
      kind: "red_invoice",
      storage_path: "claim/claim-1/item-1/file-1-invoice.pdf",
      filename: "invoice.pdf",
      mime_type: "application/pdf",
      sha256: "aaa",
      claim_item_id: "item-1",
      reimbursement_claim_items: {
        id: "item-1",
        seller: null,
        bought_on: null,
        amount_cents: 0,
        currency: "vnd",
        // A dropped receipt starts in dong and bought in Vietnam (claim-items.ts).
        bought_in_vietnam: true,
        category: "other",
        description: "invoice.pdf",
        reimbursement_claims: { id: "claim-1", status, person_id: "person-a", title: "Trip", submitted_at: null },
      },
    },
  });
  const LEGAL = { data: [{ slug: "acme-vn", name: "Acme", legal_name: READY.legalName, tax_id: READY.taxCode }] };
  const itemWrite = () => calls.find((c) => c.table === "reimbursement_claim_items" && c.ops[0] === "update");

  beforeEach(() => {
    resetFake();
    create.mockReset();
    rateFor.mockReset();
  });

  function scriptRead(status = "draft") {
    script("reimbursement_files", file(status), { data: [{ claim_item_id: "item-1", sha256: "aaa" }] });
    scriptStorage("download", { data: new Blob([PDF]) });
    script("legal_entities", LEGAL);
    script("reimbursement_claim_items", { data: [] }, { data: [{ id: "item-1" }] });
  }

  it("stores the reading, fills in the blanks and flags nothing on a good invoice", async () => {
    scriptRead();
    create.mockResolvedValue(fakeJsonMessage(reading()));
    const res = await readReceipt("file-1");
    expect(res.ok).toBe(true);
    const write = itemWrite();
    expect(write?.payloads[0]).toMatchObject({
      ai_reading: { ...reading(), file_id: "file-1" },
      ai_flags: [],
      duplicate_of_item_id: null,
      seller: "Grab",
      amount_cents: 126000,
      category: "transport",
    });
    expect(write?.filters).toEqual(expect.arrayContaining([["eq", "id", "item-1"]]));
    // The PDF goes to the model as a document block, on the fast tier's client.
    expect(create.mock.calls[0][0].messages[0].content[0]).toMatchObject({ type: "document", source: { media_type: "application/pdf" } });
  });

  it("values a receipt read abroad at the bank's rate on its date, as the owner's form would (RB.10)", async () => {
    scriptRead();
    script("reimbursement_files", { data: [{ id: "file-1" }] });
    script("audit_log", { data: null });
    rateFor.mockResolvedValue({ rate: 18426, source: "techcombank", asOf: "2026-10-03" });
    create.mockResolvedValue(fakeJsonMessage(reading({ currency: "AUD", amount_minor: 6280, bought_on: "2026-10-04", is_red_invoice: false })));
    expect((await readReceipt("file-1")).ok).toBe(true);
    // Whose receipt it is goes with the lookup, so their own manual rate is never used for it (A.34).
    expect(rateFor).toHaveBeenCalledWith("aud", "2026-10-04", { owner: "person-a" });
    expect(itemWrite()?.payloads[0]).toMatchObject({
      amount_cents: 6280,
      currency: "aud",
      bought_in_vietnam: false,
      amount_vnd: Math.round(62.8 * 18426),
      fx_rate: 18426,
      fx_source: "techcombank",
      fx_as_of: "2026-10-03",
    });
    // The dropped PDF started as a red invoice; abroad it is a receipt, and not "not a red invoice".
    expect((itemWrite()?.payloads[0] as { ai_flags: string[] }).ai_flags).not.toContain("not_a_red_invoice");
    const refile = calls.find((c) => c.table === "reimbursement_files" && c.ops[0] === "update");
    expect(refile?.payloads[0]).toEqual({ kind: "receipt" });
    expect(refile?.filters).toEqual(expect.arrayContaining([["eq", "claim_item_id", "item-1"], ["eq", "kind", "red_invoice"]]));
  });

  it("leaves a red invoice read in Vietnam filed as one", async () => {
    scriptRead();
    create.mockResolvedValue(fakeJsonMessage(reading()));
    expect((await readReceipt("file-1")).ok).toBe(true);
    expect(calls.filter((c) => c.table === "reimbursement_files" && c.ops[0] === "update")).toHaveLength(0);
  });

  it("leaves a receipt read abroad rate pending when no bank has the day's rate yet", async () => {
    scriptRead();
    script("reimbursement_files", { data: [{ id: "file-1" }] });
    script("audit_log", { data: null });
    rateFor.mockResolvedValue(null);
    create.mockResolvedValue(fakeJsonMessage(reading({ currency: "AUD", amount_minor: 6280, bought_on: "2026-10-04", is_red_invoice: false })));
    expect((await readReceipt("file-1")).ok).toBe(true);
    expect(itemWrite()?.payloads[0]).toMatchObject({ amount_cents: 6280, currency: "aud", amount_vnd: null, fx_source: "none" });
  });

  it("stores not_a_red_invoice for a receipt filed as a red invoice, and still fills in its blanks", async () => {
    scriptRead();
    create.mockResolvedValue(fakeJsonMessage(reading({ category: "meals_travel", is_red_invoice: false, buyer_name: null, buyer_tax_code: null })));
    const res = await readReceipt("file-1");
    expect(res).toMatchObject({ ok: true, flags: ["not_a_red_invoice"] });
    expect(itemWrite()?.payloads[0]).toMatchObject({ ai_flags: ["not_a_red_invoice"], seller: "Grab", amount_cents: 126000 });
  });

  it("does not call a ride's PDF not a red invoice: transport needs none (RB.15)", async () => {
    scriptRead();
    create.mockResolvedValue(fakeJsonMessage(reading({ is_red_invoice: false, buyer_name: null, buyer_tax_code: null })));
    const res = await readReceipt("file-1");
    expect(res).toMatchObject({ ok: true, flags: [] });
    expect(itemWrite()?.payloads[0]).toMatchObject({ ai_flags: [], category: "transport" });
  });

  it("does not call a PDF on a receipt already bought abroad not a red invoice, even on a locked claim", async () => {
    // A submitted claim's PDFs filed as red invoices on receipts the person
    // moved abroad (a real claim, 2026-10-07): a checker's re-read must not
    // warn about a document no receipt abroad could have.
    const abroad = file("submitted");
    Object.assign(abroad.data.reimbursement_claim_items, { currency: "aud", bought_in_vietnam: false, amount_cents: 1386 });
    script("reimbursement_files", abroad, { data: [{ claim_item_id: "item-1", sha256: "aaa" }] });
    scriptStorage("download", { data: new Blob([PDF]) });
    script("legal_entities", LEGAL);
    // No seller or date on the item, so no lookup for a twin: the only item query is the save.
    script("reimbursement_claim_items", { data: [{ id: "item-1" }] });
    create.mockResolvedValue(fakeJsonMessage(reading({ currency: "AUD", amount_minor: 1386, is_red_invoice: false, buyer_name: null, buyer_tax_code: null })));
    expect(await readReceipt("file-1")).toMatchObject({ ok: true, flags: [] });
    expect(itemWrite()?.payloads[0]).toMatchObject({ ai_flags: [] });
  });

  it("only re-reads a locked claim: the reading and flags change, the person's fields never do", async () => {
    scriptRead("submitted");
    create.mockResolvedValue(fakeJsonMessage(reading({ buyer_tax_code: OTHER_CODE })));
    await readReceipt("file-1");
    const payload = itemWrite()?.payloads[0] as Record<string, unknown>;
    expect(payload.ai_flags).toEqual(["buyer_tax_code_differs"]);
    expect(payload).not.toHaveProperty("seller");
    expect(payload).not.toHaveProperty("amount_cents");
  });

  it("never calls a receipt a duplicate of one its owner removed: the removed one is paid by nobody (20261008090000)", async () => {
    scriptRead();
    create.mockResolvedValue(fakeJsonMessage(reading()));
    expect((await readReceipt("file-1")).ok).toBe(true);
    const byHash = calls.filter((c) => c.table === "reimbursement_files" && c.filters.some((f) => f[0] === "eq" && f[1] === "sha256"));
    const byDateAndAmount = calls.filter((c) => c.table === "reimbursement_claim_items" && c.ops[0] === "select" && c.filters.some((f) => f[1] === "bought_on"));
    expect(byHash).toHaveLength(1);
    expect(byHash[0].filters).toContainEqual(["is", "reimbursement_claim_items.removed_at", null]);
    expect(byDateAndAmount).toHaveLength(1);
    expect(byDateAndAmount[0].filters).toContainEqual(["is", "removed_at", null]);
  });

  it("writes nothing when the model's answer is not a reading, so it can be read again", async () => {
    script("reimbursement_files", file());
    scriptStorage("download", { data: new Blob([PDF]) });
    create.mockResolvedValue(fakeJsonMessage({ amount: "lots" }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await readReceipt("file-1");
    expect(res.ok).toBe(false);
    expect(itemWrite()).toBeUndefined();
  });
});
