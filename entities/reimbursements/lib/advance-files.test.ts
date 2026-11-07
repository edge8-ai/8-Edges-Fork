import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script, scriptStorage, storageCalls } from "@/kernel/data/testing/fake-company-os";

// Upload then confirm, as on a claim. Nothing the browser says about a file is trusted:
// confirm reads the stored object's size, type and bytes, and a file that is not what it
// says is refused and removed. A file that was part of what the approver read is kept.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: async () => {} }));

import { cancelAdvanceUpload, confirmAdvanceUpload, removeAdvanceEvidence, signAdvanceEvidence, signAdvanceFile, startAdvanceUpload } from "./advance-files";

const PDF = new TextEncoder().encode("%PDF-1.7\n%âãÏÓ\n1 0 obj");
const blob = (bytes: Uint8Array) => ({ arrayBuffer: async () => bytes.slice().buffer });
const fileRow = (over: Record<string, unknown> = {}) => ({ data: { id: "file-1", storage_path: "advance/advance-1/file-1-q.pdf", filename: "q.pdf", kind: "evidence", confirmed_at: null, ...over } });
const declared = { name: "venue quote.pdf", size: 1000, type: "application/pdf" };
const updates = () => calls.filter((c) => c.ops[0] === "update").map((c) => c.payloads[0] as Record<string, unknown>);
const deletes = () => calls.filter((c) => c.ops[0] === "delete");
const removed = () => storageCalls.filter((c) => c.op === "remove").map((c) => c.args[0]);

