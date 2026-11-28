import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// setCardSprint is where the drawer, the list, quick-add and the planning
// panel all commit a card. The sprint lock that used to refuse here went with
// Finish planning (W.207.3).

vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("@/entities/boards/lib/access", () => ({
  boardActorFor: vi.fn(async () => ({ label: "tester", personId: "person-1", isAdmin: true })),
}));
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: vi.fn(async () => undefined), recordAuditMany: vi.fn(async () => undefined) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { closeSprint, createSprint, setCardSprint } = await import("./sprint-actions");
const { recordAuditMany } = await import("@/kernel/audit/audit");
const { addDays, isoWeekKey, saigonToday } = await import("@/kernel/config/dates");

beforeEach(() => resetFake());
afterEach(() => vi.clearAllMocks());

// Far from any real date, so the suite does not depend on the day it runs.
const NOT_STARTED = "2999-01-01";
const STARTED = "2000-01-01";
const sprint = (id: string, over: Record<string, unknown> = {}) => ({ id, board_id: "board-1", name: `Sprint ${id}`, starts_on: STARTED, ...over });
const wrote = () => calls.some((c) => c.ops.includes("update"));

describe("setCardSprint", () => {
  it("commits a card to a sprint that has not started yet, with no lock in the way (W.207.3)", async () => {
    script("tasks", { data: { board_id: "board-1", sprint_id: null } });
    script("sprints", { data: [sprint("next", { starts_on: NOT_STARTED })] });
    script("tasks", { data: null }); // the card's new sprint
    script("task_stage_log", { data: null }); // and its history row
    expect(await setCardSprint("task-1", "next", "board")).toEqual({ ok: true });
    expect(wrote()).toBe(true);
  });

  it("takes a card out of a sprint to the backlog", async () => {
    script("tasks", { data: { board_id: "board-1", sprint_id: "next" } });
    script("tasks", { data: null });
    script("task_stage_log", { data: null });
    expect(await setCardSprint("task-1", null, "board")).toEqual({ ok: true });
    expect(wrote()).toBe(true);
  });

  it("still refuses a sprint on another board", async () => {
    script("tasks", { data: { board_id: "board-1", sprint_id: null } });
    script("sprints", { data: [sprint("elsewhere", { board_id: "board-2" })] });
    expect(await setCardSprint("task-1", "elsewhere", "board")).toEqual({ ok: false, error: "That sprint is not on this board." });
    expect(wrote()).toBe(false);
  });
});

// A.41: the rollover is one sprint landing, and the
// rolled cards are audited even when their history cannot be written (BUG-5).
describe("closeSprint's rollover", () => {
  const sprintClosed = () => calls.some((c) => c.table === "sprints" && c.ops.includes("update"));

  it("rolls every open card into the next sprint, and closes the sprint", async () => {
    script("sprints", { data: { board_id: "board-1" } }); // the gate's read of the closing sprint
    script("tasks", { data: [{ id: "task-1" }, { id: "task-2" }] });
    script("sprints", { data: [sprint("next", { starts_on: NOT_STARTED })] });
    script("tasks", { error: null });
    script("task_stage_log", { error: null });
    script("sprints", { error: null });
    expect(await closeSprint("this", "next", "board")).toEqual({ ok: true });
    const rows = calls.find((c) => c.table === "task_stage_log")?.payloads[0] as Record<string, unknown>[];
    expect(rows.map((r) => [r.task_id, r.kind, r.from_sprint_id, r.to_sprint_id])).toEqual([
      ["task-1", "sprint_rollover", "this", "next"],
      ["task-2", "sprint_rollover", "this", "next"],
    ]);
    expect(sprintClosed()).toBe(true);
  });

  it("audits the rolled cards and leaves the sprint open when their history cannot be written", async () => {
    script("sprints", { data: { board_id: "board-1" } });
    script("tasks", { data: [{ id: "task-1" }] });
    script("sprints", { data: [sprint("next")] });
    script("tasks", { error: null });
    script("task_stage_log", { error: { message: "history unavailable" } });
    const r = await closeSprint("this", "next", "board");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("Cards rolled over, but the stage history could not be written: history unavailable");
    expect(recordAuditMany).toHaveBeenCalledTimes(1);
    expect(sprintClosed()).toBe(false);
  });

  it("refuses a next sprint on another board even when nothing would roll", async () => {
    script("sprints", { data: { board_id: "board-1" } });
    script("tasks", { data: [] });
    script("sprints", { data: [sprint("elsewhere", { board_id: "board-2" })] });
    expect(await closeSprint("this", "elsewhere", "board")).toEqual({ ok: false, error: "That sprint is not on this board." });
    expect(wrote()).toBe(false);
    expect(sprintClosed()).toBe(false);
  });
});

