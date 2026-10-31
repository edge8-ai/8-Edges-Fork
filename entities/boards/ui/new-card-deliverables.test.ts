import { beforeEach, describe, expect, it, vi } from "vitest";

// W.163 U7: a new card holds files and links until Create, and hands them to
// the card once it has an id. The server actions and the upload store are
// faked; the pending list itself is real.

const uploadToCard = vi.fn();
const addCardLink = vi.fn();
vi.mock("./card-uploads", () => ({ uploadToCard: (...a: unknown[]) => uploadToCard(...a) }));
vi.mock("@/entities/boards/lib/deliverables", () => ({ addCardLink: (...a: unknown[]) => addCardLink(...a) }));

const pending = await import("./new-card-deliverables");

const file = (name: string, type: string, bytes = 3) => new File([new Uint8Array(bytes)], name, { type });

beforeEach(() => {
  pending.clearPending();
  uploadToCard.mockReset();
  addCardLink.mockReset().mockResolvedValue({ ok: true });
});

describe("what a new card holds before Create", () => {
  it("holds chosen files and links as pending rows, each removable", () => {
    pending.holdFiles([file("spec.pdf", "application/pdf")], "chosen");
    expect(pending.holdLink("https://loom.com/share/abc")).toEqual({ ok: true });
    const rows = pending.peekPending();
    expect(rows.map((p) => p.kind)).toEqual(["file", "link"]);
    pending.dropPending(rows[0].key);
    expect(pending.peekPending().map((p) => p.kind)).toEqual(["link"]);
  });

  it("refuses at once what the rules refuse, and normalises what it keeps", () => {
    pending.holdFiles([file("logo.svg", "image/svg+xml"), file("b.zip", "application/x-zip-compressed")], "dropped");
    const [svg, zip] = pending.peekPending();
    expect(svg).toMatchObject({ kind: "refused", name: "logo.svg" });
    expect(zip.kind === "file" && zip.file.type).toBe("application/zip");
  });

  it("says why a link cannot be held, in addCardLink's words, and does not hold it twice", () => {
    expect(pending.holdLink("not a link")).toMatchObject({ ok: false, error: expect.stringMatching(/isn't a web address/) });
    expect(pending.holdLink("https://github.com/edge8-ai/edge8-web/pull/1800")).toMatchObject({ ok: false, error: expect.stringMatching(/pull request/) });
    pending.holdLink("https://loom.com/share/abc");
    expect(pending.holdLink("https://loom.com/share/abc")).toMatchObject({ ok: false, error: "That link is already on the card." });
    expect(pending.peekPending()).toHaveLength(1);
  });
});

describe("handing them to the created card", () => {
  it("uploads the files and adds the links to the new card's id, and empties the list", async () => {
    const pdf = file("spec.pdf", "application/pdf");
    const shot = file("shot.png", "image/png");
    pending.holdFiles([pdf], "chosen");
    pending.holdFiles([shot], "pasted");
    pending.holdFiles([file("logo.svg", "image/svg+xml")], "chosen");
    pending.holdLink("https://loom.com/share/abc");

    const missed = await pending.handPendingToNewCard("new-1");

    expect(missed).toBeNull();
    expect(uploadToCard).toHaveBeenCalledWith("new-1", [pdf], "chosen");
    expect(uploadToCard).toHaveBeenCalledWith("new-1", [shot], "pasted");
    expect(uploadToCard).toHaveBeenCalledTimes(2);
    expect(addCardLink).toHaveBeenCalledWith("new-1", "https://loom.com/share/abc");
    expect(pending.peekPending()).toEqual([]);
  });

  it("takes the list before it awaits anything, so it is handed over once", async () => {
    pending.holdLink("https://loom.com/share/abc");
    const first = pending.handPendingToNewCard("new-1");
    expect(pending.peekPending()).toEqual([]);
    await first;
    await pending.handPendingToNewCard("new-1");
    expect(addCardLink).toHaveBeenCalledTimes(1);
  });

  it("names a link the card could not take, and still adds the rest", async () => {
    addCardLink.mockResolvedValueOnce({ ok: false, error: "nope" }).mockRejectedValueOnce(new Error("offline"));
    pending.holdLink("https://loom.com/share/a");
    pending.holdLink("https://loom.com/share/b");
    pending.holdLink("https://loom.com/share/c");
    const missed = await pending.handPendingToNewCard("new-1");
    expect(addCardLink).toHaveBeenCalledTimes(3);
    expect(missed).toMatch(/2 links could not be added/);
  });
});
