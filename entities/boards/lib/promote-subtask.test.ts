import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// Promoting a subtask to a card (W.57). The acceptance: the promoted card
// appears in a column with its history intact, the parent shows the link,
// and the board audit's stage-log chain check still returns 0 chain_breaks —
// which is what the `create` row is for.

vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("./mutation", () => ({
  boardMutation: vi.fn(async () => ({ ok: true, actor: { label: "tester", personId: "person-1", isAdmin: true }, row: gateRow })),
}));

let gateRow: Record<string, unknown>;
const { promoteSubtask } = await import("./promote-subtask");

const subtask = (over: Record<string, unknown> = {}) => ({
  board_id: "board-1",
  parent_task_id: "parent-1",
  title: "Write the migration",
  human_tokens: 0.5,
  metadata: {},
  ...over,
});

const PARENT = { title: "Ship the schema change", board_id: "board-1", board_column_id: "col-doing", sprint_id: "sprint-1", epic_id: "epic-1" };

// The reads in order: the parent, endPosition's fallback top position, the
// promotion update, then the token re-derivation's sibling read and write.
function scriptHappyPath(remaining: { human_tokens: number | null }[]) {
  script("tasks", { data: PARENT }, { data: null }, { error: null }, { data: remaining }, { error: null });
  script("task_stage_log", { error: null });
  script("task_comments", { error: null });
}

beforeEach(() => {
  resetFake();
  gateRow = subtask();
  // The parent's column, read to give the promoted card its status (W.141).
  // An open column unless a test says otherwise.
  script("board_columns", { data: { is_done: false, is_not_doing: false } });
});
afterEach(() => vi.clearAllMocks());

describe("promoteSubtask", () => {
  it("clears the parent and lands the card in the parent's column, sprint and epic", async () => {
    scriptHappyPath([{ human_tokens: 0.3 }]);
    expect(await promoteSubtask("sub-1", "board")).toEqual({ ok: true });
    const update = calls.find((c) => c.table === "tasks" && c.ops.includes("update"));
    expect(update?.payloads[0]).toEqual({
      parent_task_id: null,
      board_column_id: "col-doing",
      sprint_id: "sprint-1",
      epic_id: "epic-1",
      position: 1,
      status: "open",
      completed_at: null,
    });
    expect(update?.filters).toEqual([["eq", "id", "sub-1"]]);
  });

  // W.141: a subtask added to a finished card is open; promoting it into the
  // parent's Done column left an open card there, which every stored-status
  // reader counted as work still owed.
  it("gives the promoted card the status of the column it lands in", async () => {
    resetFake();
    script("board_columns", { data: { is_done: true, is_not_doing: false } });
    scriptHappyPath([{ human_tokens: 0.3 }]);
    expect(await promoteSubtask("sub-1", "board")).toEqual({ ok: true });
    const update = calls.find((c) => c.table === "tasks" && c.ops.includes("update"));
    expect(update?.payloads[0]).toMatchObject({ status: "done", completed_at: expect.any(String) });
  });

  it("refuses rather than guess when the parent's column cannot be read", async () => {
    resetFake();
    script("board_columns", { error: { message: "columns unavailable" } });
    scriptHappyPath([]);
    const res = await promoteSubtask("sub-1", "board");
    expect(res).toEqual({ ok: false, error: "Could not read the parent card's column: columns unavailable" });
    expect(calls.some((c) => c.table === "tasks" && c.ops.includes("update"))).toBe(false);
  });

  it("writes a create row, so the Flow view can age the card and the chain does not break", async () => {
    scriptHappyPath([{ human_tokens: 0.3 }]);
    await promoteSubtask("sub-1", "board");
    const log = calls.find((c) => c.table === "task_stage_log");
    expect(log?.payloads[0]).toEqual(
      expect.objectContaining({ task_id: "sub-1", from_column_id: null, to_column_id: "col-doing", kind: "create" }),
    );
  });

  it("leaves a line on both cards saying where the work went and where it came from", async () => {
    scriptHappyPath([{ human_tokens: 0.3 }]);
    await promoteSubtask("sub-1", "board");
    const comments = calls.find((c) => c.table === "task_comments")?.payloads[0] as { task_id: string; body: string }[];
    expect(comments.map((c) => c.task_id)).toEqual(["parent-1", "sub-1"]);
    expect(comments[0].body).toContain("Write the migration");
    expect(comments[1].body).toContain("Ship the schema change");
  });

  it("re-derives the parent as the sum of what remains", async () => {
    scriptHappyPath([{ human_tokens: 0.3 }, { human_tokens: 0.2 }]);
    await promoteSubtask("sub-1", "board");
    const parentWrite = calls.filter((c) => c.table === "tasks" && c.ops.includes("update")).at(-1);
    expect(parentWrite?.payloads[0]).toEqual({ human_tokens: 0.5 });
    expect(parentWrite?.filters).toEqual([["eq", "id", "parent-1"]]);
  });

  it("clears the parent's estimate when the SIZED part it was derived from has left", async () => {
    // Its figure was a sum of parts, and one of those parts is now somebody
    // else's card. Inheriting the number would double-count the work.
    scriptHappyPath([{ human_tokens: null }]);
    await promoteSubtask("sub-1", "board");
    expect(calls.filter((c) => c.table === "tasks" && c.ops.includes("update")).at(-1)?.payloads[0]).toEqual({ human_tokens: null });
  });

  it("leaves the parent's estimate alone when the part that left was unsized", async () => {
    // Nothing the figure was derived from changed, so nothing about it should.
    gateRow = subtask({ human_tokens: null });
    script("tasks", { data: PARENT }, { data: null }, { error: null }, { data: [{ human_tokens: null }] });
    script("task_stage_log", { error: null });
    script("task_comments", { error: null });
    expect(await promoteSubtask("sub-1", "board")).toEqual({ ok: true });
    // Two task updates only: the promotion, and none on the parent.
    expect(calls.filter((c) => c.table === "tasks" && c.ops.includes("update"))).toHaveLength(1);
  });

  it("refuses a card that is already a card", async () => {
    gateRow = subtask({ parent_task_id: null });
    expect(await promoteSubtask("sub-1", "board")).toEqual({ ok: false, error: "That is already a card." });
    expect(calls).toHaveLength(0);
  });

  it("refuses a blocker, which is a child task but is not a subtask", async () => {
    gateRow = subtask({ metadata: { kind: "blocker" } });
    const r = await promoteSubtask("sub-1", "board");
    expect(r.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("says what did land when a follow-up fails, rather than pretending the promotion did not happen", async () => {
    script("tasks", { data: PARENT }, { data: null }, { error: null }, { data: [] }, { error: null });
    script("task_stage_log", { error: { message: "history unavailable" } });
    script("task_comments", { error: null });
    const r = await promoteSubtask("sub-1", "board");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/^Card promoted, but/);
    expect(r.error).toContain("history unavailable");
  });

  it("does not report a missing parent as a promotion that half-worked", async () => {
    script("tasks", { error: { message: "read timeout" } });
    const r = await promoteSubtask("sub-1", "board");
    expect(r).toEqual({ ok: false, error: "Could not load the parent card: read timeout" });
    expect(calls.filter((c) => c.ops.includes("update"))).toHaveLength(0);
  });
});
