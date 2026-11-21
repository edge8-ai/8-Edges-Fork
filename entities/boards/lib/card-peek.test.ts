import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// TH.2.6: a card opens in place over the Inbox only for someone the card's own
// board page would let in, and a subtask opens the card it belongs to.

vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const member = vi.hoisted(() => ({ value: false }));
vi.mock("./access", () => ({ isBoardMember: vi.fn(async () => member.value) }));
vi.mock("./data", () => ({
  getBoardBySlug: vi.fn(async () => ({ boards: [{ slug: "eight-edges" }], cards: [{ id: "card-1" }], board: { slug: "eight-edges" } })),
}));

const { cardPeekFor } = await import("./card-peek");
const { isBoardMember } = await import("./access");

const viewer = { personId: "p1", teamMemberId: "tm1", seesEveryBoard: false };
const task = (over: Record<string, unknown> = {}) =>
  script("tasks", { data: [{ id: "card-1", parent_task_id: null, board_id: "b1", board: { slug: "eight-edges" }, ...over }] });

beforeEach(() => {
  resetFake();
  member.value = false;
});
afterEach(() => vi.clearAllMocks());

describe("cardPeekFor", () => {
  it("opens the card for a member of its board", async () => {
    member.value = true;
    task();
    expect(await cardPeekFor("card-1", viewer)).toMatchObject({ kind: "open", cardId: "card-1" });
    expect(vi.mocked(isBoardMember)).toHaveBeenCalledWith("b1", "p1", "tm1");
  });

  it("names no board to someone who is not on it", async () => {
    task();
    expect(await cardPeekFor("card-1", viewer)).toEqual({ kind: "closed", boardSlug: null });
  });

  it("lets a surface that opens every board in without asking about membership", async () => {
    task();
    expect(await cardPeekFor("card-1", { ...viewer, teamMemberId: null, seesEveryBoard: true })).toMatchObject({ kind: "open" });
    expect(vi.mocked(isBoardMember)).not.toHaveBeenCalled();
  });

  it("opens a subtask's parent, which is the card on the board", async () => {
    member.value = true;
    task({ id: "sub-1", parent_task_id: "card-1" });
    expect(await cardPeekFor("sub-1", viewer)).toMatchObject({ kind: "open", cardId: "card-1" });
  });

  it("is closed for an archived or unknown card", async () => {
    script("tasks", { data: [] });
    expect(await cardPeekFor("gone", viewer)).toEqual({ kind: "closed", boardSlug: null });
  });

  it("raises a failed read rather than answering no", async () => {
    script("tasks", { data: null, error: { message: "boom" } });
    await expect(cardPeekFor("card-1", viewer)).rejects.toThrow(/card-peek/);
  });
});
