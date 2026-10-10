import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { answerOnlySelectedColumns, calls, fakeSupabase, resetFake, script, scriptStorage, storageCalls } from "@/kernel/data/testing/fake-company-os";

// A receipt in another currency (RB.10): it keeps its original amount in minor
// units and is valued in VND at Techcombank's selling rate on the day it was
// bought, Vietcombank's where Techcombank has none, or what the card charged,
// which always wins. With no rate it is saved anyway, "rate pending", and a
// checker can enter the rate by hand. Driven through the module's functions
// on the kernel's fake, with the banks answering through a stubbed fetch.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const audits: Record<string, unknown>[] = [];
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: async (a: Record<string, unknown>) => void audits.push(a) }));

const { addClaimItem, checkBlockedBy, ClaimItemInput, enterItemRateByHand, loadSubmitItems, startDroppedReceipt, updateClaimItem } = await import("./claim-items");
const { markClaimItemRemoved, removeClaimItem } = await import("./item-removal");

const CLAIM = "11111111-1111-4111-8111-111111111111";
const ITEM = "22222222-2222-4222-8222-222222222222";
const OWNER = "person-a";
const claim = (status = "draft", person_id = OWNER) => ({ id: CLAIM, status, person_id, title: "Melbourne", submitted_at: status === "draft" ? null : "2026-10-05T03:00:00Z" });

const TCB_AUD = JSON.stringify({ exchangeRate: { data: [{ label: "AUD", askRate: "18426", askRateTM: "18448", sourceCurrency: "AUD" }] } });
const VCB = JSON.stringify({ Count: 1, Date: "2026-10-03T00:00:00", Data: [{ currencyCode: "INR", sell: "279.52" }] });

let bankUrls: string[] = [];
function banks(answer: (url: string) => Response) {
  bankUrls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      bankUrls.push(String(url));
      return answer(String(url));
    }),
  );
}

const itemInsert = () => calls.find((c) => c.table === "reimbursement_claim_items" && c.ops[0] === "insert")?.payloads[0] as Record<string, unknown>;
const itemUpdate = () => calls.find((c) => c.table === "reimbursement_claim_items" && c.ops[0] === "update");
const rateUpserts = () => calls.filter((c) => c.table === "reimbursement_fx_rates" && c.ops[0] === "upsert").map((c) => c.payloads[0]);

const aud = { category: "transport" as const, seller: "13cabs", boughtOn: "2026-10-03", amount: 6280, currency: "aud", boughtInVietnam: false };

beforeEach(() => {
  resetFake();
  audits.length = 0;
});
afterEach(() => vi.unstubAllGlobals());

/** The reads addClaimItem makes before its insert: the claim, the last position. */
function scriptAdd() {
  script("reimbursement_claims", { data: claim() });
  script("reimbursement_claim_items", { data: [] }, { data: { id: ITEM } });
}

