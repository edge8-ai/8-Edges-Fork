import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script, scriptStorage, storageCalls } from "@/kernel/data/testing/fake-company-os";
import { FILE_TYPES, deliverablePath, imageBytesMatch, refuseFile } from "./deliverable-rules";

// W.128: file deliverables. The guard is faked so each test states who asks;
// storage is the kernel fake's double; fetch is stubbed for the image check.

vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const audits: unknown[] = [];
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: async (row: unknown) => void audits.push(row) }));
let allowed = true;
vi.mock("./mutation", () => ({
  boardMutation: async () =>
    allowed
      ? { ok: true, actor: { label: "Ada Rivers", personId: "p1", isAdmin: false }, row: { board_id: "b1" } }
      : { ok: false, error: "You don't have access to that board." },
}));

const { startCardUpload, confirmCardUpload, cancelCardUpload, signCardDownload } = await import("./deliverable-files");

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const stubFetch = (bytes: number[]) =>
  vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(bytes), { status: 206 })));
const fileRow = (over: Record<string, unknown> = {}) => ({
  id: "d1",
  kind: "file",
  url: null,
  title: null,
  filename: "before-after.png",
  mime_type: "image/png",
  size_bytes: 412_000,
  storage_path: "task/t1/d1-before-after.png",
  created_at: "2026-10-05T02:00:00Z",
  uploader: { display_name: "Ada Rivers", preferred_name: null, full_name: null, email: null },
  ...over,
});
const ops = (table: string, verb: string) => calls.filter((c) => c.table === table && c.ops[0] === verb);

beforeEach(() => {
  resetFake();
  audits.length = 0;
  allowed = true;
});
afterEach(() => vi.unstubAllGlobals());

describe("the rules a file is held to", () => {
  it("refuses over 500 MB with the link offer, and SVG or HTML with the reason", () => {
    expect(refuseFile({ name: "offsite.mp4", size: 4.1 * 1024 ** 3, type: "video/mp4" })).toMatchObject({
      reason: "too-large",
      title: "offsite.mp4 is 4.1 GB",
    });
    expect(refuseFile({ name: "logo.svg", size: 10, type: "image/svg+xml" })).toMatchObject({ reason: "type", detail: expect.stringMatching(/run code/) });
    expect(refuseFile({ name: "page.html", size: 10, type: "" })).toMatchObject({ reason: "type", detail: expect.stringMatching(/run code/) });
    expect(refuseFile({ name: "run.exe", size: 10, type: "application/x-msdownload" })).toMatchObject({ reason: "type" });
    expect(refuseFile({ name: "spec.pdf", size: 1_200_000, type: "application/pdf" })).toBeNull();
  });

  // Bug hunt B1 (2026-10-05): a substring test refused every Office file as
  // SVG/HTML, because their types contain "openxmlformats". Every type the
  // bucket accepts must pass, under its usual extension.
  it("accepts every type the bucket allows, the Office formats included", () => {
    const ext: Record<string, string> = { DOC: "doc", DOCX: "docx", XLS: "xls", XLSX: "xlsx", PPT: "ppt", PPTX: "pptx", JPG: "jpg", MOV: "mov" };
    const refused = Object.entries(FILE_TYPES)
      .map(([type, label]) => ({ type, name: `file.${ext[label] ?? label.toLowerCase()}` }))
      .filter((f) => refuseFile({ name: f.name, size: 1000, type: f.type }) !== null);
    expect(refused).toEqual([]);
  });

  it("still refuses every type that can run code when opened, whatever its name", () => {
    for (const type of ["image/svg+xml", "text/html", "application/xhtml+xml", "text/xml", "application/xml"]) {
      expect(refuseFile({ name: "innocent.png", size: 10, type })).toMatchObject({ reason: "type", detail: expect.stringMatching(/run code/) });
    }
    expect(refuseFile({ name: "page.xhtml", size: 10, type: "" })).toMatchObject({ reason: "type", detail: expect.stringMatching(/run code/) });
  });

  it("files an object under its card, with a random id and a safe name", () => {
    expect(deliverablePath("t1", "../Screen Shot 2026.png", "abc")).toBe("task/t1/abc-Screen_Shot_2026.png");
  });

  it("knows an image by its first bytes", () => {
    expect(imageBytesMatch("image/png", new Uint8Array(PNG))).toBe(true);
    expect(imageBytesMatch("image/png", new TextEncoder().encode("<svg xmlns="))).toBe(false);
    expect(imageBytesMatch("application/pdf", new Uint8Array())).toBe(true);
  });
});