beforeEach(() => {
  resetFake();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("startAdvanceUpload", () => {
  const start = (kind: "evidence" | "bank_receipt", status: Parameters<typeof startAdvanceUpload>[0]["advance"]["status"], over = {}) =>
    startAdvanceUpload({ advance: { id: "advance-1", status }, kind, personId: "person-a", declared: { ...declared, ...over } });

  it("inserts an unconfirmed row under the advance's folder and hands back a token", async () => {
    script("reimbursement_advance_files", { data: null });
    scriptStorage("createSignedUploadUrl", { data: { token: "tok" } });
    const result = await start("evidence", "draft");
    expect(result).toMatchObject({ ok: true, token: "tok", bucket: "reimbursement-receipts" });
    const row = calls[0].payloads[0] as Record<string, unknown>;
    expect(row).toMatchObject({ advance_id: "advance-1", kind: "evidence", filename: "venue quote.pdf", uploaded_by: "person-a" });
    expect(row.confirmed_at).toBeUndefined();
    expect(String(row.storage_path)).toMatch(/^advance\/advance-1\/[0-9a-f-]+-venue-quote\.pdf$/);
  });

  it("takes evidence only while the advance is the owner's to change", async () => {
    for (const status of ["submitted", "approved", "paid_out"] as const) expect((await start("evidence", status)).ok).toBe(false);
    expect(calls).toEqual([]);
  });

  it("takes a bank receipt only while money is moving", async () => {
    for (const status of ["draft", "submitted", "paid_out", "settled"] as const) expect((await start("bank_receipt", status)).ok).toBe(false);
    expect(calls).toEqual([]);
  });

  it("refuses a type that can run script, and a file over the limit, before writing", async () => {
    expect((await start("evidence", "draft", { type: "text/html" })).ok).toBe(false);
    expect((await start("evidence", "draft", { type: "image/svg+xml" })).ok).toBe(false);
    expect((await start("evidence", "draft", { size: 26_214_401 })).ok).toBe(false);
    expect(calls).toEqual([]);
  });

  it("takes its row back when no token can be had", async () => {
    script("reimbursement_advance_files", { data: null }, { data: null });
    scriptStorage("createSignedUploadUrl", { data: null, error: { message: "down" } });
    expect((await start("evidence", "draft")).ok).toBe(false);
    expect(deletes()).toHaveLength(1);
  });
});

describe("confirmAdvanceUpload", () => {
  const confirm = () => confirmAdvanceUpload({ advanceId: "advance-1", fileId: "file-1", onlyKind: "evidence", status: "draft" });

  it("discards evidence that finishes after the request was sent, so it never sits beside what the approver read", async () => {
    script("reimbursement_advance_files", fileRow(), { data: [{ id: "file-1" }] });
    scriptStorage("remove", { data: [] });
    const late = await confirmAdvanceUpload({ advanceId: "advance-1", fileId: "file-1", onlyKind: "evidence", status: "approved" });
    expect(late.ok).toBe(false);
    expect(updates()).toEqual([]);
    expect(deletes().length).toBe(1);
  });

  it("leaves evidence already confirmed alone when it is confirmed again later", async () => {
    script("reimbursement_advance_files", fileRow({ confirmed_at: "t" }));
    expect(await confirmAdvanceUpload({ advanceId: "advance-1", fileId: "file-1", onlyKind: "evidence", status: "approved" })).toEqual({ ok: true });
    expect(deletes()).toEqual([]);
  });

  it("records what actually arrived, with its own hash", async () => {
    script("reimbursement_advance_files", fileRow(), { data: [{ id: "file-1" }] });
    scriptStorage("info", { data: { size: 2048, contentType: "application/pdf" } });
    scriptStorage("download", { data: blob(PDF) });
    expect(await confirm()).toEqual({ ok: true });
    expect(updates()[0]).toMatchObject({ size_bytes: 2048, mime_type: "application/pdf", sha256: expect.stringMatching(/^[0-9a-f]{64}$/), confirmed_at: expect.any(String) });
    const update = calls.find((c) => c.ops[0] === "update");
    expect(update?.filters).toEqual(expect.arrayContaining([["is", "confirmed_at", null]]));
  });

  it("refuses and removes a file that is not what it says, row before object", async () => {
    script("reimbursement_advance_files", fileRow(), { data: [{ id: "file-1" }] });
    scriptStorage("info", { data: { size: 10, contentType: "application/pdf" } });
    scriptStorage("download", { data: blob(new TextEncoder().encode("<html>not a pdf")) });
    scriptStorage("remove", { data: [] });
    const result = await confirm();
    expect(result.ok === false && result.error).toContain("q.pdf");
    expect(updates()).toEqual([]);
    expect(deletes()).toHaveLength(1);
    expect(removed()).toEqual([["advance/advance-1/file-1-q.pdf"]]);
  });

  it("keeps a real file when the storage read fails: not checked yet, never not a document", async () => {
    script("reimbursement_advance_files", fileRow());
    scriptStorage("info", { data: { size: 10, contentType: "application/pdf" } });
    scriptStorage("download", { data: null, error: { message: "down" } });
    expect((await confirm()).ok).toBe(false);
    expect(deletes()).toEqual([]);
    expect(removed()).toEqual([]);
  });

  it("says to wait when the object has not arrived", async () => {
    script("reimbursement_advance_files", fileRow());
    scriptStorage("info", { data: null, error: { message: "not found" } });
    expect((await confirm()).ok).toBe(false);
    expect(deletes()).toEqual([]);
  });

  it("answers ok on a second confirm, writing nothing", async () => {
    script("reimbursement_advance_files", fileRow({ confirmed_at: "2026-11-04T00:00:00Z" }));
    expect(await confirm()).toEqual({ ok: true });
    expect(storageCalls).toEqual([]);
  });

  it("refuses a file of another advance", async () => {
    script("reimbursement_advance_files", { data: null });
    expect((await confirm()).ok).toBe(false);
    expect(calls[0].filters).toEqual(expect.arrayContaining([["eq", "advance_id", "advance-1"]]));
  });
});

describe("cancelAdvanceUpload", () => {
  it("clears an unfinished upload, and leaves a finished one alone", async () => {
    script("reimbursement_advance_files", fileRow(), { data: [{ id: "file-1" }] });
    scriptStorage("remove", { data: [] });
    expect(await cancelAdvanceUpload({ advanceId: "advance-1", fileId: "file-1", onlyKind: "evidence" })).toEqual({ ok: true });
    expect(deletes()).toHaveLength(1);

    resetFake();
    script("reimbursement_advance_files", fileRow({ confirmed_at: "t" }));
    expect(await cancelAdvanceUpload({ advanceId: "advance-1", fileId: "file-1", onlyKind: "evidence" })).toEqual({ ok: true });
    expect(deletes()).toEqual([]);
  });

  it("keeps the object when the row did not go, because a confirm landed in between", async () => {
    script("reimbursement_advance_files", fileRow(), { data: [] });
    expect(await cancelAdvanceUpload({ advanceId: "advance-1", fileId: "file-1", onlyKind: "evidence" })).toEqual({ ok: true });
    expect(removed()).toEqual([]);
  });
});

describe("removeAdvanceEvidence", () => {
  const remove = (status: "draft" | "sent_back" | "submitted", submittedAt: string | null) =>
    removeAdvanceEvidence({ advance: { id: "advance-1", status, submittedAt }, fileId: "file-1", personId: "person-a" });

  it("deletes it from a draft that was never submitted, row before object", async () => {
    script("reimbursement_advance_files", fileRow({ confirmed_at: "t" }), { data: null });
    scriptStorage("remove", { data: [] });
    expect(await remove("draft", null)).toEqual({ ok: true });
    expect(deletes()).toHaveLength(1);
    expect(removed()).toHaveLength(1);
  });

  it("marks it replaced once the approver has read it, and keeps the object", async () => {
    script("reimbursement_advance_files", fileRow({ confirmed_at: "t" }), { data: [{ id: "file-1" }] });
    expect(await remove("sent_back", "2026-11-03T02:00:00Z")).toEqual({ ok: true });
    expect(updates()[0]).toMatchObject({ replaced_at: expect.any(String), replaced_by: "person-a" });
    expect(deletes()).toEqual([]);
    expect(removed()).toEqual([]);
  });

  it("refuses while it is with the approver", async () => {
    script("reimbursement_advance_files", fileRow({ confirmed_at: "t" }));
    expect((await remove("submitted", "2026-11-03T02:00:00Z")).ok).toBe(false);
    expect(deletes()).toEqual([]);
  });

  it("never touches a bank receipt", async () => {
    script("reimbursement_advance_files", fileRow({ kind: "bank_receipt", confirmed_at: "t" }));
    expect(await remove("draft", null)).toEqual({ ok: false, error: "A bank receipt is kept." });
    expect(deletes()).toEqual([]);
  });
});

describe("signAdvanceEvidence", () => {
  it("signs the advance's finished evidence by file id, and asks for nothing else", async () => {
    script("reimbursement_advance_files", { data: [{ id: "f1", storage_path: "advance/advance-1/f1-q.png" }] });
    scriptStorage("createSignedUrls", { data: [{ path: "advance/advance-1/f1-q.png", signedUrl: "https://signed/1" }] });
    expect([...(await signAdvanceEvidence("advance-1")).entries()]).toEqual([["f1", "https://signed/1"]]);
    const filters = calls.filter((c) => c.table === "reimbursement_advance_files").flatMap((c) => c.filters);
    expect(filters).toEqual(expect.arrayContaining([["eq", "advance_id", "advance-1"], ["eq", "kind", "evidence"]]));
    expect(storageCalls[0].args[1]).toBe(60);
  });

  it("asks for no links when there are no files", async () => {
    script("reimbursement_advance_files", { data: [] });
    expect((await signAdvanceEvidence("advance-1")).size).toBe(0);
    expect(storageCalls).toHaveLength(0);
  });

  it("raises when it cannot read or sign, rather than showing a request with nothing behind it", async () => {
    script("reimbursement_advance_files", { data: null, error: { message: "down" } });
    await expect(signAdvanceEvidence("advance-1")).rejects.toThrow("down");
    script("reimbursement_advance_files", { data: [{ id: "f1", storage_path: "p" }] });
    scriptStorage("createSignedUrls", { data: null, error: { message: "store down" } });
    await expect(signAdvanceEvidence("advance-1")).rejects.toThrow("store down");
  });
});

describe("signAdvanceFile", () => {
  it("signs a finished file on this advance", async () => {
    script("reimbursement_advance_files", fileRow({ confirmed_at: "t" }));
    scriptStorage("createSignedUrl", { data: { signedUrl: "https://signed" } });
    expect(await signAdvanceFile({ advanceId: "advance-1", fileId: "file-1" })).toEqual({ ok: true, url: "https://signed" });
    expect(storageCalls[0].args[1]).toBe(60);
  });

  it("refuses an unfinished one", async () => {
    script("reimbursement_advance_files", fileRow());
    expect((await signAdvanceFile({ advanceId: "advance-1", fileId: "file-1" })).ok).toBe(false);
    expect(storageCalls).toEqual([]);
  });

  it("limited to one kind, a confirm or a cancel of another kind touches nothing", async () => {
    script("reimbursement_advance_files", fileRow({ kind: "evidence" }), fileRow({ kind: "evidence" }));
    expect(await confirmAdvanceUpload({ advanceId: "advance-1", fileId: "file-1", onlyKind: "bank_receipt" })).toEqual({ ok: false, error: "That file is no longer on this advance." });
    expect(await cancelAdvanceUpload({ advanceId: "advance-1", fileId: "file-1", onlyKind: "bank_receipt" })).toEqual({ ok: false, error: "That file is no longer on this advance." });
    expect(deletes()).toEqual([]);
    expect(storageCalls).toEqual([]);
  });

  it("limited to evidence, refuses a bank receipt in the words it uses for a missing file, and signs nothing", async () => {
    script("reimbursement_advance_files", fileRow({ confirmed_at: "t", kind: "bank_receipt" }));
    expect(await signAdvanceFile({ advanceId: "advance-1", fileId: "file-1", onlyKind: "evidence" })).toEqual({ ok: false, error: "That file is no longer on this advance." });
    expect(storageCalls).toEqual([]);
  });

  it("limited to evidence, signs evidence", async () => {
    script("reimbursement_advance_files", fileRow({ confirmed_at: "t", kind: "evidence" }));
    scriptStorage("createSignedUrl", { data: { signedUrl: "https://signed" } });
    expect(await signAdvanceFile({ advanceId: "advance-1", fileId: "file-1", onlyKind: "evidence" })).toEqual({ ok: true, url: "https://signed" });
  });
});
