import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, fakeSupabase, resetFake, script, scriptStorage, storageCalls } from "@/kernel/data/testing/fake-company-os";

// The document store's steps, tested once for every owner (RB.30). Each owner's own tests
// pin its policy: who may add which kind and when, and who may open one. Here the records
// are a stand-in table, "docs", so only the protocol is under test.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());

import { bytesMatchType, confirmUpload, discardUpload, openDocument, openDocuments, readDocumentBytes, removeDocument, startUpload, streamDocument, sweepUpload, type DocumentRecords } from "./document-store";

const PDF = new TextEncoder().encode("%PDF-1.7\n%âãÏÓ\n1 0 obj");
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
const blob = (bytes: Uint8Array) => ({ arrayBuffer: async () => bytes.slice().buffer });
const file = { id: "f1", path: "thing/t1/f1-a.pdf", filename: "a.pdf" };
const removed = () => storageCalls.filter((c) => c.op === "remove").map((c) => c.args[0]);
const ops = () => calls.map((c) => c.ops[0]);

const records: DocumentRecords = {
  countUnfinished: (since) => builderFor("docs").select("id", { count: "exact", head: true }).gte("created_at", since),
  dropUnfinished: (id) => builderFor("docs").delete().eq("id", id).is("confirmed_at", null).select("id") as never,
  saveConfirmed: (id, facts) => builderFor("docs").update(facts).eq("id", id).is("confirmed_at", null),
};
/** An owner whose rows are never deleted: it states no way to drop one. */
const keptRows: DocumentRecords = { countUnfinished: records.countUnfinished, saveConfirmed: records.saveConfirmed };
const start = (declared: Partial<{ name: string; size: number; type: string }> = {}) =>
  startUpload({
    records,
    insert: ({ id, path, filename }) => builderFor("docs").insert({ id, storage_path: path, filename }),
    folder: "thing/t1",
    holder: "advance",
    declared: { name: "My Receipt (1).pdf", size: 1000, type: "application/pdf", ...declared },
  });

