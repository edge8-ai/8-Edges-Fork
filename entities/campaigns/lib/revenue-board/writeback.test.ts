import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// What a person's move on the Revenue board does to the content calendar. The
// scripted responses are in the order the listener asks: the asset read, then
// the write. Boards' door is faked on the same client, so the subtask reads
// and writes land in `calls` beside the content ones.

vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const recordAudit = vi.fn(async (_row: { actor: string }) => {});
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: (row: { actor: string }) => recordAudit(row) }));
vi.mock("@/entities/boards", () => ({
  selectBoards: (cols: string) => builderFor("boards").select(cols),
  selectTasks: (cols: string) => builderFor("tasks").select(cols),
  updateTasks: (patch: Record<string, unknown>) => builderFor("tasks").update(patch),
}));
const publishBlogAsset = vi.fn();
vi.mock("@/entities/campaigns/lib/blog-publish", () => ({ publishBlogAsset: (...a: unknown[]) => publishBlogAsset(...a) }));

const { onCardLanded, onSubtaskToggled } = await import("./writeback");

const contentWrites = () => calls.filter((c) => c.table === "marketing_content" && c.ops[0] === "update").map((c) => c.payloads[0]);
const tick = (done: boolean) => ({ subtaskId: "sub-1", parentTaskId: "day-1", done, subjectType: "marketing_content", subjectId: "asset-1" });
// The board a ticked subtask sits on, as the read of its task answers it.
const onBoard = (name: string) => ({ data: { boards: { name } } });

beforeEach(() => {
  resetFake();
  publishBlogAsset.mockReset();
  recordAudit.mockClear();
  // The board a landed card was moved on, read by its slug for the audit row.
  script("boards", { data: { name: "Revenue board" } });
});

describe("ticking a post", () => {
  it("marks a social post published", async () => {
    script("marketing_content", { data: { channel: "linkedin", status: "approved" } }, { error: null });
    script("tasks", onBoard("Revenue board"));
    await onSubtaskToggled(tick(true));
    expect(contentWrites()).toEqual([{ status: "published" }]);
  });

  it("publishes a blog through the real publish path, never by a status write", async () => {
    script("marketing_content", { data: { channel: "blog", status: "approved" } });
    script("tasks", onBoard("Revenue board"));
    publishBlogAsset.mockResolvedValue({ ok: true });
    await onSubtaskToggled(tick(true));
    expect(publishBlogAsset).toHaveBeenCalledWith("asset-1", "Revenue board");
    expect(contentWrites()).toEqual([]);
  });

  it("takes the tick back when the blog would not publish, and says why", async () => {
    script("marketing_content", { data: { channel: "blog", status: "approved" } });
    script("tasks", onBoard("Revenue board"), { error: null });
    publishBlogAsset.mockResolvedValue({ ok: false, errors: ["No SEO title."] });
    await expect(onSubtaskToggled(tick(true))).rejects.toThrow("No SEO title.");
    const undo = calls.find((c) => c.table === "tasks" && c.ops[0] === "update");
    expect(undo?.payloads[0]).toEqual({ status: "open", completed_at: null });
    expect(undo?.filters).toContainEqual(["eq", "id", "sub-1"]);
  });

  it("unticks a social post back to Approved, and leaves a live blog alone", async () => {
    script("marketing_content", { data: { channel: "facebook", status: "published" } }, { error: null });
    script("tasks", onBoard("Revenue board"));
    await onSubtaskToggled(tick(false));
    expect(contentWrites()).toEqual([{ status: "approved" }]);
    resetFake();
    script("marketing_content", { data: { channel: "blog", status: "published" } });
    await onSubtaskToggled(tick(false));
    expect(contentWrites()).toEqual([]);
  });

  it("ignores subtasks that are not posts", async () => {
    await onSubtaskToggled({ ...tick(true), subjectType: null, subjectId: null });
    expect(calls).toEqual([]);
  });
});