describe("starting an upload (W.128)", () => {
  it("records an unconfirmed row by the person uploading, and returns a signed token for its path", async () => {
    script("task_attachments", { count: 0 }, { data: null });
    scriptStorage("createSignedUploadUrl", { data: { token: "tok", path: "x", signedUrl: "u" } });
    const res = await startCardUpload("t1", { name: "before-after.png", size: 412_000, type: "image/png" });
    expect(res).toMatchObject({ ok: true, bucket: "card-attachments", token: "tok" });
    const insert = ops("task_attachments", "insert")[0].payloads[0] as Record<string, unknown>;
    expect(insert).toMatchObject({ task_id: "t1", kind: "file", filename: "before-after.png", uploaded_by: "p1" });
    expect(insert.confirmed_at).toBeUndefined();
    expect(String(insert.storage_path)).toMatch(/^task\/t1\/[0-9a-f-]+-before-after\.png$/);
    expect(res.ok && res.path).toBe(insert.storage_path);
  });

  // Bug hunt B3 (W.163): a page loaded before the client fix still declares
  // Windows' alias for a zip; the row must carry the type the bucket accepts.
  it("records the bucket's type when an older page declares an alias", async () => {
    script("task_attachments", { count: 0 }, { data: null });
    scriptStorage("createSignedUploadUrl", { data: { token: "tok", path: "x", signedUrl: "u" } });
    const res = await startCardUpload("t1", { name: "brief.zip", size: 2_000, type: "application/x-zip-compressed" });
    expect(res).toMatchObject({ ok: true });
    expect(ops("task_attachments", "insert")[0].payloads[0]).toMatchObject({ mime_type: "application/zip" });
  });

  it("refuses a file the rules refuse before writing anything", async () => {
    const res = await startCardUpload("t1", { name: "huge.mov", size: 600 * 1024 * 1024, type: "video/quicktime" });
    expect(res).toMatchObject({ ok: false, refusal: { reason: "too-large" } });
    expect(calls).toHaveLength(0);
  });

  it("drops the row when no token could be signed", async () => {
    script("task_attachments", { count: 0 }, { data: null }, { data: null });
    scriptStorage("createSignedUploadUrl", { error: { message: "down" } });
    expect(await startCardUpload("t1", { name: "a.pdf", size: 10, type: "application/pdf" })).toMatchObject({ ok: false });
    expect(ops("task_attachments", "delete")).toHaveLength(1);
  });

  // Bug hunt K2 (W.163): nothing capped unconfirmed uploads, so a board member
  // could write rows faster than the nightly sweep clears them.
  it("refuses a start once the card holds 50 unfinished uploads from the last day, and writes nothing", async () => {
    script("task_attachments", { count: 50 });
    const res = await startCardUpload("t1", { name: "a.pdf", size: 10, type: "application/pdf" });
    expect(res).toMatchObject({ ok: false, error: expect.stringMatching(/already has 50 uploads that haven't finished/) });
    expect(ops("task_attachments", "insert")).toHaveLength(0);
    expect(storageCalls).toHaveLength(0);
    expect(ops("task_attachments", "select")[0].filters).toEqual(
      expect.arrayContaining([["eq", "task_id", "t1"], ["is", "confirmed_at", null], ["gte", "created_at", expect.any(String)]]),
    );
  });

  it("refuses rather than guesses when the unfinished count cannot be read", async () => {
    script("task_attachments", { error: { message: "db down" } });
    expect(await startCardUpload("t1", { name: "a.pdf", size: 10, type: "application/pdf" })).toEqual({ ok: false, error: "Could not start the upload. Try again." });
    expect(ops("task_attachments", "insert")).toHaveLength(0);
  });

  it("writes nothing for someone not on the board", async () => {
    allowed = false;
    expect(await startCardUpload("t1", { name: "a.pdf", size: 10, type: "application/pdf" })).toMatchObject({ ok: false });
    expect(calls).toHaveLength(0);
  });
});

describe("confirming an upload", () => {
  it("records the STORED size and type, audits, and signs the new image's preview", async () => {
    script("task_attachments", { data: { id: "d1", storage_path: "task/t1/d1-before-after.png", filename: "before-after.png" } }, { data: fileRow({ size_bytes: 411_999 }) });
    scriptStorage("info", { data: { size: 411_999, contentType: "image/png" } });
    scriptStorage("createSignedUrl", { data: { signedUrl: "https://s/head" } }, { data: { signedUrl: "https://s/preview" } });
    stubFetch(PNG);
    const res = await confirmCardUpload("t1", "d1");
    expect(res).toMatchObject({ ok: true, item: { id: "d1", previewUrl: "https://s/preview", sizeBytes: 411_999 } });
    expect(ops("task_attachments", "update")[0].payloads[0]).toMatchObject({ size_bytes: 411_999, mime_type: "image/png" });
    expect(audits).toHaveLength(1);
  });

  it("refuses and deletes an 'image' whose bytes are not one", async () => {
    script("task_attachments", { data: { id: "d1", storage_path: "task/t1/d1-x.png", filename: "x.png" } }, { data: null });
    scriptStorage("info", { data: { size: 900, contentType: "image/png" } });
    scriptStorage("createSignedUrl", { data: { signedUrl: "https://s/head" } });
    scriptStorage("remove", { data: [] });
    stubFetch([...new TextEncoder().encode("<svg xmlns='")]);
    expect(await confirmCardUpload("t1", "d1")).toMatchObject({ ok: false, refusal: { reason: "type" } });
    expect(storageCalls.find((c) => c.op === "remove")?.args[0]).toEqual(["task/t1/d1-x.png"]);
    expect(ops("task_attachments", "delete")).toHaveLength(1);
    expect(ops("task_attachments", "update")).toHaveLength(0);
  });

  // Bug hunt B2 (2026-10-05): a storage hiccup reading the first bytes used to
  // read as "not an image" and DELETE a real upload.
  it("keeps a real image whose first bytes could not be read, and asks to try again", async () => {
    script("task_attachments", { data: { id: "d1", storage_path: "task/t1/d1-a.png", filename: "a.png" } });
    scriptStorage("info", { data: { size: 5000, contentType: "image/png" } });
    scriptStorage("createSignedUrl", { error: { message: "timeout" } });
    expect(await confirmCardUpload("t1", "d1")).toEqual({ ok: false, error: "Couldn't check the file just now. Try again." });
    expect(storageCalls.filter((c) => c.op === "remove")).toHaveLength(0);
    expect(ops("task_attachments", "delete")).toHaveLength(0);
    expect(ops("task_attachments", "update")).toHaveLength(0);
  });

  it("refuses and deletes a stored object over the cap, whatever the browser declared", async () => {
    script("task_attachments", { data: { id: "d1", storage_path: "task/t1/d1-a.mp4", filename: "a.mp4" } }, { data: null });
    scriptStorage("info", { data: { size: 501 * 1024 * 1024, contentType: "video/mp4" } });
    scriptStorage("remove", { data: [] });
    expect(await confirmCardUpload("t1", "d1")).toMatchObject({ ok: false, refusal: { reason: "too-large" } });
    expect(ops("task_attachments", "delete")).toHaveLength(1);
  });

  // Bug hunt F1 (W.163): the row used to be deleted even when its object would
  // not go, leaving an object no row names in a live card's folder.
  it("keeps the row of a refused upload whose object could not be removed, for the sweep", async () => {
    script("task_attachments", { data: { id: "d1", storage_path: "task/t1/d1-a.mp4", filename: "a.mp4" } });
    scriptStorage("info", { data: { size: 501 * 1024 * 1024, contentType: "video/mp4" } });
    scriptStorage("remove", { error: { message: "storage down" } });
    expect(await confirmCardUpload("t1", "d1")).toMatchObject({ ok: false, refusal: { reason: "too-large" } });
    expect(storageCalls.filter((c) => c.op === "remove")).toHaveLength(1);
    expect(ops("task_attachments", "delete")).toHaveLength(0);
  });

  it("says so when the file has not arrived, and deletes nothing", async () => {
    script("task_attachments", { data: { id: "d1", storage_path: "task/t1/d1-a.pdf", filename: "a.pdf" } });
    scriptStorage("info", { error: { message: "not found" } });
    expect(await confirmCardUpload("t1", "d1")).toMatchObject({ ok: false, error: expect.stringMatching(/hasn't arrived/) });
    expect(ops("task_attachments", "delete")).toHaveLength(0);
  });
});

describe("cancelling and downloading", () => {
  it("clears what a cancelled upload left: its object, then its row", async () => {
    script("task_attachments", { data: { storage_path: "task/t1/d1-a.pdf" } }, { data: null });
    scriptStorage("remove", { data: [] });
    expect(await cancelCardUpload("t1", "d1")).toEqual({ ok: true });
    expect(storageCalls.map((c) => c.op)).toEqual(["remove"]);
    expect(ops("task_attachments", "delete")[0].filters).toEqual(expect.arrayContaining([["is", "confirmed_at", null]]));
  });

  it("keeps a cancelled upload's row when its object would not go", async () => {
    script("task_attachments", { data: { storage_path: "task/t1/d1-a.pdf" } });
    scriptStorage("remove", { error: { message: "storage down" } });
    expect(await cancelCardUpload("t1", "d1")).toEqual({ ok: true });
    expect(ops("task_attachments", "delete")).toHaveLength(0);
  });

  it("signs a download that saves under the file's own name", async () => {
    script("task_attachments", { data: { storage_path: "task/t1/d1-spec.pdf", filename: "spec.pdf" } });
    scriptStorage("createSignedUrl", { data: { signedUrl: "https://s/dl" } });
    expect(await signCardDownload("t1", "d1")).toEqual({ ok: true, url: "https://s/dl" });
    expect(storageCalls[0].args).toEqual(["task/t1/d1-spec.pdf", 300, { download: "spec.pdf" }]);
  });
});
