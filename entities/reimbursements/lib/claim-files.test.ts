import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script, scriptStorage, storageCalls, timeline } from "@/kernel/data/testing/fake-company-os";

// Upload then confirm (design §1.4). Nothing the browser says about a file is
// trusted: confirm reads the stored object's size, type and bytes, refuses a
// red invoice that is not a PDF and removes it, and records the object's own
// sha256. Scripted on the kernel's fake, database and storage both.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: async () => {} }));
// The fake keeps filters but not the selected columns, and a checker's reads
// filter on an embedded table: without `!inner` PostgREST narrows the embed,
// not the file, so a file of ANOTHER claim would still come back and be
// signed. The real reads stay; this only records what each one selected.
const selectedFiles = vi.hoisted(() => [] as string[]);
vi.mock("./reads", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./reads")>();
  return { ...actual, selectReimbursementFiles: (columns: string) => (selectedFiles.push(columns), actual.selectReimbursementFiles(columns)) };
});

import { bytesMatchType, confirmReceiptUpload, markReceiptFileReplaced, removeReceiptFile, signClaimDocumentDownload, signClaimDocuments, startReceiptUpload } from "./claim-files";

const OWNER = "person-a";
const claim = (status = "draft") => ({ id: "claim-1", status, person_id: OWNER, title: "Trip", submitted_at: null });
const PDF = new TextEncoder().encode("%PDF-1.7\n%âãÏÓ\n1 0 obj");
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
const fileRow = (kind: string) => ({
  data: {
    id: "file-1",
    kind,
    storage_path: "claim/claim-1/item-1/file-1-invoice.pdf",
    filename: "invoice.pdf",
    confirmed_at: null,
    claim_item_id: "item-1",
    reimbursement_claim_items: { reimbursement_claims: claim() },
  },
});
const fileWrites = () => calls.filter((c) => c.table === "reimbursement_files" && c.ops[0] !== "select");

beforeEach(() => {
  resetFake();
  selectedFiles.length = 0;
});

describe("bytesMatchType", () => {
  it("knows a PDF and the photo types by their first bytes", () => {
    expect(bytesMatchType("application/pdf", PDF)).toBe(true);
    expect(bytesMatchType("application/pdf", JPEG)).toBe(false);
    expect(bytesMatchType("image/jpeg", JPEG)).toBe(true);
    expect(bytesMatchType("image/png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
    expect(bytesMatchType("image/png", JPEG)).toBe(false);
    expect(bytesMatchType("image/heic", new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]))).toBe(true);
    expect(bytesMatchType("text/html", new TextEncoder().encode("<html>"))).toBe(false);
  });
});

describe("startReceiptUpload", () => {
  it("writes an unconfirmed row under the claim's folder and hands back a signed token", async () => {
    script("reimbursement_claim_items", { data: { id: "item-1", reimbursement_claims: claim() } });
    script("reimbursement_files", { count: 0 }, { data: null });
    scriptStorage("createSignedUploadUrl", { data: { token: "tok" } });
    const result = await startReceiptUpload({ itemId: "item-1", kind: "red_invoice", personId: OWNER, declared: { name: "HĐ 0831.pdf", size: 1000, type: "application/pdf" } });
    expect(result).toMatchObject({ ok: true, bucket: "reimbursement-receipts", token: "tok" });
    const insert = fileWrites()[0];
    const row = insert.payloads[0] as Record<string, unknown>;
    expect(row).toMatchObject({ kind: "red_invoice", claim_item_id: "item-1", filename: "HĐ 0831.pdf", uploaded_by: OWNER });
    expect(row).not.toHaveProperty("confirmed_at");
    expect(String(row.storage_path)).toMatch(/^claim\/claim-1\/item-1\/[0-9a-f-]{36}-H-0831\.pdf$/);
  });

  it("refuses a red invoice that is not declared as a PDF before writing anything", async () => {
    script("reimbursement_claim_items", { data: { id: "item-1", reimbursement_claims: claim() } });
    const result = await startReceiptUpload({ itemId: "item-1", kind: "red_invoice", personId: OWNER, declared: { name: "invoice.jpg", size: 1000, type: "image/jpeg" } });
    expect(result).toEqual({ ok: false, error: "A red invoice must be a PDF: the seller's e-invoice, or a scan saved as PDF. A photo is a receipt." });
    expect(fileWrites()).toHaveLength(0);
  });

  it("refuses an upload to a receipt its owner removed: it stays on the claim as it was", async () => {
    script("reimbursement_claim_items", { data: { id: "item-1", removed_at: "2026-10-06T03:00:00Z", reimbursement_claims: { ...claim("sent_back"), submitted_at: "2026-10-01T00:00:00Z" } } });
    const result = await startReceiptUpload({ itemId: "item-1", kind: "receipt", personId: OWNER, declared: { name: "a.jpg", size: 10, type: "image/jpeg" } });
    expect(result).toEqual({ ok: false, error: "This receipt was removed from the claim. Add a new receipt instead." });
    expect(fileWrites()).toHaveLength(0);
  });

  it("refuses an upload to a claim that is no longer the owner's to change", async () => {
    script("reimbursement_claim_items", { data: { id: "item-1", reimbursement_claims: { ...claim("submitted"), submitted_at: "2026-10-01T00:00:00Z" } } });
    const result = await startReceiptUpload({ itemId: "item-1", kind: "receipt", personId: OWNER, declared: { name: "a.jpg", size: 10, type: "image/jpeg" } });
    expect(result).toEqual({ ok: false, error: "This claim is submitted. Withdraw it to change it." });
  });
});