describe("closing a day of content", () => {
  it("drops the posts not yet out when the day goes to Not Doing, and never unpublishes one that is live", async () => {
    script("tasks", { data: [{ id: "s1", status: "not_doing", subject_id: "a1" }, { id: "s2", status: "done", subject_id: "a2" }] });
    script("marketing_content", { data: { channel: "twitter", status: "approved" } }, { error: null }, { data: { channel: "linkedin", status: "published" } });
    await onCardLanded({ taskId: "day-1", boardSlug: "revenue", status: "not_doing", subjectType: "marketing_day", subjectId: null });
    expect(contentWrites()).toEqual([{ status: "skipped" }]);
  });

  it("does nothing for a day moved between open columns", async () => {
    await onCardLanded({ taskId: "day-1", boardSlug: "revenue", status: "open", subjectType: "marketing_day", subjectId: null });
    expect(calls).toEqual([]);
  });
});

describe("closing a writer card", () => {
  it("archives the campaign and drops its posts not yet out when it goes to Not Doing", async () => {
    script("marketing_campaigns", { error: null });
    script("marketing_content", { data: [{ id: "a1" }] }, { data: { channel: "email", status: "drafted" } }, { error: null });
    await onCardLanded({ taskId: "card-1", boardSlug: "revenue", status: "not_doing", subjectType: "marketing_campaign", subjectId: "camp-1" });
    const campaign = calls.find((c) => c.table === "marketing_campaigns");
    expect(campaign?.payloads[0]).toEqual({ status: "archived" });
    expect(contentWrites()).toEqual([{ status: "skipped" }]);
  });

  it("finishes the campaign when it goes to Done, and leaves its posts as they are", async () => {
    script("marketing_campaigns", { error: null });
    await onCardLanded({ taskId: "card-1", boardSlug: "revenue", status: "done", subjectType: "marketing_campaign", subjectId: "camp-1" });
    expect(calls.find((c) => c.table === "marketing_campaigns")?.payloads[0]).toEqual({ status: "done" });
    expect(contentWrites()).toEqual([]);
  });
});

// R.22: the actor on the audit row and the blog publish is the board the card
// is on, by name, because the content board is chosen by metadata and need not
// be called "Revenue board"; and a board that cannot be read costs the label,
// never the person's move.
describe("who the calendar says made the change", () => {
  it("names the board a ticked post sits on", async () => {
    script("marketing_content", { data: { channel: "linkedin", status: "approved" } }, { error: null });
    script("tasks", onBoard("Growth board"));
    await onSubtaskToggled(tick(true));
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ table: "marketing_content", actor: "Growth board" }));
    expect(calls.find((c) => c.table === "tasks")?.filters).toContainEqual(["eq", "id", "sub-1"]);
  });

  it("names the board a card was landed on, by its slug", async () => {
    resetFake();
    script("boards", { data: { name: "Growth board" } });
    script("marketing_campaigns", { error: null });
    await onCardLanded({ taskId: "card-1", boardSlug: "growth", status: "done", subjectType: "marketing_campaign", subjectId: "camp-1" });
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ table: "marketing_campaigns", actor: "Growth board" }));
    expect(calls.find((c) => c.table === "boards")?.filters).toContainEqual(["eq", "slug", "growth"]);
  });

  it("falls back to a neutral label, and still records the change, when the board cannot be read", async () => {
    script("marketing_content", { data: { channel: "linkedin", status: "approved" } }, { error: null });
    script("tasks", { error: { message: "tasks unavailable" } });
    await onSubtaskToggled(tick(true));
    expect(contentWrites()).toEqual([{ status: "published" }]);
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ actor: "Content board" }));
  });

  it("reads the board once for a day of several posts", async () => {
    script("tasks", { data: [{ id: "s1", status: "done", subject_id: "a1" }, { id: "s2", status: "done", subject_id: "a2" }] });
    script("marketing_content", { data: { channel: "twitter", status: "approved" } }, { error: null }, { data: { channel: "linkedin", status: "approved" } }, { error: null });
    await onCardLanded({ taskId: "day-1", boardSlug: "revenue", status: "done", subjectType: "marketing_day", subjectId: null });
    expect(contentWrites()).toEqual([{ status: "published" }, { status: "published" }]);
    expect(calls.filter((c) => c.table === "boards")).toHaveLength(1);
    expect(recordAudit.mock.calls.map(([row]) => row.actor)).toEqual(["Revenue board", "Revenue board"]);
  });
});