describe("adding a receipt in another currency", () => {
  it("values it at Techcombank's selling rate on the day it was bought, and keeps the rate", async () => {
    scriptAdd();
    script("reimbursement_fx_rates", { data: [] }, { data: null });
    banks(() => new Response(TCB_AUD));
    expect(await addClaimItem({ claimId: CLAIM, personId: OWNER, item: aud })).toEqual({ ok: true, id: ITEM });
    expect(itemInsert()).toMatchObject({
      amount_cents: 6280,
      currency: "aud",
      amount_vnd: 1157153,
      fx_rate: 18426,
      fx_source: "techcombank",
      fx_as_of: "2026-10-03",
      charged_vnd: null,
    });
    expect(rateUpserts()).toEqual([expect.objectContaining({ rate_date: "2026-10-03", currency: "aud", source: "techcombank", rate_vnd: 18426 })]);
  });

  it("asks Vietcombank for a currency Techcombank does not list", async () => {
    scriptAdd();
    script("reimbursement_fx_rates", { data: [] }, { data: null });
    banks((url) => new Response(url.includes("techcombank") ? TCB_AUD : VCB));
    await addClaimItem({ claimId: CLAIM, personId: OWNER, item: { ...aud, currency: "inr", amount: 150000 } });
    expect(itemInsert()).toMatchObject({ amount_vnd: 419280, fx_rate: 279.52, fx_source: "vietcombank", fx_as_of: "2026-10-03" });
  });

  it("takes what the card actually charged over any rate, without asking a bank", async () => {
    scriptAdd();
    banks(() => new Response(TCB_AUD));
    await addClaimItem({ claimId: CLAIM, personId: OWNER, item: { ...aud, chargedVnd: 1_170_000 } });
    expect(itemInsert()).toMatchObject({ amount_vnd: 1_170_000, charged_vnd: 1_170_000, fx_source: "card" });
    expect(bankUrls).toEqual([]);
  });

  it("saves it rate pending when no bank answers", async () => {
    scriptAdd();
    script("reimbursement_fx_rates", { data: [] });
    banks(() => new Response("<html>Error 500</html>", { status: 503 }));
    expect(await addClaimItem({ claimId: CLAIM, personId: OWNER, item: aud })).toEqual({ ok: true, id: ITEM });
    expect(itemInsert()).toMatchObject({ amount_vnd: null, fx_rate: null, fx_source: "none" });
  }, 15_000);

  it("saves it rate pending when it has no date to look the rate up on", async () => {
    scriptAdd();
    banks(() => new Response(TCB_AUD));
    await addClaimItem({ claimId: CLAIM, personId: OWNER, item: { ...aud, boughtOn: "" } });
    expect(itemInsert()).toMatchObject({ amount_vnd: null, fx_source: "none" });
    expect(bankUrls).toEqual([]);
  });

  it("refuses a currency the picker does not offer", async () => {
    const answer = await addClaimItem({ claimId: CLAIM, personId: OWNER, item: { ...aud, currency: "xyz" } });
    expect(answer).toEqual({ ok: false, error: expect.stringContaining("Pick a currency") });
  });

  it("still values a dong receipt at itself, asking no bank", async () => {
    scriptAdd();
    banks(() => new Response(TCB_AUD));
    await addClaimItem({ claimId: CLAIM, personId: OWNER, item: { ...aud, currency: "vnd", amount: 126000, boughtInVietnam: true } });
    expect(itemInsert()).toMatchObject({ amount_vnd: 126000, fx_rate: 1, fx_source: "none" });
    expect(bankUrls).toEqual([]);
  });
});

// A.34: the add and the edit hand the owner to the rate lookup, so a manual
// rate the owner typed (as a checker, on someone else's claim) never values
// their own receipt. Only the selected columns come back, as PostgREST
// answers, so the kept rate's entered_by must really be read.
describe("a manual rate its own owner typed", () => {
  beforeEach(() => answerOnlySelectedColumns());
  const manualBy = (person: string) => ({ data: [{ currency: "aud", rate_date: "2026-10-03", source: "manual", rate_vnd: 18400, entered_by: person }] });

  it("leaves the owner's new receipt rate pending", async () => {
    scriptAdd();
    script("reimbursement_fx_rates", manualBy(OWNER));
    banks(() => new Response("", { status: 503 }));
    expect(await addClaimItem({ claimId: CLAIM, personId: OWNER, item: aud })).toEqual({ ok: true, id: ITEM });
    expect(itemInsert()).toMatchObject({ amount_vnd: null, fx_source: "none" });
  }, 15_000);

  it("values it when someone else typed the rate", async () => {
    scriptAdd();
    script("reimbursement_fx_rates", manualBy("person-checker"));
    banks(() => new Response("", { status: 503 }));
    await addClaimItem({ claimId: CLAIM, personId: OWNER, item: aud });
    expect(itemInsert()).toMatchObject({ fx_rate: 18400, fx_source: "manual" });
  }, 15_000);

  it("leaves an edited receipt rate pending too", async () => {
    script("reimbursement_claim_items", { data: { id: ITEM, reimbursement_claims: claim() } }, { data: [{ id: ITEM }] });
    script("reimbursement_fx_rates", manualBy(OWNER));
    script("reimbursement_files", { data: [] });
    banks(() => new Response("", { status: 503 }));
    expect(await updateClaimItem({ itemId: ITEM, personId: OWNER, item: aud })).toEqual({ ok: true });
    expect(itemUpdate()?.payloads[0]).toMatchObject({ amount_vnd: null, fx_source: "none" });
  }, 15_000);
});