describe("confirmReceiptUpload", () => {
  it("confirms a red invoice that is a PDF, recording the stored size, type and sha256", async () => {
    script("reimbursement_files", fileRow("red_invoice"), { data: [{ id: "file-1" }] });
    scriptStorage("info", { data: { size: PDF.length, contentType: "application/pdf" } });
    scriptStorage("download", { data: new Blob([PDF]) });
    expect(await confirmReceiptUpload({ fileId: "file-1", personId: OWNER })).toEqual({ ok: true });
    const update = fileWrites()[0];
    expect(update.ops[0]).toBe("update");
    const patch = update.payloads[0] as Record<string, unknown>;
    expect(patch).toMatchObject({ size_bytes: PDF.length, mime_type: "application/pdf" });
    expect(String(patch.sha256)).toMatch(/^[0-9a-f]{64}$/);
    expect(typeof patch.confirmed_at).toBe("string");
  });

  // The row goes first, guarded on still being unconfirmed (an unconfirmed
  // row is always deletable, 20261008090000), and the object only once the
  // row went: a confirm that landed in between keeps both.
  it("refuses a red invoice whose bytes are not a PDF, and removes its row and then the object", async () => {
    script("reimbursement_files", fileRow("red_invoice"), { data: [{ id: "file-1" }] });
    scriptStorage("info", { data: { size: JPEG.length, contentType: "application/pdf" } });
    scriptStorage("download", { data: new Blob([JPEG]) });
    scriptStorage("remove", { data: [] });
    const result = await confirmReceiptUpload({ fileId: "file-1", personId: OWNER });
    expect(result).toEqual({ ok: false, error: "invoice.pdf is not a PDF. A red invoice must be the PDF itself, not a photo of it." });
    expect(storageCalls.filter((c) => c.op === "remove").map((c) => c.args[0])).toEqual([["claim/claim-1/item-1/file-1-invoice.pdf"]]);
    const removed = storageCalls.filter((c) => c.op === "remove").map((c) => ({ at: c.resolvedAt as number, label: "storage:remove" }));
    expect(timeline(removed).filter((l) => l !== "reimbursement_files:select")).toEqual(["reimbursement_files:delete", "storage:remove"]);
    expect(fileWrites()[0].filters).toEqual(expect.arrayContaining([["eq", "id", "file-1"], ["is", "confirmed_at", null]]));
  });

  it("keeps the object when the row was not removed: a confirm landed first, or the delete failed", async () => {
    script("reimbursement_files", fileRow("red_invoice"), { data: [] });
    scriptStorage("info", { data: { size: JPEG.length, contentType: "application/pdf" } });
    scriptStorage("download", { data: new Blob([JPEG]) });
    await confirmReceiptUpload({ fileId: "file-1", personId: OWNER });
    expect(storageCalls.filter((c) => c.op === "remove")).toHaveLength(0);
  });

  it("says the file has not arrived when the storage has nothing yet, and keeps the row", async () => {
    script("reimbursement_files", fileRow("receipt"));
    scriptStorage("info", { data: null, error: { message: "Object not found" } });
    expect(await confirmReceiptUpload({ fileId: "file-1", personId: OWNER })).toEqual({ ok: false, error: "The file hasn't arrived yet. Try again in a moment." });
    expect(fileWrites()).toHaveLength(0);
  });
});

