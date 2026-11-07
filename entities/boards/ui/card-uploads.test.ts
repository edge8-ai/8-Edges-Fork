import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Deliverable } from "@/entities/boards/lib/deliverable-types";

// Bug hunt B2/F3 (2026-10-05): when the bytes are stored and only the check
// fails, Try again must re-check those bytes, not send the file again under a
// new row (which left the first copy behind, or duplicated it). The server
// actions and the TUS helper are faked; the store itself is real.

const startCardUpload = vi.fn();
const confirmCardUpload = vi.fn();
const cancelCardUpload = vi.fn(async () => ({ ok: true }));
vi.mock("@/entities/boards/lib/deliverable-files", () => ({
  startCardUpload: (...a: unknown[]) => startCardUpload(...a),
  confirmCardUpload: (...a: unknown[]) => confirmCardUpload(...a),
  cancelCardUpload: (...a: unknown[]) => cancelCardUpload(...(a as [])),
}));
// The TUS helper ends each transfer the way the next queued outcome says, and
// the bytes arrive when nothing is queued. Every call is kept, so a test can
// see whether a try resumed an earlier upload.
type Outcome = { stop: "stopped" | "refused"; sent: number };
const outcomes: Outcome[] = [];
const transfers: { resumeUrl?: string | null }[] = [];
vi.mock("@/kernel/ui/upload", () => ({
  resumableUploadToSignedPath: (input: {
    resumeUrl?: string | null;
    onProgress: (n: number) => void;
    onError: (why: string) => void;
    onSuccess: () => void;
  }) => {
    transfers.push({ resumeUrl: input.resumeUrl });
    const outcome = outcomes.shift();
    queueMicrotask(() => {
      if (!outcome) return input.onSuccess();
      input.onProgress(outcome.sent);
      input.onError(outcome.stop);
    });
    return { abort: () => {}, uploadUrl: () => "https://s/upload/resumable/sign/abc" };
  },
}));

const store = await import("./card-uploads");
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  startCardUpload.mockReset();
  confirmCardUpload.mockReset();
  cancelCardUpload.mockClear();
  outcomes.length = 0;
  transfers.length = 0;
});