// A.34: the owner's edit waits on a bank for its rate between reading the
// claim and writing the receipt; if the claim was checked in that moment the
// database refuses the write, and the owner reads why.
it("tells the owner when their claim was checked while they were editing a receipt", async () => {
  const frozen = { message: "Claim c is checked: a checked claim's receipts are frozen.", code: "P0R01" } as { message: string };
  script("reimbursement_claim_items", { data: { id: ITEM, reimbursement_claims: claim("sent_back", OWNER) } }, { data: null, error: frozen });
  script("reimbursement_fx_rates", { data: [] }, { data: null });
  banks(() => new Response(TCB_AUD));
  expect(await updateClaimItem({ itemId: ITEM, personId: OWNER, item: aud })).toEqual({
    ok: false,
    error: "This claim was checked while you were working on it, so the receipt stays as it was. Reload to see it.",
  });
});

describe("changing a receipt", () => {
  it("values it again from what it now says", async () => {
    script("reimbursement_claim_items", { data: { id: ITEM, reimbursement_claims: claim() } }, { data: [{ id: ITEM }] });
    script("reimbursement_files", { data: [] });
    banks(() => new Response(TCB_AUD));
    expect(await updateClaimItem({ itemId: ITEM, personId: OWNER, item: { ...aud, chargedVnd: 1_200_000 } })).toEqual({ ok: true });
    expect(itemUpdate()?.payloads[0]).toMatchObject({ amount_vnd: 1_200_000, fx_source: "card", charged_vnd: 1_200_000 });
  });

  it("refiles its red invoices as receipts once it is bought abroad, because a red invoice is Vietnamese", async () => {
    // A dropped PDF starts as a red invoice on a receipt that starts in Vietnam;
    // three Australian Uber receipts reached a checker filed that way.
    script("reimbursement_claim_items", { data: { id: ITEM, reimbursement_claims: claim() } }, { data: [{ id: ITEM }] });
    script("reimbursement_files", { data: [{ id: "file-1" }] });
    banks(() => new Response(TCB_AUD));
    expect(await updateClaimItem({ itemId: ITEM, personId: OWNER, item: aud })).toEqual({ ok: true });
    const refile = calls.find((c) => c.table === "reimbursement_files" && c.ops[0] === "update");
    expect(refile?.payloads[0]).toEqual({ kind: "receipt" });
    expect(refile?.filters).toEqual(expect.arrayContaining([["eq", "claim_item_id", ITEM], ["eq", "kind", "red_invoice"]]));
    expect(audits).toEqual([expect.objectContaining({ table: "reimbursement_files", recordId: "file-1", oldData: { kind: "red_invoice" }, newData: { kind: "receipt" } })]);
  });

  it("leaves the red invoice of a receipt bought in Vietnam as it is", async () => {
    script("reimbursement_claim_items", { data: { id: ITEM, reimbursement_claims: claim() } }, { data: [{ id: ITEM }] });
    expect(await updateClaimItem({ itemId: ITEM, personId: OWNER, item: { ...aud, currency: "vnd", amount: 126000, boughtInVietnam: true } })).toEqual({ ok: true });
    expect(calls.filter((c) => c.table === "reimbursement_files")).toHaveLength(0);
  });
});