// Plan §10, 20261008090000: a document of a claim that was ever submitted is
// never deleted; the owner marks it replaced, and it stays beside its item,
// shown as replaced, satisfying nothing. Only a draft never submitted deletes
// one. An upload never confirmed was never a document, so cancel clears it
// anywhere (discard, above).
describe("taking a document off a claim", () => {
  const SUBMITTED_ONCE = "2026-10-01T00:00:00Z";
  const ownFile = (status: string, submitted_at: string | null, confirmed_at: string | null = "2026-10-01T00:00:00Z") => ({
    data: { ...fileRow("red_invoice").data, confirmed_at, reimbursement_claim_items: { reimbursement_claims: { ...claim(status), submitted_at } } },
  });
  const KEPT = "This claim was submitted before, so its documents are kept for ten years: mark this one replaced instead, then add the new one.";

  it("deletes a document from a draft never submitted, the row before its object", async () => {
    script("reimbursement_files", ownFile("draft", null), { data: [{ id: "file-1" }] });
    scriptStorage("remove", { data: [] });
    expect(await removeReceiptFile({ fileId: "file-1", personId: OWNER })).toEqual({ ok: true });
    expect(fileWrites().map((c) => c.ops[0])).toEqual(["delete"]);
    expect(storageCalls.map((c) => c.args[0])).toEqual([["claim/claim-1/item-1/file-1-invoice.pdf"]]);
  });

  it("refuses to delete a confirmed document of a claim that was ever submitted, and writes nothing", async () => {
    for (const status of ["sent_back", "draft"]) {
      resetFake();
      script("reimbursement_files", ownFile(status, SUBMITTED_ONCE));
      expect(await removeReceiptFile({ fileId: "file-1", personId: OWNER })).toEqual({ ok: false, error: KEPT });
      expect(fileWrites()).toHaveLength(0);
      expect(storageCalls).toHaveLength(0);
    }
  });

  it("says the same when the database refuses the delete", async () => {
    script("reimbursement_files", ownFile("draft", null), { error: { message: "Documents of a claim that was ever submitted are kept", code: "P0001" } as never });
    expect(await removeReceiptFile({ fileId: "file-1", personId: OWNER })).toEqual({ ok: false, error: KEPT });
    expect(storageCalls).toHaveLength(0);
  });

  it("marks a document replaced on a sent-back or withdrawn claim, with who, keeping the row and the object", async () => {
    for (const status of ["sent_back", "draft"]) {
      resetFake();
      script("reimbursement_files", ownFile(status, SUBMITTED_ONCE), { data: [{ id: "file-1" }] });
      expect(await markReceiptFileReplaced({ fileId: "file-1", personId: OWNER })).toEqual({ ok: true });
      const [write] = fileWrites();
      expect(write.ops[0]).toBe("update");
      expect(write.payloads[0]).toMatchObject({ replaced_by: OWNER });
      expect(typeof (write.payloads[0] as Record<string, unknown>).replaced_at).toBe("string");
      expect(write.filters).toEqual(expect.arrayContaining([["eq", "id", "file-1"], ["is", "replaced_at", null], ["not", "confirmed_at", "is", null]]));
      expect(storageCalls).toHaveLength(0);
    }
  });

  it("refuses to mark one on a draft never submitted, one not yet uploaded, or one already replaced", async () => {
    script("reimbursement_files", ownFile("draft", null));
    expect(await markReceiptFileReplaced({ fileId: "file-1", personId: OWNER })).toEqual({ ok: false, error: "This draft was never submitted, so the document can simply be removed." });
    script("reimbursement_files", ownFile("sent_back", SUBMITTED_ONCE, null));
    expect(await markReceiptFileReplaced({ fileId: "file-1", personId: OWNER })).toEqual({ ok: false, error: "That file hasn't finished uploading." });
    script("reimbursement_files", ownFile("sent_back", SUBMITTED_ONCE), { data: [] });
    expect(await markReceiptFileReplaced({ fileId: "file-1", personId: OWNER })).toEqual({ ok: false, error: "That document is already replaced." });
  });
});

