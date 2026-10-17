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

  it("states nothing when the comment did not save", async () => {
    script("task_comments", { error: { message: "insert failed" } });
    const r = await saveComment(actor, card, { body: "Hello" }, "eight-edges");
    expect(r.ok).toBe(false);
    expect(published).toEqual([]);
  });
});