describe("a checker entering a rate by hand", () => {
  const checker = { kind: "checker" as const, personId: "person-finance", mayDecideOwn: false, label: "finance@example.test" };
  const row = (status = "submitted", personId = OWNER) => ({ id: CLAIM, status: status as "submitted", personId, title: "Melbourne", submittedAt: "2026-10-05T03:00:00Z" });
  const pendingItem = { id: ITEM, claim_id: CLAIM, currency: "aud", amount_cents: 6280, bought_on: "2026-10-03", charged_vnd: null };

  it("values the receipt at it, stamped manual, and keeps the rate with who entered it", async () => {
    script("reimbursement_claim_items", { data: pendingItem }, { data: [{ id: ITEM }] });
    script("reimbursement_fx_rates", { data: null });
    expect(await enterItemRateByHand({ row: row(), itemId: ITEM, actor: checker, rate: "18,400" })).toEqual({ ok: true });
    expect(itemUpdate()?.payloads[0]).toEqual({ amount_vnd: 1155520, fx_rate: 18400, fx_source: "manual", fx_as_of: "2026-10-03" });
    expect(itemUpdate()?.filters).toEqual(expect.arrayContaining([["eq", "id", ITEM], ["eq", "claim_id", CLAIM], ["is", "charged_vnd", null]]));
    expect(rateUpserts()).toEqual([expect.objectContaining({ rate_date: "2026-10-03", currency: "aud", source: "manual", rate_vnd: 18400, entered_by: "person-finance" })]);
    expect(audits[0]).toMatchObject({ table: "reimbursement_claim_items", recordId: ITEM, context: expect.objectContaining({ move: "enter_rate" }) });
  });

  it("refuses on the checker's own claim", async () => {
    expect(await enterItemRateByHand({ row: row("submitted", "person-finance"), itemId: ITEM, actor: checker, rate: "18400" })).toEqual({
      ok: false,
      error: "You cannot check or approve your own claim.",
    });
    expect(calls).toHaveLength(0);
  });

  it("refuses once the claim is no longer waiting to be checked", async () => {
    expect((await enterItemRateByHand({ row: row("checked"), itemId: ITEM, actor: checker, rate: "18400" })).ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("refuses something that is not a rate", async () => {
    for (const rate of ["", "0", "-5", "abc", "1.1234567"]) {
      expect((await enterItemRateByHand({ row: row(), itemId: ITEM, actor: checker, rate })).ok).toBe(false);
    }
    expect(calls).toHaveLength(0);
  });

  it("refuses a dong receipt and one valued by its card charge, which the rate cannot change", async () => {
    script("reimbursement_claim_items", { data: { ...pendingItem, currency: "vnd" } }, { data: { ...pendingItem, charged_vnd: 1_170_000 } });
    expect(await enterItemRateByHand({ row: row(), itemId: ITEM, actor: checker, rate: "18400" })).toEqual({ ok: false, error: "A dong receipt needs no rate." });
    expect(await enterItemRateByHand({ row: row(), itemId: ITEM, actor: checker, rate: "18400" })).toEqual({
      ok: false,
      error: "This receipt is valued at what the card charged, which wins over any rate.",
    });
    expect(itemUpdate()).toBeUndefined();
  });
});

// Many receipts at once (RB.9): each file dropped on a claim becomes its own
// item, with nothing filled in but the file's name, and its upload starts at
// once. A PDF goes in as the red invoice a Vietnamese item needs, a photo as a
// receipt. In dong, valued at itself, until the reading or the person fills
// it in (RB.10). Scripted on the kernel's fake, database and storage both.
const dropClaim = { id: "claim-1", status: "draft", person_id: OWNER, title: "Trip", submitted_at: null };
const itemWrites = () => calls.filter((c) => c.table === "reimbursement_claim_items" && c.ops[0] !== "select");
const fileInsert = () => calls.find((c) => c.table === "reimbursement_files" && c.ops[0] === "insert");


function scriptDrop() {
  script("reimbursement_claims", { data: dropClaim });
  script(
    "reimbursement_claim_items",
    { data: [{ position: 2 }] },
    { data: { id: "item-9" } },
    { data: { id: "item-9", reimbursement_claims: dropClaim } },
  );
}

describe("startDroppedReceipt", () => {
  it("adds a blank item named by the file and starts its PDF as the red invoice", async () => {
    scriptDrop();
    script("reimbursement_files", { count: 0 }, { data: null });
    scriptStorage("createSignedUploadUrl", { data: { token: "tok" } });
    const res = await startDroppedReceipt({ claimId: "claim-1", personId: OWNER, declared: { name: "HĐ 0831.pdf", size: 1000, type: "application/pdf" } });
    expect(res).toMatchObject({ ok: true, itemId: "item-9", token: "tok" });
    expect(itemWrites()[0].payloads[0]).toEqual({
      claim_id: "claim-1",
      position: 3,
      description: "HĐ 0831.pdf",
      seller: null,
      bought_on: null,
      category: "other",
      amount_cents: 0,
      currency: "vnd",
      amount_vnd: 0,
      fx_rate: 1,
      fx_source: "none",
      fx_as_of: null,
      charged_vnd: null,
      bought_in_vietnam: true,
      lost_receipt_note: null,
      rebill: false,
      rebill_company_id: null,
    });
    expect(fileInsert()?.payloads[0]).toMatchObject({ kind: "red_invoice", claim_item_id: "item-9" });
  });

  it("starts a photo as a receipt", async () => {
    scriptDrop();
    script("reimbursement_files", { count: 0 }, { data: null });
    scriptStorage("createSignedUploadUrl", { data: { token: "tok" } });
    await startDroppedReceipt({ claimId: "claim-1", personId: OWNER, declared: { name: "IMG_0412.jpg", size: 1000, type: "image/jpeg" } });
    expect(fileInsert()?.payloads[0]).toMatchObject({ kind: "receipt" });
  });

  it("removes the blank item again when the upload is refused, so no empty receipt is left behind", async () => {
    scriptDrop();
    script("reimbursement_claim_items", { data: [{ id: "item-9" }] });
    const res = await startDroppedReceipt({ claimId: "claim-1", personId: OWNER, declared: { name: "notes.txt", size: 10, type: "text/plain" } });
    expect(res).toEqual({ ok: false, error: "notes.txt can't be attached. Use a PDF or a photo (JPG, PNG, WebP or HEIC)." });
    expect(itemWrites().map((c) => c.ops[0])).toEqual(["insert", "delete"]);
  });

  // 20261008090000: the database keeps every item of a claim that was ever
  // submitted, so on a sent-back or withdrawn claim the blank item is marked
  // removed, saying why, rather than deleted by a write the database refuses.
  it("marks the blank item removed instead on a claim that was ever submitted", async () => {
    const sentBack = { ...dropClaim, status: "sent_back", submitted_at: "2026-10-05T03:00:00Z" };
    script("reimbursement_claims", { data: sentBack });
    script(
      "reimbursement_claim_items",
      { data: [{ position: 2 }] },
      { data: { id: "item-9" } },
      { data: { id: "item-9", reimbursement_claims: sentBack } },
      { data: [{ id: "item-9" }] },
    );
    const res = await startDroppedReceipt({ claimId: "claim-1", personId: OWNER, declared: { name: "notes.txt", size: 10, type: "text/plain" } });
    expect(res).toMatchObject({ ok: false });
    const writes = itemWrites();
    expect(writes.map((c) => c.ops[0])).toEqual(["insert", "update"]);
    expect(writes[1].payloads[0]).toMatchObject({ removed_by: OWNER, remove_reason: "upload did not start" });
    expect(typeof (writes[1].payloads[0] as Record<string, unknown>).removed_at).toBe("string");
    expect(writes[1].filters).toEqual(expect.arrayContaining([["eq", "id", "item-9"], ["eq", "claim_id", "claim-1"], ["is", "removed_at", null]]));
  });
});

// Plan §10, 20261008090000: "Once submitted, receipts and red invoices cannot
// be deleted by anyone through the product … People can delete only from a
// draft." The owner deletes a receipt from a draft never submitted; from a
// claim that was (sent back, or withdrawn to a draft) they mark it removed
// with a reason, and it stays on the claim, out of every total.
describe("taking a receipt off a claim", () => {
  const SUBMITTED_ONCE = "2026-10-05T03:00:00Z";
  const ownItem = (status: string, submitted_at: string | null, removed_at: string | null = null) => ({
    data: { id: ITEM, removed_at, reimbursement_claims: { id: CLAIM, status, person_id: OWNER, title: "Melbourne", submitted_at } },
  });

  it("deletes it from a draft that was never submitted, then removes its documents' objects", async () => {
    script("reimbursement_claim_items", ownItem("draft", null), { data: [{ id: ITEM }] });
    script("reimbursement_files", { data: [{ storage_path: "claim/c/i/f-a.pdf" }] });
    scriptStorage("remove", { data: [] });
    expect(await removeClaimItem({ itemId: ITEM, personId: OWNER })).toEqual({ ok: true });
    expect(calls.filter((c) => c.table === "reimbursement_claim_items" && c.ops[0] === "delete")).toHaveLength(1);
    expect(storageCalls.map((c) => c.args[0])).toEqual([["claim/c/i/f-a.pdf"]]);
  });

  it("refuses to delete it from a claim that was ever submitted, saying how to take it off instead, and writes nothing", async () => {
    for (const [status, submitted] of [["sent_back", SUBMITTED_ONCE], ["draft", SUBMITTED_ONCE]] as const) {
      resetFake();
      script("reimbursement_claim_items", ownItem(status, submitted));
      const res = await removeClaimItem({ itemId: ITEM, personId: OWNER });
      expect(res).toEqual({ ok: false, error: "This claim was submitted before, so its receipts are kept for ten years: remove this one with a reason instead." });
      expect(calls.filter((c) => c.ops[0] !== "select")).toHaveLength(0);
      expect(storageCalls).toHaveLength(0);
    }
  });

  it("says the same when the database refuses the delete because the claim was submitted in between", async () => {
    script("reimbursement_claim_items", ownItem("draft", null), { error: { message: "Items of a claim that was ever submitted are kept", code: "P0001" } as never });
    script("reimbursement_files", { data: [] });
    expect(await removeClaimItem({ itemId: ITEM, personId: OWNER })).toEqual({
      ok: false,
      error: "This claim was submitted before, so its receipts are kept for ten years: remove this one with a reason instead.",
    });
  });

  it("marks it removed on a sent-back or withdrawn claim, with who and why, and keeps the row and its documents", async () => {
    for (const status of ["sent_back", "draft"]) {
      resetFake();
      script("reimbursement_claim_items", ownItem(status, SUBMITTED_ONCE), { data: [{ id: ITEM }] });
      expect(await markClaimItemRemoved({ itemId: ITEM, personId: OWNER, reason: "  Charged twice; the other receipt is right.  " })).toEqual({ ok: true });
      const writes = calls.filter((c) => c.ops[0] !== "select");
      expect(writes.map((c) => [c.table, c.ops[0]])).toEqual([["reimbursement_claim_items", "update"]]);
      expect(writes[0].payloads[0]).toMatchObject({ removed_by: OWNER, remove_reason: "Charged twice; the other receipt is right." });
      expect(writes[0].filters).toEqual(expect.arrayContaining([["eq", "id", ITEM], ["eq", "claim_id", CLAIM], ["is", "removed_at", null]]));
      expect(storageCalls).toHaveLength(0);
      expect(audits.at(-1)).toMatchObject({ table: "reimbursement_claim_items", recordId: ITEM, operation: "update", context: { claimId: CLAIM, move: "remove_item" } });
    }
  });

  it("needs a reason to mark it removed", async () => {
    expect(await markClaimItemRemoved({ itemId: ITEM, personId: OWNER, reason: "   " })).toEqual({ ok: false, error: "Say why you are removing this receipt." });
    expect(calls).toHaveLength(0);
  });

  it("refuses to mark it on a draft never submitted (delete it instead), or once the claim has left the owner", async () => {
    script("reimbursement_claim_items", ownItem("draft", null));
    expect(await markClaimItemRemoved({ itemId: ITEM, personId: OWNER, reason: "Wrong trip" })).toEqual({
      ok: false,
      error: "This draft was never submitted, so the receipt can simply be deleted.",
    });
    script("reimbursement_claim_items", ownItem("submitted", SUBMITTED_ONCE));
    expect(await markClaimItemRemoved({ itemId: ITEM, personId: OWNER, reason: "Wrong trip" })).toEqual({ ok: false, error: "This claim is submitted. Withdraw it to change it." });
    expect(calls.filter((c) => c.ops[0] !== "select")).toHaveLength(0);
  });

  it("refuses to mark a receipt already removed, and to edit one", async () => {
    script("reimbursement_claim_items", ownItem("sent_back", SUBMITTED_ONCE, "2026-10-06T03:00:00Z"));
    expect(await markClaimItemRemoved({ itemId: ITEM, personId: OWNER, reason: "Wrong trip" })).toEqual({ ok: false, error: "That receipt is already removed." });
    script("reimbursement_claim_items", ownItem("sent_back", SUBMITTED_ONCE, "2026-10-06T03:00:00Z"));
    expect(await updateClaimItem({ itemId: ITEM, personId: OWNER, item: { ...aud, currency: "vnd", amount: 1000, boughtInVietnam: true } })).toEqual({
      ok: false,
      error: "This receipt was removed from the claim, so it stays as it was.",
    });
    expect(calls.filter((c) => c.ops[0] !== "select")).toHaveLength(0);
  });
});

// A removed item needs nothing and blocks nothing; a replaced document
// satisfies nothing. Read with only the selected columns, so a read that stops
// selecting `removed_at` or `replaced_at` counts the row again, and fails here.
describe("the rules' reads leave removed items and replaced documents out", () => {
  beforeEach(() => answerOnlySelectedColumns());

  it("loadSubmitItems hands canSubmit each item's removal and each document's replacement", async () => {
    script("reimbursement_claim_items", {
      data: [
        { id: "i1", seller: "Grab", description: null, bought_on: null, category: "transport", currency: "vnd", amount_cents: 126000, bought_in_vietnam: true, lost_receipt_note: null, removed_at: null },
        { id: "i2", seller: "Taxi", description: null, bought_on: null, category: "other", currency: "vnd", amount_cents: 0, bought_in_vietnam: true, lost_receipt_note: null, removed_at: "2026-10-06T03:00:00Z" },
      ],
    });
    script("reimbursement_files", {
      data: [{ claim_item_id: "i1", kind: "red_invoice", mime_type: "application/pdf", confirmed_at: "2026-10-05T03:00:00Z", replaced_at: "2026-10-06T03:00:00Z" }],
    });
    const loaded = await loadSubmitItems(CLAIM);
    expect(loaded).toMatchObject({
      ok: true,
      items: [
        // The category is read too: transport's invoice is optional (RB.15).
        { label: "Grab", category: "transport", removed: false, documents: [{ kind: "red_invoice", confirmed: true, replaced: true }] },
        { label: "Taxi", category: "other", removed: true, documents: [] },
      ],
    });
  });

  it("checkBlockedBy does not wait on the rate of a removed receipt, nor count it toward every receipt being declined", async () => {
    script("reimbursement_claim_items", {
      data: [
        { id: "i1", seller: "13cabs", description: null, bought_on: null, amount_vnd: null, declined_at: null, removed_at: "2026-10-06T03:00:00Z" },
        { id: "i2", seller: "Grab", description: null, bought_on: null, amount_vnd: 126000, declined_at: null, removed_at: null },
      ],
    });
    expect(await checkBlockedBy(CLAIM)).toBeNull();
  });
});

// The rebill tag on a claim item (design §1.1, RB.11): an optional mark that a
// client is to be billed for the receipt, with the company named. It is a tag
// for the export and nothing more, so it changes no amount and no rule; the
// one thing it insists on is a company when it is set, and no company when it
// is not, so a stale company never rides along on an untagged receipt.
const COMPANY = "0b7a2c8e-4c7e-4f8e-9a52-6a1f1b2c3d4e";
const base = { description: "Taxi", seller: "Grab", boughtOn: "2026-10-02", category: "transport" as const, amount: 126_000, currency: "vnd", boughtInVietnam: true, lostReceiptNote: "" };
const rebillInserts = () => calls.filter((c) => c.table === "reimbursement_claim_items" && c.ops[0] === "insert");


describe("ClaimItemInput's rebill tag", () => {
  it("is off unless the form sets it", () => {
    const parsed = ClaimItemInput.parse(base);
    expect(parsed).toMatchObject({ rebill: false, rebillCompanyId: null });
  });

  it("needs a company when it is set", () => {
    const parsed = ClaimItemInput.safeParse({ ...base, rebill: true, rebillCompanyId: "" });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0].message).toBe("Pick the client to rebill.");
  });

  it("drops the company when it is not set", () => {
    expect(ClaimItemInput.parse({ ...base, rebill: false, rebillCompanyId: COMPANY })).toMatchObject({ rebill: false, rebillCompanyId: null });
  });
});

// A note explains a receipt lost abroad. An item bought in Vietnam has no room
// for one, a ride included: RB.16 took the own-driver note away (Mai).
describe("ClaimItemInput's note on an item bought in Vietnam", () => {
  it("refuses a note on a ride bought in Vietnam", () => {
    const parsed = ClaimItemInput.safeParse({ ...base, lostReceiptNote: "Own driver" });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0].message).toBe("A lost receipt can be explained only for something bought abroad.");
  });

  it("refuses a lost-receipt note on anything else bought in Vietnam", () => {
    const parsed = ClaimItemInput.safeParse({ ...base, category: "meals_travel", lostReceiptNote: "Lost it." });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0].message).toBe("A lost receipt can be explained only for something bought abroad.");
  });
});