beforeEach(() => {
  resetFake();
  vi.spyOn(console, "error").mockImplementation(() => {});
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

describe("startUpload", () => {
  it("writes an unconfirmed row under the owner's folder with a tidy name, and hands back a token", async () => {
    script("docs", { count: 0 }, { data: null });
    scriptStorage("createSignedUploadUrl", { data: { token: "tok" } });
    const result = await start();
    expect(result).toMatchObject({ ok: true, bucket: "reimbursement-receipts", token: "tok" });
    const row = calls.find((c) => c.ops[0] === "insert")?.payloads[0] as Record<string, unknown>;
    expect(row).toMatchObject({ filename: "My Receipt (1).pdf" });
    expect(String(row.storage_path)).toMatch(/^thing\/t1\/[0-9a-f-]{36}-My-Receipt-1-\.pdf$/);
  });

  it("refuses a type that can run script, before writing anything", async () => {
    expect(await start({ name: "x.svg", type: "image/svg+xml" })).toEqual({ ok: false, error: "x.svg can't be attached. Use a PDF or a photo (JPG, PNG, WebP or HEIC)." });
    expect((await start({ type: "text/html" })).ok).toBe(false);
    expect(calls).toEqual([]);
  });

  it("refuses a file over 25 MB, before writing anything", async () => {
    expect(await start({ name: "big.pdf", size: 26_214_401 })).toEqual({ ok: false, error: "big.pdf is over 25 MB. Export a smaller copy." });
    expect(calls).toEqual([]);
  });

  it("stops at 20 unfinished uploads from the last day, in the owner's words", async () => {
    script("docs", { count: 20 });
    expect(await start()).toEqual({ ok: false, error: "This advance has too many uploads that haven't finished. Wait a day, then try again." });
    expect(ops()).toEqual(["select"]);
    const since = Date.parse(String(calls[0].filters[0][2]));
    expect(Date.now() - since).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000 - 1000);
  });

  it("refuses when the count cannot be read, or came back with no count at all", async () => {
    script("docs", { error: { message: "down" } }, { data: null });
    expect(await start()).toEqual({ ok: false, error: "Could not start the upload. Try again." });
    // A count read that never asked the database to count answers null: that is not "none".
    expect(await start()).toEqual({ ok: false, error: "Could not start the upload. Try again." });
    expect(ops()).toEqual(["select", "select"]);
  });

  it("takes its row back when no token can be had", async () => {
    script("docs", { count: 0 }, { data: null }, { data: [{ id: "x" }] });
    scriptStorage("createSignedUploadUrl", { data: null, error: { message: "down" } });
    expect(await start()).toEqual({ ok: false, error: "Could not start the upload. Try again." });
    expect(ops()).toEqual(["select", "insert", "delete"]);
  });

  it("leaves the row of an owner whose rows are kept when no token can be had, and says it in the owner's words", async () => {
    script("docs", { count: 0 }, { data: null });
    scriptStorage("createSignedUploadUrl", { data: null, error: { message: "down" } });
    const begin = (type: string) =>
      startUpload({ records: keptRows, insert: () => builderFor("docs").insert({}), folder: "f", holder: "payment", declared: { name: "r.pdf", size: 10, type }, wording: { use: "the bank's PDF", isNot: "PDF or image" } });
    expect((await begin("application/pdf")).ok).toBe(false);
    expect(ops()).toEqual(["select", "insert"]);
    expect(await begin("text/html")).toEqual({ ok: false, error: "r.pdf can't be attached. Use the bank's PDF." });
  });
});

describe("discardUpload", () => {
  it("removes the row, then the object", async () => {
    script("docs", { data: [{ id: "f1" }] });
    scriptStorage("remove", { data: [] });
    await discardUpload(records, file);
    expect(calls[0].filters).toEqual(expect.arrayContaining([["is", "confirmed_at", null]]));
    expect(removed()).toEqual([["thing/t1/f1-a.pdf"]]);
  });

  it("keeps the object when the row stayed, because a confirm landed in between", async () => {
    script("docs", { data: [] });
    await discardUpload(records, file);
    expect(removed()).toEqual([]);
  });

  it("removes only the object for an owner whose rows are kept, and leaves the row", async () => {
    scriptStorage("remove", { data: [] });
    await discardUpload(keptRows, file);
    expect(calls).toEqual([]);
    expect(removed()).toEqual([["thing/t1/f1-a.pdf"]]);
  });
});

describe("confirmUpload", () => {
  const arrived = (bytes: Uint8Array, contentType = "application/pdf") => {
    scriptStorage("info", { data: { size: bytes.length, contentType } });
    scriptStorage("download", { data: blob(bytes) });
  };

  it("records what arrived, with its own hash, guarded on still being unconfirmed", async () => {
    arrived(PDF);
    script("docs", { data: null });
    expect(await confirmUpload({ records, file })).toEqual({ ok: true });
    expect(calls[0].payloads[0]).toMatchObject({ size_bytes: PDF.length, mime_type: "application/pdf", sha256: expect.stringMatching(/^[0-9a-f]{64}$/), confirmed_at: expect.any(String) });
    expect(calls[0].filters).toEqual(expect.arrayContaining([["is", "confirmed_at", null]]));
  });

  it("refuses and removes a file whose bytes are not its type, row before object", async () => {
    arrived(JPEG);
    script("docs", { data: [{ id: "f1" }] });
    scriptStorage("remove", { data: [] });
    expect(await confirmUpload({ records, file })).toEqual({ ok: false, error: "a.pdf can't be attached: it is not the PDF or photo it says it is." });
    expect(ops()).toEqual(["delete"]);
    expect(removed()).toEqual([["thing/t1/f1-a.pdf"]]);
  });

  it("holds an owner to a PDF whatever was declared, in the owner's words", async () => {
    arrived(JPEG, "image/jpeg");
    script("docs", { data: [{ id: "f1" }] });
    scriptStorage("remove", { data: [] });
    expect(await confirmUpload({ records, file, pdfOnly: "That is a photo, not the PDF." })).toEqual({ ok: false, error: "That is a photo, not the PDF." });
  });

  it("keeps a real file when the storage read fails, and says to wait when nothing has arrived", async () => {
    scriptStorage("info", { data: { size: 10, contentType: "application/pdf" } }, { data: null, error: { message: "not found" } });
    scriptStorage("download", { data: null, error: { message: "down" } });
    expect(await confirmUpload({ records, file })).toEqual({ ok: false, error: "Couldn't check the file just now. Try again." });
    expect(await confirmUpload({ records, file })).toEqual({ ok: false, error: "The file hasn't arrived yet. Try again in a moment." });
    expect(calls).toEqual([]);
    expect(removed()).toEqual([]);
  });
});

describe("removeDocument", () => {
  const remove = () =>
    removeDocument({ path: file.path, deleteRow: () => builderFor("docs").delete().eq("id", "f1").select("id") as never, kept: "Kept for ten years: mark it replaced instead.", missing: "Gone already." });

  it("deletes the row, then the object", async () => {
    script("docs", { data: [{ id: "f1" }] });
    scriptStorage("remove", { data: [] });
    expect(await remove()).toEqual({ ok: true });
    expect(removed()).toEqual([["thing/t1/f1-a.pdf"]]);
  });

  it("answers a kept document in the owner's plain words, never the database's, and keeps its object", async () => {
    script("docs", { error: { message: "Documents of a claim that was ever submitted are kept", code: "P0001" } as { message: string } });
    expect(await remove()).toEqual({ ok: false, error: "Kept for ten years: mark it replaced instead." });
    expect(removed()).toEqual([]);
  });

  it("says when the row was already gone, and removes nothing, also when the answer names no rows at all", async () => {
    script("docs", { data: [] }, { data: null });
    expect(await remove()).toEqual({ ok: false, error: "Gone already." });
    expect(await remove()).toEqual({ ok: false, error: "Gone already." });
    expect(removed()).toEqual([]);
  });
});

describe("openDocument", () => {
  type Reader = { personId: string };
  const ownersOnly = async (reader: Reader) =>
    reader.personId === "owner" ? { ok: true as const, file: { path: file.path, filename: file.filename } } : { ok: false as const, error: "File not found." };

  it("signs a one-minute link for a reader the owner's rule allows", async () => {
    scriptStorage("createSignedUrl", { data: { signedUrl: "https://signed" } });
    expect(await openDocument({ personId: "owner" }, ownersOnly)).toEqual({ ok: true, url: "https://signed" });
    expect(storageCalls[0].args).toEqual([file.path, 60]);
  });

  it("signs nothing for anyone else", async () => {
    expect(await openDocument({ personId: "someone-else" }, ownersOnly)).toEqual({ ok: false, error: "File not found." });
    expect(storageCalls).toEqual([]);
  });

  it("names the download when the owner asks for one", async () => {
    scriptStorage("createSignedUrl", { data: { signedUrl: "https://signed" } });
    await openDocument({}, async () => ({ ok: true, file: { path: file.path, filename: "a.pdf" }, asDownload: true }));
    expect(storageCalls[0].args).toEqual([file.path, 60, { download: "a.pdf" }]);
  });
});

describe("openDocuments", () => {
  it("pairs each listed row with its link, and leaves out one the bucket did not sign", async () => {
    scriptStorage("createSignedUrls", { data: [{ path: "p1", signedUrl: "https://1" }] });
    const signed = await openDocuments({}, async () => [{ id: "a", path: "p1" }, { id: "b", path: "p2" }]);
    expect(signed).toEqual([{ row: { id: "a", path: "p1" }, url: "https://1" }]);
    expect(storageCalls[0].args).toEqual([["p1", "p2"], 60]);
  });

  it("asks for no links when the rule lists none, and raises when the bucket cannot sign", async () => {
    expect(await openDocuments({}, async () => [])).toEqual([]);
    expect(storageCalls).toEqual([]);
    scriptStorage("createSignedUrls", { data: null, error: { message: "store down" } });
    await expect(openDocuments({}, async () => [{ path: "p1" }])).rejects.toThrow("store down");
  });
});

describe("readDocumentBytes and streamDocument", () => {
  it("gives a stored document's bytes, and null when the bucket cannot", async () => {
    scriptStorage("download", { data: blob(PDF) }, { data: null, error: { message: "down" } });
    expect(await readDocumentBytes(file.path)).toEqual(PDF);
    expect(await readDocumentBytes(file.path)).toBeNull();
  });

  it("streams a document through a one-minute link this server uses at once, and null when it cannot", async () => {
    const body = new ReadableStream<Uint8Array>();
    const fetched = vi.fn(async () => new Response(body));
    vi.stubGlobal("fetch", fetched);
    scriptStorage("createSignedUrl", { data: { signedUrl: "https://signed" } }, { data: null, error: { message: "down" } });
    const stream = await streamDocument(file.path);
    // The link stays on this server: what comes back is the bytes, never a URL.
    expect(stream).toBe(body);
    expect(typeof stream).not.toBe("string");
    expect(storageCalls[0].args).toEqual([file.path, 60]);
    expect(await streamDocument(file.path)).toBeNull();
    expect(fetched).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});

describe("sweepUpload", () => {
  const sweep = () => sweepUpload(file.path, () => builderFor("docs").delete().eq("id", "f1").select("id") as never);

  it("removes the row, then the object", async () => {
    script("docs", { data: [{ id: "f1" }] });
    scriptStorage("remove", { data: [] });
    expect(await sweep()).toEqual({ done: "swept" });
    expect(removed()).toEqual([[file.path]]);
  });

  it("keeps a row the retention guard refuses, with its object", async () => {
    script("docs", { error: { message: "kept", code: "P0001" } as { message: string } });
    expect(await sweep()).toEqual({ done: "kept" });
    expect(removed()).toEqual([]);
  });

  it("leaves a row confirmed or gone since it was read", async () => {
    script("docs", { data: [] });
    expect(await sweep()).toEqual({ done: "gone" });
    expect(removed()).toEqual([]);
  });

  it("names what failed: the row, or the object after its row went", async () => {
    script("docs", { error: { message: "reset" } }, { data: [{ id: "f1" }] });
    scriptStorage("remove", { data: null, error: { message: "storage down" } });
    expect(await sweep()).toEqual({ done: "failed", what: "row", message: "reset" });
    expect(await sweep()).toEqual({ done: "failed", what: "object", message: "storage down" });
  });
});
