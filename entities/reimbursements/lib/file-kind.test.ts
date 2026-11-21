import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// RB.26.6: the AI's read of what a file is, is a default; its owner can change
// it in Edit (Khoa, 2026-11-06: "not allowing human override is dumb"). Driven
// on the kernel's fake; the reader is stubbed.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const audits: Record<string, unknown>[] = [];
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: async (a: Record<string, unknown>) => void audits.push(a) }));
const readReceipt = vi.hoisted(() => vi.fn());
vi.mock("./receipt-reading", () => ({ readReceipt }));

const { kindRefusal, refileDocument } = await import("./file-kind");

const CLAIM = "11111111-1111-4111-8111-111111111111";
const ITEM = "22222222-2222-4222-8222-222222222222";
const FILE = "33333333-3333-4333-8333-333333333333";
const OWNER = "person-a";
const claim = (status = "draft") => ({ id: CLAIM, status, person_id: OWNER, title: "Claude November", submitted_at: status === "draft" ? null : "2026-11-01T03:00:00Z" });
// The owner's gate reads the file with its item's claim; the facts read the item and its documents.
const gate = (kind: string, c = claim()) => ({ id: FILE, kind, storage_path: "p", filename: "IMG.jpeg", confirmed_at: "2026-11-06T00:00:00Z", claim_item_id: ITEM, reimbursement_claim_items: { reimbursement_claims: c } });
const doc = (id: string, kind: string, mime = "image/jpeg") => ({ id, kind, mime_type: mime, replaced_at: null });

function scriptRefile(input: { kind: string; currency?: string; docs: Record<string, unknown>[]; removed?: boolean }) {
  script("reimbursement_files", { data: gate(input.kind) }, { data: input.docs });
  script("reimbursement_claim_items", { data: { currency: input.currency ?? "vnd", removed_at: input.removed ? "2026-11-02T00:00:00Z" : null } });
}

beforeEach(() => {
  resetFake();
  audits.length = 0;
  readReceipt.mockReset().mockResolvedValue({ ok: true, reading: null, flags: [] });
});

describe("kindRefusal", () => {
  const photo = { id: FILE, kind: "receipt", mimeType: "image/jpeg" };

  it("lets a photo read as a receipt become a bank deduction on its own", () => {
    expect(kindRefusal({ file: photo, kind: "bank_deduction", currency: "vnd", others: [] })).toBeNull();
  });

  it("refuses a photo as a red invoice, and a red invoice abroad", () => {
    expect(kindRefusal({ file: photo, kind: "red_invoice", currency: "vnd", others: [] })).toMatch(/must be a PDF/);
    expect(kindRefusal({ file: { ...photo, mimeType: "application/pdf" }, kind: "red_invoice", currency: "usd", others: [] })).toMatch(/bought in Vietnam/);
  });

  it("refuses a bank deduction beside a dong receipt, which is its own value", () => {
    expect(kindRefusal({ file: photo, kind: "bank_deduction", currency: "vnd", others: [{ kind: "receipt" }] })).toMatch(/paid in another currency/);
    expect(kindRefusal({ file: photo, kind: "bank_deduction", currency: "usd", others: [{ kind: "receipt" }] })).toBeNull();
  });

  it("refuses a second bank deduction on one receipt", () => {
    expect(kindRefusal({ file: photo, kind: "bank_deduction", currency: "usd", others: [{ kind: "receipt" }, { kind: "bank_deduction" }] })).toMatch(/already has its bank deduction/);
  });
});

describe("refileDocument", () => {
  it("refiles the owner's file as they say, guarded on its old kind, and audits it", async () => {
    scriptRefile({ kind: "receipt", docs: [doc(FILE, "receipt")] });
    script("reimbursement_files", { data: [{ id: FILE }] });
    expect(await refileDocument({ personId: OWNER, fileId: FILE, kind: "bank_deduction" })).toEqual({ ok: true });
    const update = calls.find((c) => c.table === "reimbursement_files" && c.ops[0] === "update");
    expect(update?.payloads[0]).toEqual({ kind: "bank_deduction" });
    expect(update?.filters).toEqual(expect.arrayContaining([["eq", "id", FILE], ["eq", "kind", "receipt"]]));
    expect(audits[0]).toMatchObject({ table: "reimbursement_files", recordId: FILE, oldData: { kind: "receipt" }, newData: { kind: "bank_deduction" } });
  });

  it("changes nothing when the kind is already the one asked for", async () => {
    scriptRefile({ kind: "receipt", docs: [doc(FILE, "receipt")] });
    expect(await refileDocument({ personId: OWNER, fileId: FILE, kind: "receipt" })).toEqual({ ok: true });
    expect(calls.some((c) => c.ops[0] === "update")).toBe(false);
  });

  it("has a PDF filed as a red invoice read there, where its buyer is checked", async () => {
    scriptRefile({ kind: "receipt", docs: [doc(FILE, "receipt", "application/pdf")] });
    script("reimbursement_files", { data: [{ id: FILE }] });
    expect(await refileDocument({ personId: OWNER, fileId: FILE, kind: "red_invoice" })).toEqual({ ok: true });
    expect(readReceipt).toHaveBeenCalledWith(FILE, { onlyIfUnread: true });
  });

  it("refuses a photo as a red invoice, and writes nothing", async () => {
    scriptRefile({ kind: "receipt", docs: [doc(FILE, "receipt")] });
    expect(await refileDocument({ personId: OWNER, fileId: FILE, kind: "red_invoice" })).toEqual({
      ok: false,
      error: "A red invoice must be a PDF: the seller's e-invoice, or a scan saved as PDF. A photo is a receipt.",
    });
    expect(calls.some((c) => c.ops[0] === "update")).toBe(false);
  });

  it("refuses a file on a removed receipt", async () => {
    scriptRefile({ kind: "receipt", docs: [doc(FILE, "receipt")], removed: true });
    expect((await refileDocument({ personId: OWNER, fileId: FILE, kind: "bank_deduction" })).ok).toBe(false);
  });

  it("refuses on a claim that is not the owner's to change", async () => {
    script("reimbursement_files", { data: gate("receipt", claim("submitted")) });
    expect((await refileDocument({ personId: OWNER, fileId: FILE, kind: "bank_deduction" })).ok).toBe(false);
    expect(calls.some((c) => c.ops[0] === "update")).toBe(false);
  });
});