describe("trying a failed upload again", () => {
  it("re-checks bytes that are already stored, without a second upload", async () => {
    startCardUpload.mockResolvedValue({ ok: true, deliverableId: "d1", bucket: "card-attachments", path: "task/t1/d1-a.png", token: "tok" });
    confirmCardUpload.mockResolvedValueOnce({ ok: false, error: "Couldn't check the file just now. Try again." });
    const finished: unknown[] = [];
    const off = store.onDeliverableArrived("t1", (item) => finished.push(item));

    store.uploadToCard("t1", [new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" })], "chosen");
    await flush();
    await flush();
    expect(startCardUpload).toHaveBeenCalledTimes(1);
    expect(confirmCardUpload).toHaveBeenCalledTimes(1);

    confirmCardUpload.mockResolvedValueOnce({ ok: true, item: { id: "d1" } });
    const failedKey = store.peekEntries("t1").find((u) => u.kind === "failed")?.key;
    expect(failedKey).toBeDefined();
    store.retryUpload("t1", failedKey!);
    await flush();
    await flush();

    expect(startCardUpload).toHaveBeenCalledTimes(1);
    expect(confirmCardUpload).toHaveBeenCalledTimes(2);
    expect(confirmCardUpload.mock.calls[1]).toEqual(["t1", "d1"]);
    expect(finished).toEqual([{ id: "d1" }]);
    expect(store.peekEntries("t1")).toEqual([]);
    off();
  });

  it("clears the stored bytes when a confirm failure is dismissed", async () => {
    startCardUpload.mockResolvedValue({ ok: true, deliverableId: "d2", bucket: "card-attachments", path: "task/t2/d2-a.png", token: "tok" });
    confirmCardUpload.mockResolvedValueOnce({ ok: false, error: "Couldn't check the file just now. Try again." });
    store.uploadToCard("t2", [new File([new Uint8Array([1])], "a.png", { type: "image/png" })], "chosen");
    await flush();
    await flush();
    const key = store.peekEntries("t2").find((u) => u.kind === "failed")!.key;
    store.dropUpload("t2", key);
    expect(cancelCardUpload).toHaveBeenCalledWith("t2", "d2");
    expect(store.peekEntries("t2")).toEqual([]);
  });
});

// Bug hunt F0: an upload whose connection dropped kept nothing, so Try again
// started from byte 0 under a new row. Now the row and the partial bytes stay,
// and Try again resumes the same upload; only a real refusal clears the row.
describe("an upload that stops part way (F0)", () => {
  const begun = { ok: true, deliverableId: "d3", bucket: "card-attachments", path: "task/t3/d3-cut.mp4", token: "tok" };
  const cut = () => new File([new Uint8Array(10)], "cut.mp4", { type: "video/mp4" });

  it("keeps its row, and Try again resumes it from where it stopped", async () => {
    startCardUpload.mockResolvedValue(begun);
    confirmCardUpload.mockResolvedValue({ ok: true, item: { id: "d3" } });
    outcomes.push({ stop: "stopped", sent: 6 });
    store.uploadToCard("t3", [cut()], "chosen");
    await flush();
    await flush();

    const failed = store.peekEntries("t3").find((u) => u.kind === "failed");
    expect(failed).toMatchObject({ kind: "failed", resume: { deliverableId: "d3", uploadUrl: "https://s/upload/resumable/sign/abc", sent: 6 } });
    expect(cancelCardUpload).not.toHaveBeenCalled();

    store.retryUpload("t3", failed!.key);
    expect(store.peekEntries("t3")).toMatchObject([{ kind: "uploading", sent: 6, phase: "sending" }]);
    await flush();
    await flush();

    expect(startCardUpload).toHaveBeenCalledTimes(1);
    expect(transfers).toEqual([{ resumeUrl: null }, { resumeUrl: "https://s/upload/resumable/sign/abc" }]);
    expect(confirmCardUpload).toHaveBeenCalledWith("t3", "d3");
    expect(store.peekEntries("t3")).toEqual([]);
  });

  it("clears the row of an upload the storage refused, and Try again sends afresh", async () => {
    startCardUpload.mockResolvedValue({ ...begun, deliverableId: "d4" });
    confirmCardUpload.mockResolvedValue({ ok: true, item: { id: "d4" } });
    outcomes.push({ stop: "refused", sent: 0 });
    store.uploadToCard("t4", [cut()], "chosen");
    await flush();
    await flush();

    expect(cancelCardUpload).toHaveBeenCalledWith("t4", "d4");
    const failed = store.peekEntries("t4").find((u) => u.kind === "failed");
    expect(failed).toBeDefined();
    expect(failed).not.toHaveProperty("resume");
    store.retryUpload("t4", failed!.key);
    await flush();
    await flush();
    expect(startCardUpload).toHaveBeenCalledTimes(2);
    expect(transfers).toEqual([{ resumeUrl: null }, { resumeUrl: null }]);
  });

  it("clears the kept row when a stopped upload is dismissed", async () => {
    startCardUpload.mockResolvedValue({ ...begun, deliverableId: "d5" });
    outcomes.push({ stop: "stopped", sent: 3 });
    store.uploadToCard("t5", [cut()], "chosen");
    await flush();
    await flush();
    store.dropUpload("t5", store.peekEntries("t5")[0].key);
    expect(cancelCardUpload).toHaveBeenCalledWith("t5", "d5");
  });
});

const row = (id: string, createdAt: string, extra: Partial<Deliverable> = {}): Deliverable => ({
  id,
  kind: "file",
  url: null,
  title: null,
  filename: `${id}.mp4`,
  mimeType: "video/mp4",
  sizeBytes: 1,
  previewUrl: `https://s/${id}-old`,
  addedBy: "Ada Rivers",
  createdAt,
  ...extra,
});

// Bug hunt F2/F23: the first list read replaced the list wholesale, so a row
// added while it was in flight vanished until the card was opened again.
describe("a list read merged with what changed while it was in flight", () => {
  it("keeps a row added meanwhile, drops one removed meanwhile, and prefers the server's copy", () => {
    const a = row("a", "2026-10-01T00:00:00Z");
    const b = row("b", "2026-10-02T00:00:00Z");
    const added = row("c", "2026-10-03T00:00:00Z");
    const journal = { added: new Map([[added.id, added], ["a", a]]), removed: new Set(["b"]) };
    const server = [{ ...a, previewUrl: "https://s/a-new" }, b];

    expect(store.mergeListed(server, journal)).toEqual([{ ...a, previewUrl: "https://s/a-new" }, added]);
  });
});

// Bug hunt F20: a double click sent two archives, and the second said the
// remove had failed although it had worked.
describe("removing a deliverable twice at once", () => {
  it("sends one remove and ignores the second click while the first is in flight", async () => {
    let release!: () => void;
    const run = vi.fn(() => new Promise<{ ok: true }>((r) => (release = () => r({ ok: true }))));
    const first = store.removeOnce("x1", run);
    const second = await store.removeOnce("x1", run);
    expect(second).toBeNull();
    release();
    expect(await first).toEqual({ ok: true });
    expect(run).toHaveBeenCalledTimes(1);
    // Once it has finished, the same row may be removed again (after an Undo).
    expect(await store.removeOnce("x1", async () => ({ ok: true }))).toEqual({ ok: true });
  });
});

// Bug hunt F18/F19/F21: a second remove replaced the toast and took the first
// Undo away; an Undo pressed after the drawer reopened reached nobody; and the
// row it put back carried an expired signed preview.
describe("Undo", () => {
  const api = () => ({
    restore: vi.fn(async (): Promise<{ ok: true } | { ok: false; error: string }> => ({ ok: true })),
    list: vi.fn(async (taskId: string) => ({ ok: true as const, items: [row(`${taskId}-1`, "2026-10-01T00:00:00Z", { previewUrl: "https://s/fresh" })] })),
  });

  it("covers every row removed while the toast is up, and starts afresh once it has gone", () => {
    const first = store.noteRemoval("t6", row("t6-1", "2026-10-01T00:00:00Z"), 1_000);
    expect(store.removalMessage(first)).toBe("Removed t6-1.mp4");
    const both = store.noteRemoval("t6", row("t6-2", "2026-10-02T00:00:00Z"), 5_000);
    expect(both.map((r) => r.item.id)).toEqual(["t6-1", "t6-2"]);
    expect(store.removalMessage(both)).toBe("Removed 2 deliverables");
    const later = store.noteRemoval("t6", row("t6-3", "2026-10-03T00:00:00Z"), 5_000 + store.UNDO_MS);
    expect(later.map((r) => r.item.id)).toEqual(["t6-3"]);
  });

  it("puts back every row in the toast and hands the fresh rows to whichever drawer is open", async () => {
    const fake = api();
    const removals = [
      { taskId: "t7", item: row("t7-1", "2026-10-01T00:00:00Z") },
      { taskId: "t7", item: row("t7-2", "2026-10-02T00:00:00Z") },
    ];
    // A drawer opened after the remove, not the one that removed the rows.
    const arrived: Deliverable[] = [];
    const off = store.onDeliverableArrived("t7", (item) => arrived.push(item));

    expect(await store.undoRemovals(removals, fake)).toEqual({ ok: true });
    expect(fake.restore.mock.calls).toEqual([
      ["t7", "t7-1"],
      ["t7", "t7-2"],
    ]);
    expect(fake.list).toHaveBeenCalledTimes(1);
    expect(arrived.map((d) => [d.id, d.previewUrl])).toEqual([
      ["t7-1", "https://s/fresh"],
      ["t7-2", "https://s/t7-2-old"],
    ]);
    off();
  });

  it("says how many it put back when one cannot be", async () => {
    const fake = api();
    fake.restore.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false, error: "That deliverable can't be put back any more." });
    const removals = [
      { taskId: "t8", item: row("t8-1", "2026-10-01T00:00:00Z") },
      { taskId: "t8", item: row("t8-2", "2026-10-02T00:00:00Z") },
    ];
    expect(await store.undoRemovals(removals, fake)).toEqual({ ok: false, error: "Put back 1 of 2. That deliverable can't be put back any more." });
  });
});
