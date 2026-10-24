import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script, tick, timeline } from "@/kernel/data/testing/fake-company-os";

// The sprint landing contract (A.41), tested once for its three callers: a
// card committed to a sprint, a closing sprint's rollover and an undo. What
// these pin is the order and the reporting: the target is a sprint on this
// board, the lock refuses only when it applies, one update moves every card,
// each card gets its history row, and the audit row is written whenever the
// update persisted, before a failed history write is reported (BUG-5).

vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const audited: { at: number; label: string }[] = [];
vi.mock("@/kernel/audit/audit", () => ({
  recordAuditMany: vi.fn(async () => {
    audited.push({ at: tick(), label: "audit" });
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { landInSprint } = await import("./land-in-sprint");
const { recordAuditMany } = await import("@/kernel/audit/audit");

const ACTOR = { label: "tester", personId: "person-1", isAdmin: true };
// Far from any real date, so the suite does not depend on the day it runs.
const NOT_STARTED = "2999-01-01";
const STARTED = "2000-01-01";
const LOCKED = "2026-09-22T09:00:00Z";
const sprint = (id: string, over: Record<string, unknown> = {}) => ({ id, board_id: "board-1", name: `Sprint ${id}`, locked_at: null, starts_on: STARTED, ...over });

const move = (over: Record<string, unknown> = {}) => ({
  taskIds: ["task-1"],
  actor: ACTOR,
  boardId: "board-1",
  from: "s-1",
  to: "s-2",
  kind: "sprint_move" as const,
  lock: "apply" as const,
  logNote: null,
  refreshSlugs: ["board"],
  ...over,
});
const wrote = () => calls.some((c) => c.ops.includes("update") || c.ops.includes("insert"));
const logRows = () => calls.filter((c) => c.table === "task_stage_log").flatMap((c) => c.payloads.flat()) as Record<string, unknown>[];

beforeEach(() => {
  resetFake();
  audited.length = 0;
});
afterEach(() => vi.clearAllMocks());

describe("landInSprint", () => {
  it("moves the card, logs the move and audits it, in that order", async () => {
    script("sprints", { data: [sprint("s-1"), sprint("s-2")] });
    script("tasks", { error: null });
    script("task_stage_log", { error: null });
    expect(await landInSprint(move())).toEqual({ ok: true });
    const update = calls.find((c) => c.table === "tasks");
    expect(update?.payloads[0]).toEqual({ sprint_id: "s-2" });
    expect(update?.filters).toEqual([["in", "id", ["task-1"]]]);
    expect(logRows()).toEqual([{ task_id: "task-1", from_sprint_id: "s-1", to_sprint_id: "s-2", kind: "sprint_move", moved_by: "person-1", note: null }]);
    expect(timeline(audited)).toEqual(["sprints:select", "tasks:update", "task_stage_log:insert", "audit"]);
    expect(recordAuditMany).toHaveBeenCalledWith([{ table: "tasks", recordId: "task-1", operation: "update", actor: "tester", newData: { sprint_id: "s-2" } }]);
  });

  // BUG-5: all three callers returned on the history failure before the audit
  // row, so a sprint change that had persisted went unaudited.
  it("audits the move even when the history cannot be written, and still reports the failure", async () => {
    script("sprints", { data: [sprint("s-1"), sprint("s-2")] });
    script("tasks", { error: null });
    script("task_stage_log", { error: { message: "history unavailable" } });
    const r = await landInSprint(move());
    expect(r).toEqual({ ok: false, persisted: true, error: "Sprint changed, but the stage history could not be written: history unavailable" });
    expect(recordAuditMany).toHaveBeenCalledTimes(1);
    expect(timeline(audited)).toEqual(["sprints:select", "tasks:update", "task_stage_log:insert", "audit"]);
  });

  it("writes nothing more, and audits nothing, when the card update fails", async () => {
    script("sprints", { data: [sprint("s-1"), sprint("s-2")] });
    script("tasks", { error: { message: "write refused" } });
    expect(await landInSprint(move())).toEqual({ ok: false, error: "write refused" });
    expect(calls.some((c) => c.table === "task_stage_log")).toBe(false);
    expect(recordAuditMany).not.toHaveBeenCalled();
  });

  it("refuses a locked sprint still in its planning window when the lock applies, and writes nothing", async () => {
    script("sprints", { data: [sprint("s-1"), sprint("s-2", { locked_at: LOCKED, starts_on: NOT_STARTED })] });
    const r = await landInSprint(move());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Sprint s-2 is locked");
    expect(wrote()).toBe(false);
  });

  it("refuses taking a card OUT of a locked sprint when the lock applies", async () => {
    script("sprints", { data: [sprint("s-1", { locked_at: LOCKED, starts_on: NOT_STARTED })] });
    const r = await landInSprint(move({ to: null }));
    expect(r.ok).toBe(false);
    expect(wrote()).toBe(false);
  });

  it("lets an exempt landing through a locked sprint, and does not read the sprint it leaves", async () => {
    script("sprints", { data: [sprint("s-2", { locked_at: LOCKED, starts_on: NOT_STARTED })] });
    script("tasks", { error: null });
    script("task_stage_log", { error: null });
    expect(await landInSprint(move({ kind: "sprint_rollover", lock: "exempt" }))).toEqual({ ok: true });
    expect(calls.find((c) => c.table === "sprints")?.filters).toEqual([["in", "id", ["s-2"]]]);
  });

  it("rolls several cards over with one update and one history row per card", async () => {
    script("sprints", { data: [sprint("s-2")] });
    script("tasks", { error: null });
    script("task_stage_log", { error: null });
    const ids = ["task-1", "task-2", "task-3"];
    expect(await landInSprint(move({ taskIds: ids, kind: "sprint_rollover", lock: "exempt" }))).toEqual({ ok: true });
    expect(calls.filter((c) => c.table === "tasks")).toHaveLength(1);
    expect(calls.find((c) => c.table === "tasks")?.filters).toEqual([["in", "id", ids]]);
    expect(calls.filter((c) => c.table === "task_stage_log")).toHaveLength(1);
    expect(logRows().map((r) => [r.task_id, r.kind, r.from_sprint_id, r.to_sprint_id])).toEqual(ids.map((id) => [id, "sprint_rollover", "s-1", "s-2"]));
    expect(vi.mocked(recordAuditMany).mock.calls[0][0].map((a) => a.recordId)).toEqual(ids);
  });

  it("says the cards rolled over when a rollover's history cannot be written", async () => {
    script("sprints", { data: [sprint("s-2")] });
    script("tasks", { error: null });
    script("task_stage_log", { error: { message: "history unavailable" } });
    const r = await landInSprint(move({ taskIds: ["task-1", "task-2"], kind: "sprint_rollover", lock: "exempt" }));
    expect(r).toEqual({ ok: false, persisted: true, error: "Cards rolled over, but the stage history could not be written: history unavailable" });
    expect(recordAuditMany).toHaveBeenCalledTimes(1);
  });

  it("refuses a target sprint on another board, and writes nothing", async () => {
    script("sprints", { data: [sprint("s-1"), sprint("s-2", { board_id: "board-2" })] });
    expect(await landInSprint(move())).toEqual({ ok: false, error: "That sprint is not on this board." });
    expect(wrote()).toBe(false);
  });

  // W.202.3: the planning page read a past week back with its commit arrows
  // still live, and a card committed there was filed into a closed sprint.
  it("refuses a closed target sprint, and writes nothing", async () => {
    script("sprints", { data: [sprint("s-1"), sprint("s-2", { status: "closed" })] });
    expect(await landInSprint(move())).toEqual({ ok: false, error: "Sprint s-2 is closed. Pick an open sprint." });
    expect(wrote()).toBe(false);
  });

  it("refuses a target sprint that is gone", async () => {
    script("sprints", { data: [sprint("s-1")] });
    expect(await landInSprint(move())).toEqual({ ok: false, error: "That sprint is not on this board." });
    expect(wrote()).toBe(false);
  });

  it("refuses rather than guess when the sprints cannot be read", async () => {
    script("sprints", { error: { message: "read timeout" } });
    const r = await landInSprint(move());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("read timeout");
    expect(wrote()).toBe(false);
  });

  it("still checks the target when there is nothing to land, and writes nothing", async () => {
    script("sprints", { data: [sprint("s-2", { board_id: "board-2" })] });
    expect(await landInSprint(move({ taskIds: [], kind: "sprint_rollover", lock: "exempt" }))).toEqual({ ok: false, error: "That sprint is not on this board." });
    resetFake();
    script("sprints", { data: [sprint("s-2")] });
    expect(await landInSprint(move({ taskIds: [], kind: "sprint_rollover", lock: "exempt" }))).toEqual({ ok: true });
    expect(wrote()).toBe(false);
    expect(recordAuditMany).not.toHaveBeenCalled();
  });

  it("lands an exempt move into the backlog without reading any sprint", async () => {
    script("tasks", { error: null });
    script("task_stage_log", { error: null });
    expect(await landInSprint(move({ to: null, kind: "sprint_rollover", lock: "exempt" }))).toEqual({ ok: true });
    expect(calls.some((c) => c.table === "sprints")).toBe(false);
    expect(calls.find((c) => c.table === "tasks")?.payloads[0]).toEqual({ sprint_id: null });
  });
});
