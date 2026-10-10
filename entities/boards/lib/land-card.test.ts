import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, opsFor, resetFake, script } from "@/kernel/data/testing/fake-company-os";
import { SUBJECT_COMMITMENT } from "./types";

// The landing contract, tested once for both moves (A.1). landCard chains
// several writes with no transaction between them; what these tests pin is
// the order and the reporting: every write's `error` is read, a failure after
// the move persisted says so in the message and is reported last — after the
// stage log, the audit row and the completion event the move earned — and a
// done column closes the card's open children while any other touches none.
// The scripted `tasks` order is the order landCard asks: the top position,
// the card update, then (on done) the children close.

vi.mock("@/kernel/data/supabase", () => fakeSupabase());
// One sequence for the follow-ups, so their order can be asserted, not only
// that each happened.
const sequence: string[] = [];
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: vi.fn(async () => { sequence.push("audit"); }) }));
const published: [string, unknown][] = [];
// Every landing also states `board.card.landed`; it is kept apart so the
// completion assertions below keep meaning "completed", and pinned on its own.
const landedEvents: unknown[] = [];
vi.mock("@/kernel/events", () => ({
  publish: async (n: string, p: unknown) => {
    if (n === "board.card.landed") return void landedEvents.push(p);
    sequence.push("publish");
    published.push([n, p]);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// The successor's own write is repeat-write.ts's to test; here only the column
// landCard hands it matters.
vi.mock("./repeat-write", () => ({ createRepeatSuccessor: vi.fn(async () => null) }));

const { landCard, becomesDone } = await import("./land-card");
const { createRepeatSuccessor } = await import("./repeat-write");
const { recordAudit } = await import("@/kernel/audit/audit");

const ACTOR = { label: "tester", personId: "person-1", isAdmin: true };
const landing = (isDone: boolean) => ({
  taskId: "task-1",
  actor: ACTOR,
  from: { boardId: "board-1", columnId: "col-a" },
  to: { boardId: "board-1", boardSlug: "board", columnId: isDone ? "col-done" : "col-b", isDone },
  subject: { type: SUBJECT_COMMITMENT, id: "commit-1" },
  logNote: null,
  refreshSlugs: ["board"],
});

beforeEach(() => {
  resetFake();
  published.length = 0;
  sequence.length = 0;
  landedEvents.length = 0;
  // A landing in a done column first asks whether the column it leaves is a
  // done one (S.13). Every test below leaves an open column unless it says so;
  // a landing anywhere else never asks, and leaves this script unconsumed.
  script("board_columns", { data: { is_done: false } });
});
afterEach(() => vi.clearAllMocks());

describe("becomesDone", () => {
  it("is false when the target column is not done", () => {
    expect(becomesDone({ isDone: false }, { is_done: false })).toBe(false);
    expect(becomesDone({ isDone: false }, { is_done: true })).toBe(false);
  });

  it("is true when an open column hands the card to a done one", () => {
    expect(becomesDone({ isDone: true }, { is_done: false })).toBe(true);
  });

  it("is false when the card was already in a done column", () => {
    expect(becomesDone({ isDone: true }, { is_done: true })).toBe(false);
  });

  it("counts a card with no origin column as not done, so its completion is announced", () => {
    expect(becomesDone({ isDone: true }, null)).toBe(true);
  });
});

describe("landCard", () => {
  it("writes the landing and returns ok when every write succeeds", async () => {
    script("tasks", { data: null }, { error: null });
    script("task_stage_log", { error: null });
    expect(await landCard(landing(false))).toEqual({ ok: true });
    const cardUpdate = calls.find((c) => c.table === "tasks" && c.ops[0] === "update");
    expect(cardUpdate?.payloads[0]).toEqual(
      expect.objectContaining({ board_id: "board-1", board_column_id: "col-b", status: "open", completed_at: null, position: 1 }),
    );
    // The update is scoped to this card, by id.
    expect(cardUpdate?.filters).toEqual([["eq", "id", "task-1"]]);
    expect(published).toEqual([]);
  });

  it("carries the caller's extra columns in the same update and the extra audit fields", async () => {
    script("tasks", { data: null }, { error: null });
    script("task_stage_log", { error: null });
    await landCard({ ...landing(false), also: { sprint_id: null, epic_id: null }, auditExtra: { from_board_id: "board-0" } });
    const cardUpdate = calls.find((c) => c.table === "tasks" && c.ops[0] === "update");
    expect(cardUpdate?.payloads[0]).toEqual(expect.objectContaining({ sprint_id: null, epic_id: null }));
    expect(vi.mocked(recordAudit).mock.calls[0][0].newData).toEqual(expect.objectContaining({ from_board_id: "board-0", sprint_id: null }));
  });

  it("AC1: says the card moved when the stage-log insert fails", async () => {
    script("tasks", { data: null }, { error: null });
    script("task_stage_log", { error: { message: "stage_log insert exploded" } });
    const r = await landCard(landing(false));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("stage_log insert exploded");
    expect(r.error).toMatch(/Card moved/);
    // The move persisted, so it was audited whether or not the log landed.
    expect(recordAudit).toHaveBeenCalledTimes(1);
  });

  it("completes the card, closes its open children and publishes when the column is done", async () => {
    // Three tasks queries on a done landing: the top position, the card
    // update and the children close (W.4).
    // The third `tasks` response is the read that asks whether the card
    // repeats (W.59); a null row means it does not.
    // The card update returns the row's title and assignee, which the events
    // state for the inbox (S.3).
    script("tasks", { data: null }, { data: { title: "Keep the promise", assignee_id: "person-2" } }, { data: null }, { error: null });
    script("task_stage_log", { error: null });
    expect(await landCard(landing(true))).toEqual({ ok: true });
    const cardUpdate = calls.find((c) => c.table === "tasks" && c.ops[0] === "update" && !c.filters.some((f) => f[1] === "parent_task_id"));
    expect(cardUpdate?.payloads[0]).toEqual(expect.objectContaining({ status: "done", completed_at: expect.any(String) }));
    const children = calls.find((c) => c.table === "tasks" && c.filters.some((f) => f[1] === "parent_task_id"));
    expect(children?.payloads[0]).toEqual({ status: "done", completed_at: expect.any(String) });
    expect(children?.filters).toEqual([["eq", "parent_task_id", "task-1"], ["eq", "status", "open"], ["is", "archived_at", null]]);
    // The trail follows the writes in this order: the card's move persisted,
    // then its history, then the audit row, then the fact for subscribers.
    const logIndex = calls.findIndex((c) => c.table === "task_stage_log");
    expect(logIndex).toBeGreaterThan(calls.indexOf(children!));
    expect(sequence).toEqual(["audit", "publish"]);
    expect(published).toEqual([
      [
        "board.card.completed",
        {
          taskId: "task-1",
          boardSlug: "board",
          subjectType: SUBJECT_COMMITMENT,
          subjectId: "commit-1",
          title: "Keep the promise",
          assigneeId: "person-2",
          actorPersonId: "person-1",
        },
      ],
    ]);
    // The board half states the fact and writes nothing outside its own
    // tables: whoever cares that a commitment-linked card is done subscribes.
    expect(calls.some((c) => c.table === "coaching_commitments")).toBe(false);
  });

  it("touches no children and publishes nothing when the column is not done", async () => {
    script("tasks", { data: null }, { error: null });
    script("task_stage_log", { error: null });
    expect(await landCard(landing(false))).toEqual({ ok: true });
    expect(calls.some((c) => c.table === "tasks" && c.filters.some((f) => f[1] === "parent_task_id"))).toBe(false);
    expect(published).toEqual([]);
  });

  it("closes the card as Not Doing: no completion date, its open children closed the same way, nothing published", async () => {
    script("tasks", { data: null }, { error: null }, { error: null });
    script("task_stage_log", { error: null });
    const l = landing(false);
    expect(await landCard({ ...l, to: { ...l.to, columnId: "col-not-doing", isNotDoing: true } })).toEqual({ ok: true });
    const cardUpdate = calls.find((c) => c.table === "tasks" && c.ops[0] === "update" && !c.filters.some((f) => f[1] === "parent_task_id"));
    expect(cardUpdate?.payloads[0]).toEqual(expect.objectContaining({ status: "not_doing", completed_at: null }));
    const children = calls.find((c) => c.table === "tasks" && c.filters.some((f) => f[1] === "parent_task_id"));
    expect(children?.payloads[0]).toEqual({ status: "not_doing", completed_at: null });
    expect(children?.filters).toContainEqual(["eq", "status", "open"]);
    // Not doing is not finishing: no completion event, so no commitment is
    // marked kept and no repeating card is owed its next instance.
    expect(published).toEqual([]);
    // It still says where the card landed, and what it now is.
    expect(landedEvents).toEqual([
      { taskId: "task-1", boardSlug: "board", status: "not_doing", subjectType: SUBJECT_COMMITMENT, subjectId: "commit-1", actorPersonId: "person-1" },
    ]);
    expect(createRepeatSuccessor).not.toHaveBeenCalled();
  });

  it("still logs, audits and publishes when the children could not be closed, and says so last", async () => {
    script("tasks", { data: null }, { error: null }, { data: null }, { error: { message: "children locked" } });
    script("task_stage_log", { error: null });
    const r = await landCard(landing(true));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("Card moved");
    expect(r.error).toContain("children locked");
    // The move persisted, so its history and its event are not lost to the
    // children's failure (verifier finding on the first cut of W.4).
    expect(calls.some((c) => c.table === "task_stage_log")).toBe(true);
    expect(recordAudit).toHaveBeenCalledTimes(1);
    expect(published.map(([n]) => n)).toContain("board.card.completed");
  });

  it("reports the log failure before the children failure when both happen", async () => {
    script("tasks", { data: null }, { error: null }, { data: null }, { error: { message: "children locked" } });
    script("task_stage_log", { error: { message: "log down" } });
    const r = await landCard(landing(true));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("log down");
  });

  it("returns the database message and writes nothing more when the card update fails", async () => {
    script("tasks", { data: null }, { error: { message: "tasks locked" } });
    const r = await landCard(landing(true));
    expect(r).toEqual({ ok: false, error: "tasks locked" });
    expect(calls.some((c) => c.table === "task_stage_log")).toBe(false);
    expect(recordAudit).not.toHaveBeenCalled();
    expect(published).toEqual([]);
  });

  it("S.13: a card already in a done column lands again without completing again", async () => {
    resetFake();
    script("board_columns", { data: { is_done: true } });
    // Position, the card update, the children close — and no repeat read,
    // because no next instance is owed for a completion that already happened.
    script("tasks", { data: null }, { error: null }, { error: null });
    script("task_stage_log", { error: null });
    expect(await landCard(landing(true))).toEqual({ ok: true });
    const cardUpdate = calls.find((c) => c.table === "tasks" && c.ops[0] === "update" && !c.filters.some((f) => f[1] === "parent_task_id"));
    expect(cardUpdate?.payloads[0]).toEqual(expect.objectContaining({ status: "done" }));
    // The original completion date stands: rewriting it would restart the
    // card's cycle time at the moment it was merely moved.
    expect(cardUpdate?.payloads[0]).not.toHaveProperty("completed_at");
    // The repeat read is the card by id alone; the top-position read orders.
    expect(opsFor("tasks")).not.toContainEqual(["select", "eq", "maybeSingle"]);
    expect(published).toEqual([]);
    // It is still a move, so it is still logged and audited.
    expect(calls.some((c) => c.table === "task_stage_log")).toBe(true);
    expect(recordAudit).toHaveBeenCalledTimes(1);
  });

  it("S.13: refuses the move and writes nothing when the origin column cannot be read", async () => {
    resetFake();
    script("board_columns", { error: { message: "columns unavailable" } });
    const r = await landCard(landing(true));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("columns unavailable");
    expect(calls.some((c) => c.table === "tasks")).toBe(false);
    expect(published).toEqual([]);
  });

  it("S.13: a landing in an open column never reads the column it leaves", async () => {
    resetFake();
    // Unscripted: the fake throws if landCard asks. The gate only needs the
    // origin on the way into Done, so a plain drag cannot fail on it.
    script("tasks", { data: null }, { error: null });
    script("task_stage_log", { error: null });
    expect(await landCard(landing(false))).toEqual({ ok: true });
    expect(calls.some((c) => c.table === "board_columns")).toBe(false);
  });

  it("S.13: takes the origin's done state from the caller when it has one, and does not read it again", async () => {
    resetFake();
    script("tasks", { data: null }, { error: null }, { error: null });
    script("task_stage_log", { error: null });
    const already = { ...landing(true), from: { boardId: "board-1", columnId: "col-a", isDone: true } };
    expect(await landCard(already)).toEqual({ ok: true });
    expect(calls.some((c) => c.table === "board_columns")).toBe(false);
    expect(published).toEqual([]);
  });

  it("starts a repeating card's next instance in the column it came from, without reading that column twice", async () => {
    // Position, the card update, the does-it-repeat read (it does) and the
    // children close. The origin was read once, up front, and it was open.
    script("tasks", { data: null }, { error: null }, { data: { id: "task-1", metadata: { repeat: { every: "week" } } } }, { error: null });
    script("task_stage_log", { error: null });
    expect(await landCard(landing(true))).toEqual({ ok: true });
    expect(vi.mocked(createRepeatSuccessor)).toHaveBeenCalledWith(expect.objectContaining({ id: "task-1" }), "col-a", "person-1");
    expect(calls.filter((c) => c.table === "board_columns")).toHaveLength(1);
  });

  // W.139: Not Doing is not a done column, so a card set aside and then
  // finished sent its next instance back into Not Doing, marked open.
  it("starts a repeating card's next instance in the first open column when it came from Not Doing", async () => {
    resetFake();
    script("board_columns", { data: { is_done: false, is_not_doing: true } }, { data: { id: "col-first" } });
    script("tasks", { data: null }, { error: null }, { data: { id: "task-1", metadata: { repeat: { every: "week" } } } }, { error: null });
    script("task_stage_log", { error: null });
    const l = landing(true);
    expect(await landCard({ ...l, from: { ...l.from, columnId: "col-not-doing", status: "not_doing" } })).toEqual({ ok: true });
    expect(vi.mocked(createRepeatSuccessor)).toHaveBeenCalledWith(expect.objectContaining({ id: "task-1" }), "col-first", "person-1");
  });

  // W.139: entering Not Doing closes the open children; leaving it has to
  // reopen them, or Done (which closes only open children) never reaches them.
  it("reopens the children Not Doing closed when the card comes back to an open column, without reading any column", async () => {
    script("tasks", { data: null }, { error: null }, { error: null });
    script("task_stage_log", { error: null });
    const l = landing(false);
    expect(await landCard({ ...l, from: { ...l.from, columnId: "col-not-doing", status: "not_doing" } })).toEqual({ ok: true });
    const children = calls.find((c) => c.table === "tasks" && c.filters.some((f) => f[1] === "parent_task_id"));
    expect(children?.payloads[0]).toEqual({ status: "open", completed_at: null });
    expect(children?.filters).toContainEqual(["eq", "status", "not_doing"]);
    expect(calls.filter((c) => c.table === "board_columns")).toHaveLength(0);
  });

  it("touches no children on a plain drag between open columns", async () => {
    script("tasks", { data: null }, { error: null });
    script("task_stage_log", { error: null });
    const l = landing(false);
    expect(await landCard({ ...l, from: { ...l.from, status: "open" } })).toEqual({ ok: true });
    expect(calls.some((c) => c.table === "tasks" && c.filters.some((f) => f[1] === "parent_task_id"))).toBe(false);
  });
});
