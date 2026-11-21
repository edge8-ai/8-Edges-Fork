import { beforeEach, describe, expect, it, vi } from "vitest";

// Bug hunt B3 (2026-10-05): the upload store must hand the start action and the
// bucket the normalised type, because the bucket refuses Windows' name for a
// zip as surely as the old rule did. The server actions and the TUS helper are
// faked; the store itself is real.

const startCardUpload = vi.fn();
const uploaded: string[] = [];
vi.mock("@/entities/boards/lib/deliverable-files", () => ({
  startCardUpload: (...a: unknown[]) => startCardUpload(...a),
  confirmCardUpload: async () => ({ ok: true, item: { id: "d1" } }),
  cancelCardUpload: async () => ({ ok: true }),
}));
vi.mock("@/kernel/ui/upload", () => ({
  resumableUploadToSignedPath: (input: { file: File; onSuccess: () => void }) => {
    uploaded.push(input.file.type);
    queueMicrotask(input.onSuccess);
    return { abort: () => {} };
  },
}));

const store = await import("./card-uploads");
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  startCardUpload.mockReset();
  uploaded.length = 0;
});

describe("the type an upload carries (B3)", () => {
  it("sends a Windows zip as application/zip, to the start action and to the bucket", async () => {
    startCardUpload.mockResolvedValue({ ok: true, deliverableId: "d1", bucket: "card-attachments", path: "task/t9/d1-b.zip", token: "tok" });
    store.uploadToCard("t9", [new File([new Uint8Array([0x50, 0x4b])], "b.zip", { type: "application/x-zip-compressed" })], "chosen");
    expect(store.peekEntries("t9").some((u) => u.kind === "refused")).toBe(false);
    await flush();
    await flush();
    expect(startCardUpload).toHaveBeenCalledWith("t9", { name: "b.zip", size: 2, type: "application/zip" });
    expect(uploaded).toEqual(["application/zip"]);
  });
});
