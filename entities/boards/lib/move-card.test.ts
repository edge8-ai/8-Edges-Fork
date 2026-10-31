import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";
import { DENIED } from "./card-helpers";

// moveCardColumn resolves the target column on the card's own board and hands
// the landing to landCard (A.1; the landing contract is land-card.test.ts's).
// What this suite pins is the resolution: the gate's deny-before-disclose, a
// failed lookup never reported as "not found" or "not on this board", the
// same-column no-op, and that a good drop lands the card in that column.

vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("@/entities/boards/lib/access", () => ({
  boardActorFor: vi.fn(async () => ({ label: "tester", personId: "person-1", isAdmin: true })),
}));
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: vi.fn(async () => undefined) }));
const published: [string, unknown][] = [];
// Every landing also states `board.card.landed` (the Revenue board's content
// sync listens); these tests are about the completion, so it is set aside.
vi.mock("@/kernel/events", () => ({ publish: async (n: string, p: unknown) => { if (n !== "board.card.landed") published.push([n, p]); } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { moveCardColumn } = await import("./move-card");

beforeEach(() => {
  resetFake();
  published.length = 0;
});
afterEach(() => vi.clearAllMocks());

const TASK = { id: "task-1", board_id: "board-1", board_column_id: "col-a", subject_type: null, subject_id: null };

describe("moveCardColumn", () => {
  it("AC2: reports the DB message, not 'Card not found', when the lookup errors", async () => {
    script("tasks", { error: { message: "connection reset" } });
    const r = await moveCardColumn("task-1", "col-b", "board");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("connection reset");
    expect(r.error).not.toContain("Card not found");
  });

  it("reports the DB message when the column lookup errors, not 'not on this board'", async () => {
    // W.2 sweep: the column read's error was logged and then ignored, so a
    // transient database fault told the user they had dropped on a bad column.
    script("tasks", { data: TASK });
    script("board_columns", { error: { message: "connection reset" } });
    const r = await moveCardColumn("task-1", "col-b", "board");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("connection reset");
    expect(r.error).not.toContain("not on this board");
  });

  it("refuses a column that is not on the card's board", async () => {
    script("tasks", { data: TASK });
    script("board_columns", { data: null });
    expect(await moveCardColumn("task-1", "col-elsewhere", "board")).toEqual({ ok: false, error: "That column is not on this board." });
    expect(calls.every((c) => !c.ops.includes("update"))).toBe(true);
  });

  // AR-26 moved the lookup behind `boardMutation`, which decides deny-before-
  // disclose once for every board mutation: a card that is gone and a card the
  // caller may not touch now read the same, so a task id no longer probes for
  // existence. A failed lookup (above) stays distinct.
  it("gives a genuine miss the same answer a denied actor gets", async () => {
    script("tasks", { data: null });
    const missing = await moveCardColumn("task-1", "col-b", "board");

    resetFake();
    script("tasks", { data: TASK });
    const { boardActorFor } = await import("./access");
    vi.mocked(boardActorFor).mockResolvedValue(null);
    const denied = await moveCardColumn("task-1", "col-b", "board");
    // `vi.clearAllMocks()` clears calls, not implementations, so the permitted
    // actor the factory set up has to be put back for the rest of the file.
    vi.mocked(boardActorFor).mockResolvedValue({ label: "tester", personId: "person-1", isAdmin: true });

    expect(denied).toEqual(missing);
    expect(denied).toEqual({ ok: false, error: DENIED });
    expect(calls.every((c) => !c.ops.includes("update"))).toBe(true);
  });

  it("is a no-op when the card is already in that column", async () => {
    script("tasks", { data: TASK });
    script("board_columns", { data: { id: "col-a", is_done: false } });
    expect(await moveCardColumn("task-1", "col-a", "board")).toEqual({ ok: true });
    expect(calls.every((c) => !c.ops.includes("update"))).toBe(true);
  });

  it("lands the card in the resolved column, done state included", async () => {
    // The lookup, then landCard's top position, card update, the does-it-
    // repeat read (W.59, null = it does not) and the children close.
    script("tasks", { data: TASK }, { data: null }, { error: null }, { data: null }, { error: null });
    // The target column, then landCard's read of the column the card leaves.
    script("board_columns", { data: { id: "col-done", is_done: true } }, { data: { is_done: false } });
    script("task_stage_log", { error: null });
    expect(await moveCardColumn("task-1", "col-done", "board")).toEqual({ ok: true });
    const cardUpdate = calls.find((c) => c.table === "tasks" && c.ops[0] === "update" && !c.ops.includes("neq"));
    expect(cardUpdate?.payloads[0]).toEqual(expect.objectContaining({ board_id: "board-1", board_column_id: "col-done", status: "done" }));
    expect(published).toEqual([["board.card.completed", { taskId: "task-1", boardSlug: "board", subjectType: null, subjectId: null, actorPersonId: "person-1" }]]);
  });
});