describe("addClaimItem with the rebill tag", () => {
  it("stores the rebill tag and its company on the item", async () => {
    script("reimbursement_claims", { data: { id: "claim-1", status: "draft", person_id: OWNER, title: "Trip", submitted_at: null } });
    script("reimbursement_claim_items", { data: [] }, { data: { id: "item-1" } });
    const added = await addClaimItem({ claimId: "claim-1", personId: OWNER, item: { ...base, rebill: true, rebillCompanyId: COMPANY } });
    expect(added).toEqual({ ok: true, id: "item-1" });
    expect(rebillInserts()[0].payloads[0]).toMatchObject({ rebill: true, rebill_company_id: COMPANY, amount_vnd: 126_000 });
  });
});

describe("enterItemRateByHand on a removed receipt", () => {
  it("refuses: a receipt its owner removed counts toward nothing and needs no rate", async () => {
    script("reimbursement_claim_items", { data: { id: ITEM, currency: "aud", amount_cents: 6280, bought_on: "2026-10-03", charged_vnd: null, removed_at: "2026-10-06T03:00:00Z" } });
    const row = { id: CLAIM, status: "submitted" as const, personId: OWNER, title: "Melbourne", submittedAt: "2026-10-05T03:00:00Z" };
    const actor = { kind: "checker" as const, personId: "person-finance", mayDecideOwn: false, label: "Finley" };
    expect(await enterItemRateByHand({ row, itemId: ITEM, actor, rate: "18,426" })).toEqual({ ok: false, error: "Its owner removed this receipt, so it needs no rate." });
    expect(itemUpdate()).toBeUndefined();
  });
});
