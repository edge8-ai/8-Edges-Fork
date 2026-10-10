import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";
import { DENIED } from "./card-helpers";
import { SUBJECT_BACKLOG_ITEM } from "./types";

// moveCardToBoard resolves the target board and its same-named column, decides
// what the old board keeps, and hands the landing to landCard (A.1; the landing
// contract — done state, children, log, audit, event, error order — is
// land-card.test.ts's). What this suite pins is the resolution. The scripted
// order is the order the action asks: the card, the two boards, the two
// boards' columns, then landCard's top position, card update and (on done)
// children close, then the stage log. The two boards' columns include the one
// the card leaves, so landCard is handed its done state and never reads it.

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

const { moveCardToBoard } = await import("./move-to-board");
const { boardActorFor } = await import("./access");
const { recordAudit } = await import("@/kernel/audit/audit");

beforeEach(() => {
  resetFake();
  published.length = 0;
});
afterEach(() => vi.clearAllMocks());

const CARD = { id: "task-1", board_id: "board-1", board_column_id: "col-a", sprint_id: "sprint-1", epic_id: "epic-1", subject_type: null, subject_id: null };
const BOARDS = (toClient: string | null = null) => [
  { id: "board-1", slug: "from", client_company_id: null },
  { id: "board-2", slug: "to", client_company_id: toClient },
];
const COLUMNS = (isDone: boolean, targetName = "Doing") => [
  { id: "col-a", board_id: "board-1", name: "Doing", position: 0, is_done: false },
  { id: "col-x", board_id: "board-2", name: targetName, position: 0, is_done: isDone },
];
const cardUpdate = () => calls.find((c) => c.table === "tasks" && c.ops[0] === "update" && !c.ops.includes("neq"));

describe("moveCardToBoard", () => {
  it("lands the card in the target's same-named column, done state included, under the new board's slug (W.8)", async () => {
    // …the card update, the does-it-repeat read (W.59) and the children close.
    script("tasks", { data: CARD }, { data: null }, { error: null }, { data: null }, { error: null });
    script("boards", { data: BOARDS() });
    script("board_columns", { data: COLUMNS(true) });
    script("task_stage_log", { error: null });
    expect(await moveCardToBoard("task-1", "board-2")).toEqual({ ok: true });
    expect(cardUpdate()?.payloads[0]).toEqual(
      expect.objectContaining({ board_id: "board-2", board_column_id: "col-x", status: "done", completed_at: expect.any(String) }),
    );
    expect(published).toEqual([["board.card.completed", { taskId: "task-1", boardSlug: "to", subjectType: null, subjectId: null, actorPersonId: "person-1" }]]);
    // The stage log names both boards and the audit row keeps the old one.
    expect(calls.find((c) => c.table === "task_stage_log")?.payloads[0]).toEqual(expect.objectContaining({ note: "Moved from board from to to" }));
    expect(vi.mocked(recordAudit).mock.calls[0][0].newData).toEqual(expect.objectContaining({ from_board_id: "board-1" }));
  });

  it("clears the sprint and epic, which belong to the old board", async () => {
    script("tasks", { data: CARD }, { data: null }, { error: null });
    script("boards", { data: BOARDS() });
    script("board_columns", { data: COLUMNS(false) });
    script("task_stage_log", { error: null });
    expect(await moveCardToBoard("task-1", "board-2")).toEqual({ ok: true });
    expect(cardUpdate()?.payloads[0]).toEqual(expect.objectContaining({ status: "open", completed_at: null, sprint_id: null, epic_id: null }));
    expect(published).toEqual([]);
  });

  it("falls back to the target's first column when no column shares the name", async () => {
    script("tasks", { data: CARD }, { data: null }, { error: null });
    script("boards", { data: BOARDS() });
    script("board_columns", { data: COLUMNS(false, "Backlog") });
    script("task_stage_log", { error: null });
    expect(await moveCardToBoard("task-1", "board-2")).toEqual({ ok: true });
    expect(cardUpdate()?.payloads[0]).toEqual(expect.objectContaining({ board_column_id: "col-x" }));
  });

  it("clears a roadmap link when the boards serve different clients, and keeps it otherwise", async () => {
    const linked = { ...CARD, subject_type: SUBJECT_BACKLOG_ITEM, subject_id: "item-1" };
    script("tasks", { data: linked }, { data: null }, { error: null });
    script("boards", { data: BOARDS("client-2") });
    script("board_columns", { data: COLUMNS(false) });
    script("task_stage_log", { error: null });
    expect(await moveCardToBoard("task-1", "board-2")).toEqual({ ok: true });
    expect(cardUpdate()?.payloads[0]).toEqual(expect.objectContaining({ subject_type: null, subject_id: null }));

    resetFake();
    script("tasks", { data: linked }, { data: null }, { error: null });
    script("boards", { data: BOARDS(null) });
    script("board_columns", { data: COLUMNS(false) });
    script("task_stage_log", { error: null });
    expect(await moveCardToBoard("task-1", "board-2")).toEqual({ ok: true });
    expect(cardUpdate()?.payloads[0]).not.toHaveProperty("subject_type");
  });

  it("is a no-op for the card's own board", async () => {
    script("tasks", { data: CARD });
    expect(await moveCardToBoard("task-1", "board-1")).toEqual({ ok: true });
    expect(calls.every((c) => !c.ops.includes("update"))).toBe(true);
  });

  it("denies a target board the actor may not touch", async () => {
    script("tasks", { data: CARD });
    vi.mocked(boardActorFor).mockResolvedValueOnce({ label: "tester", personId: "person-1", isAdmin: false }).mockResolvedValueOnce(null);
    expect(await moveCardToBoard("task-1", "board-2")).toEqual({ ok: false, error: DENIED });
    expect(calls.every((c) => !c.ops.includes("update"))).toBe(true);
  });

  it("S.13: a finished card moved to another board lands in its Done without completing again", async () => {
    // The live path: every board is born with a Done column, and the card
    // lands in the same-named one, so Done on one board becomes Done on another.
    const finished = { ...CARD, board_column_id: "col-done-1" };
    const columns = [
      { id: "col-done-1", board_id: "board-1", name: "Done", position: 0, is_done: true },
      { id: "col-done-2", board_id: "board-2", name: "Done", position: 0, is_done: true },
    ];
    // The card, then landCard's top position, card update and children close.
    script("tasks", { data: finished }, { data: null }, { error: null }, { error: null });
    script("boards", { data: BOARDS() });
    script("board_columns", { data: columns });
    script("task_stage_log", { error: null });
    expect(await moveCardToBoard("task-1", "board-2")).toEqual({ ok: true });
    expect(cardUpdate()?.payloads[0]).toEqual(expect.objectContaining({ board_column_id: "col-done-2", status: "done" }));
    expect(cardUpdate()?.payloads[0]).not.toHaveProperty("completed_at");
    expect(published).toEqual([]);
  });

  it("refuses when the target board is gone or has no columns", async () => {
    script("tasks", { data: CARD });
    script("boards", { data: BOARDS().slice(0, 1) });
    script("board_columns", { data: COLUMNS(false) });
    expect(await moveCardToBoard("task-1", "board-2")).toEqual({ ok: false, error: "That board is not available." });

    resetFake();
    script("tasks", { data: CARD });
    script("boards", { data: BOARDS() });
    script("board_columns", { data: COLUMNS(false).slice(0, 1) });
    expect(await moveCardToBoard("task-1", "board-2")).toEqual({ ok: false, error: "The target board has no columns." });
  });
});
