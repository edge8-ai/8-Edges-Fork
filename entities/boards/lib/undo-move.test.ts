import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// The undo's whole value is that it reads the inverse rather than guessing it
// (W.50), so what this suite pins is the reading: the target comes off the
// latest stage-log row, a failed read never reads as "nothing to undo", a card
// that has moved on since is refused rather than dragged backwards, and the
// undo writes a stage-log row of its own whose `from` is where the card is —
// which is the condition the board audit counts as chain_breaks.

vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("@/entities/boards/lib/access", () => ({
  boardActorFor: vi.fn(async () => ({ label: "tester", personId: "person-1", isAdmin: true })),
}));
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: vi.fn(async () => undefined), recordAuditMany: vi.fn(async () => undefined) }));
vi.mock("@/kernel/events", () => ({ publish: vi.fn(async () => undefined) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { undoCardMove, undoCardSprint } = await import("./undo-move");
const { recordAuditMany } = await import("@/kernel/audit/audit");
// A sprint as the lock reads it, started long ago and unlocked unless a test says otherwise.
const sprint = (id: string, over: Record<string, unknown> = {}) => ({ id, board_id: "board-1", name: `Sprint ${id}`, locked_at: null, starts_on: "2000-01-01", ...over });

beforeEach(resetFake);
afterEach(() => vi.clearAllMocks());

const TASK = { id: "task-1", board_id: "board-1", board_column_id: "col-b", subject_type: null, subject_id: null };
const stageRow = (over: Record<string, unknown> = {}) => ({
  from_column_id: "col-a",
  to_column_id: "col-b",
  from_sprint_id: null,
  to_sprint_id: null,
  ...over,
});

// A sprint landing inserts its rows as a batch, a column landing as one row.
const logRows = () => calls.filter((c) => c.table === "task_stage_log" && c.ops.includes("insert")).flatMap((c) => c.payloads.flat()) as Record<string, unknown>[];

describe("undoCardMove", () => {
  it("lands the card in the column the stage log says it came from", async () => {
    script("tasks", { data: TASK });
    script("task_stage_log", { data: stageRow() });
    script("board_columns", { data: { id: "col-a", is_done: false } });
    // landCard's own queries: the end-position read, the task update, the log.
    script("tasks", { data: { position: 3 } }, { error: null });
    script("task_stage_log", { error: null });

    expect(await undoCardMove("task-1", "board")).toEqual({ ok: true });
    const update = calls.find((c) => c.table === "tasks" && c.ops.includes("update"));
    expect((update?.payloads[0] as { board_column_id: string }).board_column_id).toBe("col-a");
  });

  it("writes its own move row, from where the card is to where it goes back", async () => {
    script("tasks", { data: TASK });
    script("task_stage_log", { data: stageRow() });
    script("board_columns", { data: { id: "col-a", is_done: false } });
    script("tasks", { data: { position: 3 } }, { error: null });
    script("task_stage_log", { error: null });

    await undoCardMove("task-1", "board");
    expect(logRows()).toEqual([
      expect.objectContaining({ task_id: "task-1", from_column_id: "col-b", to_column_id: "col-a", kind: "move", note: "undo" }),
    ]);
  });

  it("S.13: undoing a logged Done-to-same-Done row lands the card without completing it again", async () => {
    // Six cards carry such a row (written by SQL outside the app on 13 Sep), so
    // the undo button on any of them re-lands the card in the Done it is in.
    const done = { ...TASK, board_column_id: "col-done" };
    script("tasks", { data: done });
    script("task_stage_log", { data: stageRow({ from_column_id: "col-done", to_column_id: "col-done" }) });
    script("board_columns", { data: { id: "col-done", is_done: true } }, { data: { is_done: true } });
    // Position, the card update and the children close; no repeat read.
    script("tasks", { data: { position: 3 } }, { error: null }, { error: null });
    script("task_stage_log", { error: null });

    expect(await undoCardMove("task-1", "board")).toEqual({ ok: true });
    const { publish } = await import("@/kernel/events");
    // No completion: the only fact stated is where the card landed.
    expect(publish).not.toHaveBeenCalledWith("board.card.completed", expect.anything());
    const update = calls.find((c) => c.table === "tasks" && c.ops.includes("update") && !c.ops.includes("neq"));
    expect(update?.payloads[0]).not.toHaveProperty("completed_at");
  });

  it("refuses when the card has moved on since that move", async () => {
    script("tasks", { data: { ...TASK, board_column_id: "col-c" } });
    script("task_stage_log", { data: stageRow() });
    const r = await undoCardMove("task-1", "board");
    expect(r).toEqual({ ok: false, error: "This card has moved since — there is nothing left to undo." });
    expect(calls.every((c) => !c.ops.includes("update"))).toBe(true);
  });

  it("reports a failed history read rather than 'nothing to undo'", async () => {
    script("tasks", { data: TASK });
    script("task_stage_log", { error: { message: "connection reset" } });
    const r = await undoCardMove("task-1", "board");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("connection reset");
    expect(r.error).not.toContain("no earlier move");
  });

  it("refuses when the column the card came from has left the board", async () => {
    script("tasks", { data: TASK });
    script("task_stage_log", { data: stageRow() });
    script("board_columns", { data: null });
    const r = await undoCardMove("task-1", "board");
    expect(r).toEqual({ ok: false, error: "The column that card came from is no longer on this board." });
  });

  it("has nowhere to put back a card whose move row has no from-column", async () => {
    script("tasks", { data: TASK });
    script("task_stage_log", { data: stageRow({ from_column_id: null }) });
    const r = await undoCardMove("task-1", "board");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("first column");
  });
});

describe("undoCardSprint", () => {
  it("puts the card back in the sprint the log names, logging the reverse move", async () => {
    script("tasks", { data: { board_id: "board-1", sprint_id: "sprint-2" } });
    script("task_stage_log", { data: stageRow({ from_sprint_id: "sprint-1", to_sprint_id: "sprint-2" }) });
    // Both ends in one read: the sprint it goes back to, and the one it leaves.
    script("sprints", { data: [sprint("sprint-1"), sprint("sprint-2")] });
    script("tasks", { error: null });
    script("task_stage_log", { error: null });

    expect(await undoCardSprint("task-1", "board")).toEqual({ ok: true });
    const update = calls.find((c) => c.table === "tasks" && c.ops.includes("update"));
    expect(update?.payloads[0]).toEqual({ sprint_id: "sprint-1" });
    expect(logRows()).toEqual([
      expect.objectContaining({ from_sprint_id: "sprint-2", to_sprint_id: "sprint-1", kind: "sprint_move", note: "undo" }),
    ]);
  });

  it("treats the backlog as a real destination", async () => {
    script("tasks", { data: { board_id: "board-1", sprint_id: "sprint-2" } });
    script("task_stage_log", { data: stageRow({ from_sprint_id: null, to_sprint_id: "sprint-2" }) });
    // Only the sprint it leaves is read, for the lock: the backlog has none.
    script("sprints", { data: [sprint("sprint-2")] });
    script("tasks", { error: null });
    script("task_stage_log", { error: null });

    expect(await undoCardSprint("task-1", "board")).toEqual({ ok: true });
    const update = calls.find((c) => c.table === "tasks" && c.ops.includes("update"));
    expect(update?.payloads[0]).toEqual({ sprint_id: null });
    expect(calls.find((c) => c.table === "sprints")?.filters).toEqual([["in", "id", ["sprint-2"]]]);
  });

  it("refuses when the sprint it came from has left the board", async () => {
    script("tasks", { data: { board_id: "board-1", sprint_id: "sprint-2" } });
    script("task_stage_log", { data: stageRow({ from_sprint_id: "sprint-1", to_sprint_id: "sprint-2" }) });
    script("sprints", { data: [sprint("sprint-2")] });
    expect(await undoCardSprint("task-1", "board")).toEqual({ ok: false, error: "That sprint is not on this board." });
    expect(calls.every((c) => !c.ops.includes("update"))).toBe(true);
  });

  // A.41: an undo is a move, so a lock that engaged since the move refuses it,
  // as it refuses the same change from the drawer or the list.
  it("respects the sprint lock: a card committed before planning finished stays committed", async () => {
    script("tasks", { data: { board_id: "board-1", sprint_id: "sprint-2" } });
    script("task_stage_log", { data: stageRow({ from_sprint_id: null, to_sprint_id: "sprint-2" }) });
    script("sprints", { data: [sprint("sprint-2", { locked_at: "2026-09-22T09:00:00Z", starts_on: "2999-01-01" })] });
    const r = await undoCardSprint("task-1", "board");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("is locked");
    expect(calls.every((c) => !c.ops.includes("update") && !c.ops.includes("insert"))).toBe(true);
  });

  // BUG-5: the undo returned on a failed history write before its audit row.
  it("audits the undo even when its history row cannot be written", async () => {
    script("tasks", { data: { board_id: "board-1", sprint_id: "sprint-2" } });
    script("task_stage_log", { data: stageRow({ from_sprint_id: null, to_sprint_id: "sprint-2" }) });
    script("sprints", { data: [sprint("sprint-2")] });
    script("tasks", { error: null });
    script("task_stage_log", { error: { message: "history unavailable" } });
    const r = await undoCardSprint("task-1", "board");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("history unavailable");
    expect(recordAuditMany).toHaveBeenCalledTimes(1);
  });

  it("refuses when the card's sprint is no longer the one that row landed it in", async () => {
    script("tasks", { data: { board_id: "board-1", sprint_id: "sprint-3" } });
    script("task_stage_log", { data: stageRow({ from_sprint_id: "sprint-1", to_sprint_id: "sprint-2" }) });
    const r = await undoCardSprint("task-1", "board");
    expect(r.ok).toBe(false);
    expect(calls.every((c) => !c.ops.includes("update"))).toBe(true);
  });

  it("says so when the card has no sprint history at all", async () => {
    script("tasks", { data: { board_id: "board-1", sprint_id: null } });
    script("task_stage_log", { data: null });
    expect(await undoCardSprint("task-1", "board")).toEqual({ ok: false, error: "There is no earlier move on this card to undo." });
  });
});