describe("signClaimDocuments (the checker's view)", () => {
  it("signs an inline link for each confirmed receipt and red invoice of the claim, never a bank receipt", async () => {
    script("reimbursement_files", {
      data: [
        { id: "file-1", storage_path: "claim/claim-1/item-1/file-1-grab.jpg", mime_type: "image/jpeg" },
        { id: "file-2", storage_path: "claim/claim-1/item-2/file-2-invoice.pdf", mime_type: "application/pdf" },
      ],
    });
    scriptStorage("createSignedUrls", {
      data: [
        { path: "claim/claim-1/item-1/file-1-grab.jpg", signedUrl: "https://store.test/1", error: null },
        { path: "claim/claim-1/item-2/file-2-invoice.pdf", signedUrl: "https://store.test/2", error: null },
      ],
    });
    const signed = await signClaimDocuments("claim-1");
    expect(signed.get("file-1")).toEqual({ url: "https://store.test/1", mimeType: "image/jpeg" });
    expect(signed.get("file-2")).toEqual({ url: "https://store.test/2", mimeType: "application/pdf" });
    const [read] = calls.filter((c) => c.table === "reimbursement_files");
    expect(read.filters).toEqual(
      expect.arrayContaining([
        ["eq", "reimbursement_claim_items.claim_id", "claim-1"],
        ["not", "confirmed_at", "is", null],
        ["in", "kind", ["receipt", "red_invoice"]],
      ]),
    );
    expect(selectedFiles).toEqual([expect.stringContaining("reimbursement_claim_items!inner(claim_id)")]);
    // Inline, not a download: the receipt is shown beside its line.
    expect(storageCalls[0].args).toEqual([["claim/claim-1/item-1/file-1-grab.jpg", "claim/claim-1/item-2/file-2-invoice.pdf"], 60]);
  });

  it("signs nothing for a claim with no documents, and a failed read raises rather than showing no receipts", async () => {
    script("reimbursement_files", { data: [] });
    expect((await signClaimDocuments("claim-1")).size).toBe(0);
    expect(storageCalls).toHaveLength(0);
    script("reimbursement_files", { error: { message: "db down" } });
    await expect(signClaimDocuments("claim-1")).rejects.toThrow();
  });
});

// The only way a checker sees a PDF (every red invoice is one, RB.2): the
// page shows photos inline and opens everything else through this link,
// signed when the checker clicks (OpenDocument → openClaimFile → here).
describe("signClaimDocumentDownload (opening a red invoice)", () => {
  const PATH = "claim/claim-1/item-3/file-3-HD-0831.pdf";

  it("signs a fresh link to that one document at its own stored path, only when it is a confirmed receipt or red invoice of the claim named", async () => {
    script("reimbursement_files", { data: { storage_path: PATH, filename: "HĐ 0831.pdf" } });
    scriptStorage("createSignedUrl", { data: { signedUrl: "https://store.test/3" } });
    expect(await signClaimDocumentDownload({ claimId: "claim-1", fileId: "file-3" })).toEqual({ ok: true, url: "https://store.test/3" });
    const reads = calls.filter((c) => c.table === "reimbursement_files");
    expect(reads).toHaveLength(1);
    expect(reads[0].filters).toHaveLength(4);
    expect(reads[0].filters).toEqual(
      expect.arrayContaining([
        ["eq", "id", "file-3"],
        ["eq", "reimbursement_claim_items.claim_id", "claim-1"],
        ["not", "confirmed_at", "is", null],
        ["in", "kind", ["receipt", "red_invoice"]],
      ]),
    );
    expect(selectedFiles).toEqual([expect.stringContaining("reimbursement_claim_items!inner(claim_id)")]);
    // The stored object itself, for a minute, opened in the tab rather than
    // downloaded: no third argument.
    expect(storageCalls.map((c) => [c.bucket, c.op, c.args])).toEqual([["reimbursement-receipts", "createSignedUrl", [PATH, 60]]]);
  });

  it("signs nothing for a file that is not a confirmed document of that claim", async () => {
    script("reimbursement_files", { data: null });
    expect(await signClaimDocumentDownload({ claimId: "claim-1", fileId: "file-9" })).toEqual({ ok: false, error: "File not found." });
    expect(storageCalls).toHaveLength(0);
  });

  it("a failed read or a failed signing is a refusal the checker reads, never a link", async () => {
    script("reimbursement_files", { error: { message: "db down" } });
    expect(await signClaimDocumentDownload({ claimId: "claim-1", fileId: "file-3" })).toEqual({ ok: false, error: "Could not read the file: db down" });
    expect(storageCalls).toHaveLength(0);
    script("reimbursement_files", { data: { storage_path: PATH, filename: "HĐ 0831.pdf" } });
    scriptStorage("createSignedUrl", { error: { message: "storage down" } });
    expect(await signClaimDocumentDownload({ claimId: "claim-1", fileId: "file-3" })).toEqual({ ok: false, error: "Could not open the file. Try again." });
  });
});
