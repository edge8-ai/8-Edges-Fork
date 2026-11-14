import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, opsFor, resetFake, script } from "@/kernel/data/testing/fake-company-os";
import { DENIED } from "./card-helpers";
import { MAX_MENTIONS } from "./schemas";

// W.143: a comment may answer a thread (one level), tag people, and a thread
// can be resolved and reopened. The gate is mocked to a permitted actor; what
// these pin down is everything after it — the parent check, which mentions are
// kept and who is told, and that resolving writes the right row or nothing.

vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: vi.fn(async () => undefined) }));
vi.mock("./mention-notify", () => ({ notifyMentioned: vi.fn(async () => undefined) }));
vi.mock("./mutation", () => ({
  boardMutation: vi.fn(async () => ({
    ok: true,
    actor: { label: "Ada Rivers", personId: AUTHOR, isAdmin: false },
    row: { board_id: "board-1", title: "Write the spec" },
  })),
}));
// actions.ts reaches the company-os door, whose modules wrap readers in
// unstable_cache and React's `cache` at load; keep both inert, as actions.test.ts does.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), unstable_cache: <T,>(fn: T) => fn }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  cache: <T,>(fn: T) => fn,
}));

const AUTHOR = "00000000-0000-4000-8000-000000000001";
const BEN = "00000000-0000-4000-8000-000000000002";
const CONTACT = "00000000-0000-4000-8000-000000000003";
const THREAD = "00000000-0000-4000-8000-00000000000a";
const REPLY = "00000000-0000-4000-8000-00000000000b";

const { addComment } = await import("./actions");
const { resolveThread } = await import("./comment-actions");
const { notifyMentioned } = await import("./mention-notify");
const { boardMutation } = await import("./mutation");
const { recordAudit } = await import("@/kernel/audit/audit");

const inserted = () => calls.find((c) => c.table === "task_comments" && c.ops[0] === "insert")?.payloads[0] as Record<string, unknown> | undefined;
const updated = () => calls.find((c) => c.table === "task_comments" && c.ops[0] === "update");

beforeEach(() => resetFake());
afterEach(() => vi.clearAllMocks());

