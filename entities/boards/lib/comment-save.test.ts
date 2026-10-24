import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// TH.2: a saved comment tells the inbox — each person newly tagged, and the
// card's owner unless the comment already tagged them or they wrote it.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: vi.fn(async () => undefined) }));
vi.mock("./card-helpers", () => ({ ensureMember: vi.fn(async () => null), refresh: vi.fn() }));
vi.mock("./mention-notify", () => ({ notifyMentioned: vi.fn(async () => undefined) }));
const published = vi.hoisted(() => [] as [string, Record<string, unknown>][]);
vi.mock("@/kernel/events", () => ({ publish: vi.fn(async (name: string, payload: Record<string, unknown>) => void published.push([name, payload])) }));

const { saveComment } = await import("./comment-save");

const MAI = "aaaaaaaa-0000-4000-8000-000000000001";
const KHOA = "aaaaaaaa-0000-4000-8000-000000000002";
const OWNER = "aaaaaaaa-0000-4000-8000-000000000003";
const actor = { label: "Mai", personId: MAI, isAdmin: false };
const card = { id: "t-1", board_id: "b-1", title: "Y.67", assignee_id: OWNER };

beforeEach(() => {
  resetFake();
  published.length = 0;
});

describe("saveComment states the comment (TH.2)", () => {
  it("states a mention to the person tagged and a comment to the card's owner", async () => {
    script("people", { data: [{ id: KHOA, email: "khoa@example.com", is_team_member: true }] });
    script("task_comments", { data: { id: "c-1" } });
    const r = await saveComment(actor, card, { body: "@Khoa which eval?", mentions: [KHOA] }, "eight-edges");
    expect(r).toEqual({ ok: true });
    expect(published.map(([name, p]) => [name, p.assigneeId, p.commentId])).toEqual([
      ["board.card.mentioned", KHOA, "c-1"],
      ["board.card.commented", OWNER, "c-1"],
    ]);
  });

  it("tells an owner who was tagged once, as a mention", async () => {
    script("people", { data: [{ id: OWNER, email: "owner@example.com", is_team_member: true }] });
    script("task_comments", { data: { id: "c-2" } });
    await saveComment(actor, card, { body: "@Owner look", mentions: [OWNER] }, "eight-edges");
    expect(published.map(([name, p]) => [name, p.assigneeId])).toEqual([["board.card.mentioned", OWNER]]);
  });

  // TH.8.3: a reply is news to the comment's author, told once.
  it("states a reply to the comment's author, and the owner hears the comment", async () => {
    script("task_comments", { data: { task_id: "t-1", parent_comment_id: null, author_person_id: KHOA } }, { data: { id: "c-3" } });
    await saveComment(actor, card, { body: "Done, see the PR", parentCommentId: "aaaaaaaa-0000-4000-8000-0000000000c1" }, "eight-edges");
    expect(published.map(([name, p]) => [name, p.assigneeId, p.commentId])).toEqual([
      ["board.comment.replied", KHOA, "c-3"],
      ["board.card.commented", OWNER, "c-3"],
    ]);
  });

  it("tells an owner who wrote the comment replied to once, as a reply", async () => {
    script("task_comments", { data: { task_id: "t-1", parent_comment_id: null, author_person_id: OWNER } }, { data: { id: "c-4" } });
    await saveComment(actor, card, { body: "Agreed", parentCommentId: "aaaaaaaa-0000-4000-8000-0000000000c1" }, "eight-edges");
    expect(published.map(([name, p]) => [name, p.assigneeId])).toEqual([["board.comment.replied", OWNER]]);
  });

  it("states no reply when someone answers their own comment", async () => {
    script("task_comments", { data: { task_id: "t-1", parent_comment_id: null, author_person_id: MAI } }, { data: { id: "c-5" } });
    await saveComment(actor, card, { body: "One more thing", parentCommentId: "aaaaaaaa-0000-4000-8000-0000000000c1" }, "eight-edges");
    expect(published.map(([name]) => name)).toEqual(["board.card.commented"]);
  });

  it("states nothing when the comment did not save", async () => {
    script("task_comments", { error: { message: "insert failed" } });
    const r = await saveComment(actor, card, { body: "Hello" }, "eight-edges");
    expect(r.ok).toBe(false);
    expect(published).toEqual([]);
  });
});
