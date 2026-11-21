import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script, scriptStorage, storageCalls } from "@/kernel/data/testing/fake-company-os";
import { linkHost, linkLabel } from "./deliverable-types";

// W.155: a card's link deliverables. The guard is faked so each test states who
// is asking; the audit is faked so what is recorded can be read back.

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

const { addCardLink, listCardDeliverables, removeCardDeliverable, restoreCardDeliverable } = await import("./deliverables");

const linkRow = (over: Record<string, unknown> = {}) => ({
  id: "d1",
  kind: "link",
  url: "https://www.loom.com/share/drawer-walkthrough",
  title: null,
  filename: null,
  mime_type: null,
  size_bytes: null,
  created_at: "2026-10-05T02:00:00Z",
  uploader: { display_name: "Ada Rivers", preferred_name: null, full_name: null, email: null },
  ...over,
});
const writes = (verb: string) => calls.filter((c) => c.table === "task_attachments" && c.ops[0] === verb);

beforeEach(() => {
  resetFake();
  audits.length = 0;
  allowed = true;
});

describe("adding a link (W.155)", () => {
  it("stores an https link as confirmed, by the person adding it, and audits it", async () => {
    script("task_attachments", { data: [] }, { data: linkRow() });
    const res = await addCardLink("t1", "loom.com/share/drawer-walkthrough");
    expect(res).toMatchObject({ ok: true, item: { kind: "link", addedBy: "Ada Rivers" } });
    const insert = writes("insert")[0].payloads[0] as Record<string, unknown>;
    expect(insert).toMatchObject({ task_id: "t1", kind: "link", url: "https://loom.com/share/drawer-walkthrough", uploaded_by: "p1" });
    expect(typeof insert.confirmed_at).toBe("string");
    expect(audits).toHaveLength(1);
  });

  it("refuses a pull request, which belongs in the PR field", async () => {
    const res = await addCardLink("t1", "https://github.com/edge8-ai/edge8-web/pull/1781");
    expect(res).toEqual({ ok: false, error: expect.stringMatching(/PR field/) });
    expect(writes("insert")).toHaveLength(0);
  });

  it("refuses what is not a web address, and a link the card already has", async () => {
    expect(await addCardLink("t1", "javascript:alert(1)")).toMatchObject({ ok: false });
    script("task_attachments", { data: [{ id: "d0" }] });
    expect(await addCardLink("t1", "https://loom.com/share/x")).toEqual({ ok: false, error: "That link is already on the card." });
    expect(writes("insert")).toHaveLength(0);
  });

  it("writes nothing for someone who is not on the board", async () => {
    allowed = false;
    expect(await addCardLink("t1", "https://loom.com/share/x")).toMatchObject({ ok: false });
    expect(calls).toHaveLength(0);
  });
});

describe("listing, removing and putting back", () => {
  it("lists live confirmed deliverables only", async () => {
    script("task_attachments", { data: [linkRow()] });
    const res = await listCardDeliverables("t1");
    expect(res).toMatchObject({ ok: true, items: [{ id: "d1" }] });
    const q = calls.find((c) => c.table === "task_attachments")!;
    expect(q.filters).toEqual(expect.arrayContaining([["eq", "task_id", "t1"], ["is", "archived_at", null]]));
  });

  it("signs images for minutes and videos for an hour, each kind in one call (W.128, W.156)", async () => {
    const file = (id: string, mime: string) => ({ ...linkRow({ id, kind: "file", url: null, filename: `${id}.x`, mime_type: mime }), storage_path: `task/t1/${id}` });
    script("task_attachments", { data: [file("i1", "image/png"), file("i2", "image/jpeg"), file("v1", "video/mp4"), file("p1", "application/pdf")] });
    scriptStorage(
      "createSignedUrls",
      { data: [{ path: "task/t1/i1", signedUrl: "https://s/i1" }, { path: "task/t1/i2", signedUrl: "https://s/i2" }] },
      { data: [{ path: "task/t1/v1", signedUrl: "https://s/v1" }] },
    );
    const res = await listCardDeliverables("t1");
    const urls = res.ok ? res.items.map((d) => d.previewUrl) : [];
    expect(urls).toEqual(["https://s/i1", "https://s/i2", "https://s/v1", null]);
    expect(storageCalls.map((c) => c.args)).toEqual([
      [["task/t1/i1", "task/t1/i2"], 600],
      [["task/t1/v1"], 3600],
    ]);
  });

  it("archives on remove, scoped to the card, and says so when nothing matched", async () => {
    script("task_attachments", { data: [{ id: "d1" }] }, { data: [] });
    expect(await removeCardDeliverable("t1", "d1")).toEqual({ ok: true });
    const upd = writes("update")[0];
    expect(upd.payloads[0]).toMatchObject({ archived_by: "p1" });
    expect(upd.filters).toEqual(expect.arrayContaining([["eq", "id", "d1"], ["eq", "task_id", "t1"]]));
    expect(await removeCardDeliverable("t1", "d1")).toEqual({ ok: false, error: "That deliverable is no longer on the card." });
  });

  it("puts a removed deliverable back on undo", async () => {
    script("task_attachments", { data: [{ id: "d1" }] });
    expect(await restoreCardDeliverable("t1", "d1")).toEqual({ ok: true });
    expect(writes("update")[0].payloads[0]).toEqual({ archived_at: null, archived_by: null });
  });
});

describe("a link's words", () => {
  it("names the site without www, and the link by its title or the end of its path", () => {
    expect(linkHost("https://www.loom.com/share/x")).toBe("loom.com");
    expect(linkLabel({ url: "https://www.loom.com/share/drawer-walkthrough", title: null })).toBe("drawer walkthrough");
    expect(linkLabel({ url: "https://figma.com/", title: null })).toBe("figma.com");
    expect(linkLabel({ url: "https://figma.com/x", title: "Card drawer: hybrid" })).toBe("Card drawer: hybrid");
  });
});