describe("addComment (W.143)", () => {
  it("writes a top-level comment with no parent and no mentions, and audits it", async () => {
    script("task_comments", { data: { id: THREAD } });
    expect(await addComment("task-1", "  Looks right  ", "board")).toEqual({ ok: true });
    expect(inserted()).toEqual({ task_id: "task-1", author_person_id: AUTHOR, author_label: "Ada Rivers", body: "Looks right", parent_comment_id: null, mentions: [] });
    expect(vi.mocked(recordAudit)).toHaveBeenCalledWith(expect.objectContaining({ table: "task_comments", recordId: THREAD, operation: "insert" }));
    expect(vi.mocked(notifyMentioned)).toHaveBeenCalledWith(expect.objectContaining({ targets: [] }));
  });

  it("writes a reply under a top-level comment on the same card", async () => {
    script("task_comments", { data: { task_id: "task-1", parent_comment_id: null } }, { data: { id: REPLY } });
    expect(await addComment("task-1", "Done", "board", { parentCommentId: THREAD })).toEqual({ ok: true });
    expect(inserted()).toMatchObject({ parent_comment_id: THREAD });
  });

  it("refuses a reply to a reply and writes nothing", async () => {
    script("task_comments", { data: { task_id: "task-1", parent_comment_id: THREAD } });
    const r = await addComment("task-1", "Me too", "board", { parentCommentId: REPLY });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/cannot be replied to/);
    expect(opsFor("task_comments")).toEqual([["select", "eq", "maybeSingle"]]);
  });

  it("refuses a parent from another card", async () => {
    script("task_comments", { data: { task_id: "task-2", parent_comment_id: null } });
    expect(await addComment("task-1", "Hm", "board", { parentCommentId: THREAD })).toEqual({ ok: false, error: "That comment is not on this card." });
    expect(inserted()).toBeUndefined();
  });

  it("says the parent could not be loaded, rather than that it is missing, when the read fails", async () => {
    script("task_comments", { error: { message: "timeout" } });
    const r = await addComment("task-1", "Hm", "board", { parentCommentId: THREAD });
    expect(r).toEqual({ ok: false, error: "Could not load the comment you are replying to: timeout" });
  });

  it("keeps only team members as mentions and tells each of them but never the author", async () => {
    script("people", {
      data: [
        { id: BEN, email: "ben@example.com", is_team_member: true },
        { id: CONTACT, email: "client@example.com", is_team_member: false },
        { id: AUTHOR, email: "ada@example.com", is_team_member: true },
      ],
    });
    script("task_comments", { data: { id: THREAD } });
    // Ben joins the board (W.143 review); the author already can see it.
    script("board_members", { error: null });
    const r = await addComment("task-1", "@Ben Okafor @Ada Rivers see this", "board", { mentions: [BEN, CONTACT, AUTHOR, BEN] });
    expect(r).toEqual({ ok: true });
    expect(inserted()?.mentions).toEqual([BEN, AUTHOR]);
    expect(vi.mocked(notifyMentioned)).toHaveBeenCalledWith(
      expect.objectContaining({ boardId: "board-1", cardId: "task-1", cardTitle: "Write the spec", targets: [{ id: BEN, email: "ben@example.com" }] }),
    );
  });

  // W.143 review: a mention's message links to the card, so the person joins
  // the board the way an assignee does, or the link would not open for them.
  it("adds each mentioned person, but not the author, to the board", async () => {
    script("people", { data: [{ id: BEN, email: "ben@example.com", is_team_member: true }, { id: AUTHOR, email: "ada@example.com", is_team_member: true }] });
    script("task_comments", { data: { id: THREAD } });
    script("board_members", { error: null });
    expect(await addComment("task-1", "@Ben Okafor see this", "board", { mentions: [BEN, AUTHOR] })).toEqual({ ok: true });
    const joins = calls.filter((c) => c.table === "board_members");
    expect(joins).toHaveLength(1);
    expect(joins[0].payloads[0]).toMatchObject({ board_id: "board-1", person_id: BEN, role: "member" });
  });

  it("says the comment was posted when a mentioned person could not be added to the board", async () => {
    script("people", { data: [{ id: BEN, email: "ben@example.com", is_team_member: true }] });
    script("task_comments", { data: { id: THREAD } });
    script("board_members", { error: { message: "members locked" } });
    const r = await addComment("task-1", "@Ben Okafor see this", "board", { mentions: [BEN] });
    expect(r).toEqual({ ok: false, error: expect.stringContaining("Comment posted, but") });
    expect(inserted()).toBeDefined();
    expect(vi.mocked(notifyMentioned)).toHaveBeenCalled();
  });

  it("refuses the comment when it cannot check who was mentioned, and tells nobody", async () => {
    script("people", { error: { message: "people unavailable" } });
    const r = await addComment("task-1", "@Ben Okafor", "board", { mentions: [BEN] });
    expect(r).toEqual({ ok: false, error: "Could not check who was mentioned: people unavailable" });
    expect(inserted()).toBeUndefined();
    expect(vi.mocked(notifyMentioned)).not.toHaveBeenCalled();
  });

  it(`refuses more than ${MAX_MENTIONS} mentions and anything that is not a person id`, async () => {
    const many = Array.from({ length: MAX_MENTIONS + 1 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    expect(await addComment("task-1", "hi", "board", { mentions: many })).toMatchObject({ ok: false });
    expect(await addComment("task-1", "hi", "board", { mentions: ["Ben"] })).toMatchObject({ ok: false });
    expect(calls).toEqual([]);
  });

  it("refuses an empty comment", async () => {
    expect(await addComment("task-1", "   ", "board")).toEqual({ ok: false, error: "Write a comment first." });
    expect(calls).toEqual([]);
  });

  it("tells nobody when the comment itself could not be saved", async () => {
    script("people", { data: [{ id: BEN, email: "ben@example.com", is_team_member: true }] });
    script("task_comments", { error: { message: "insert failed" } });
    expect(await addComment("task-1", "@Ben Okafor", "board", { mentions: [BEN] })).toEqual({ ok: false, error: "insert failed" });
    expect(vi.mocked(notifyMentioned)).not.toHaveBeenCalled();
  });
});

describe("resolveThread (W.143)", () => {
  it("resolves an open thread, naming who resolved it", async () => {
    script("task_comments", { data: { task_id: "task-1", parent_comment_id: null, resolved_at: null } }, { error: null });
    expect(await resolveThread("task-1", THREAD, true, "board")).toEqual({ ok: true });
    const u = updated();
    expect(u?.payloads[0]).toMatchObject({ resolved_by_person_id: AUTHOR, resolved_by_label: "Ada Rivers" });
    expect((u?.payloads[0] as { resolved_at: string }).resolved_at).toEqual(expect.any(String));
    expect(u?.filters).toEqual(expect.arrayContaining([["eq", "id", THREAD], ["eq", "task_id", "task-1"]]));
    expect(vi.mocked(recordAudit)).toHaveBeenCalledWith(expect.objectContaining({ table: "task_comments", recordId: THREAD, operation: "update" }));
  });

  it("reopens a resolved thread by clearing all three fields", async () => {
    script("task_comments", { data: { task_id: "task-1", parent_comment_id: null, resolved_at: "2026-09-24T00:00:00Z" } }, { error: null });
    expect(await resolveThread("task-1", THREAD, false, "board")).toEqual({ ok: true });
    expect(updated()?.payloads[0]).toEqual({ resolved_at: null, resolved_by_person_id: null, resolved_by_label: null });
  });

  it("keeps the first resolver's name when a thread is resolved twice", async () => {
    script("task_comments", { data: { task_id: "task-1", parent_comment_id: null, resolved_at: "2026-09-24T00:00:00Z" } });
    expect(await resolveThread("task-1", THREAD, true, "board")).toEqual({ ok: true });
    expect(updated()).toBeUndefined();
  });

  it("refuses to resolve a reply on its own", async () => {
    script("task_comments", { data: { task_id: "task-1", parent_comment_id: THREAD, resolved_at: null } });
    const r = await resolveThread("task-1", REPLY, true, "board");
    expect(!r.ok && r.error).toMatch(/resolved with its thread/);
    expect(updated()).toBeUndefined();
  });

  it("refuses a comment that is on another card", async () => {
    script("task_comments", { data: { task_id: "task-2", parent_comment_id: null, resolved_at: null } });
    expect(await resolveThread("task-1", THREAD, true, "board")).toEqual({ ok: false, error: "That comment is not on this card." });
    expect(updated()).toBeUndefined();
  });

  it("says the thread could not be loaded when the read fails", async () => {
    script("task_comments", { error: { message: "timeout" } });
    expect(await resolveThread("task-1", THREAD, true, "board")).toEqual({ ok: false, error: "Could not load the thread: timeout" });
  });

  it("returns the write's error", async () => {
    script("task_comments", { data: { task_id: "task-1", parent_comment_id: null, resolved_at: null } }, { error: { message: "permission denied" } });
    expect(await resolveThread("task-1", THREAD, true, "board")).toEqual({ ok: false, error: "permission denied" });
  });

  it("denies a non-member and touches nothing", async () => {
    vi.mocked(boardMutation).mockResolvedValueOnce({ ok: false, error: DENIED });
    expect(await resolveThread("task-1", THREAD, true, "board")).toEqual({ ok: false, error: DENIED });
    expect(calls).toEqual([]);
  });

  it("denies a non-member a comment, too", async () => {
    vi.mocked(boardMutation).mockResolvedValueOnce({ ok: false, error: DENIED });
    expect(await addComment("task-1", "hi", "board", { mentions: [BEN] })).toEqual({ ok: false, error: DENIED });
    expect(calls).toEqual([]);
  });
});