// W.146. On 2026-08-31 a sprint was created with starts_on 1972-09-01 and
// ends_on 1972-09-08: the date input handed the action a year that was off by
// 54, and createSprint stored whatever string it was given. The SW-01 backfill
// then keyed it 1972-W35, a correction by SQL moved the date to 2026 without
// the key, and Sprint Planning's week picker offered a week in 1972. A sprint
// is a week of work, so a start or end more than a year from today is a
// mistyped year, never a plan; and a sprint cannot end before it starts.
describe("createSprint refuses a date that cannot be a sprint's (W.146)", () => {
  const inserted = () => calls.some((c) => c.table === "sprints" && c.ops.includes("insert"));

  it("refuses the 1972 dates that reached production, and writes nothing", async () => {
    const r = await createSprint("board-1", { name: "Infinite Leverage 1", startsOn: "1972-09-01", endsOn: "1972-09-08" }, "board");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("1972");
    expect(inserted()).toBe(false);
  });

  it("refuses the year 0026 that a two-digit year gives in Chrome's date input", async () => {
    const r = await createSprint("board-1", { name: "S", startsOn: "0026-09-01", endsOn: "0026-09-08" }, "board");
    expect(r.ok).toBe(false);
    expect(inserted()).toBe(false);
  });

  it("refuses an end date more than a year away even when the start is fine", async () => {
    const start = saigonToday();
    const r = await createSprint("board-1", { name: "S", startsOn: start, endsOn: addDays(start, 400) }, "board");
    expect(r.ok).toBe(false);
    expect(inserted()).toBe(false);
  });

  it("refuses a sprint that ends before it starts", async () => {
    const start = saigonToday();
    const r = await createSprint("board-1", { name: "S", startsOn: start, endsOn: addDays(start, -1) }, "board");
    expect(r).toEqual({ ok: false, error: "A sprint cannot end before it starts." });
    expect(inserted()).toBe(false);
  });

  it("stores this year's dates, keyed to the week of the first day", async () => {
    const start = saigonToday();
    script("sprints", { data: { id: "new" } });
    expect(await createSprint("board-1", { name: "S", startsOn: start, endsOn: addDays(start, 6) }, "board")).toEqual({ ok: true, id: "new" });
    const row = calls.find((c) => c.table === "sprints" && c.ops.includes("insert"))?.payloads[0] as { starts_on: string; week: string };
    expect(row.starts_on).toBe(start);
    expect(row.week).toBe(isoWeekKey(start));
  });
});

// W.207.1. The routine closes a sprint without a person at the gate: the same
// rollover and close as closeSprint, written under the system's name.
describe("closeSprintAsSystem", () => {
  it("rolls the open cards into the starting sprint, closes the sprint, and audits both as the system", async () => {
    const { closeSprintAsSystem } = await import("./sprint-close");
    script("tasks", { data: [{ id: "task-1" }, { id: "task-2" }] });
    script("sprints", { data: [sprint("next", { starts_on: NOT_STARTED })] });
    script("tasks", { error: null });
    script("task_stage_log", { error: null });
    script("sprints", { error: null });
    const r = await closeSprintAsSystem({ sprintId: "this", boardId: "board-1", boardSlug: "board", rolloverToSprintId: "next", label: "finish-sprints" });
    expect(r).toEqual({ ok: true, carried: 2 });
    const rows = calls.find((c) => c.table === "task_stage_log")?.payloads[0] as Record<string, unknown>[];
    expect(rows.map((x) => [x.task_id, x.kind, x.moved_by])).toEqual([
      ["task-1", "sprint_rollover", null],
      ["task-2", "sprint_rollover", null],
    ]);
    expect((vi.mocked(recordAuditMany).mock.calls[0][0] as { actor: string }[]).map((a) => a.actor)).toEqual(["finish-sprints", "finish-sprints"]);
    expect(calls.some((c) => c.table === "sprints" && c.ops.includes("update"))).toBe(true);
  });
  it("leaves the sprint open and says why when its open cards cannot be read", async () => {
    const { closeSprintAsSystem } = await import("./sprint-close");
    script("tasks", { error: { message: "read failed" } });
    const r = await closeSprintAsSystem({ sprintId: "this", boardId: "board-1", boardSlug: "board", rolloverToSprintId: "next", label: "finish-sprints" });
    expect(r).toEqual({ ok: false, error: "Could not load the sprint's open cards: read failed" });
    expect(calls.some((c) => c.ops.includes("update"))).toBe(false);
  });
});
