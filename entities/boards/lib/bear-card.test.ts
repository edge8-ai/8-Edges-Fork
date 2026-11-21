import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// The birth contract (A.53). bearCard reads the column once, derives what the
// card is from it, inserts the row and then owes the card what any arrival
// owes (landing-effects.ts): the create row, the audit row and the events, in
// that order, with a failure among them reported after the rest have run and
// marked `persisted`, because the card exists by then. The scripted `tasks`
// order is the order bearCard asks: endPosition's fallback read, the insert.

vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const sequence: string[] = [];
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: vi.fn(async () => void sequence.push("audit")) }));
const published: [string, Record<string, unknown>][] = [];
vi.mock("@/kernel/events", () => ({
  publish: async (name: string, payload: Record<string, unknown>) => {
    sequence.push(name);
    published.push([name, payload]);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { bearCard } = await import("./bear-card");
const { recordAudit } = await import("@/kernel/audit/audit");

const ACTOR = { label: "tester", personId: "person-1", isAdmin: false };
const column = (flags: { is_done: boolean; is_not_doing?: boolean }) => ({
  data: { id: "col-1", is_not_doing: false, ...flags, boards: { slug: "delivery" } },
});
const birth = (over: Record<string, unknown> = {}) => ({
  card: { board_id: "board-1", board_column_id: "col-1", title: "Write the spec", assignee_id: "person-2", subject_type: null, subject_id: null, ...over },
  actor: ACTOR,
});
const inserted = () => calls.find((c) => c.table === "tasks" && c.ops[0] === "insert")?.payloads[0] as Record<string, unknown>;
const logRow = () => calls.find((c) => c.table === "task_stage_log")?.payloads[0];

beforeEach(() => {
  resetFake();
  sequence.length = 0;
  published.length = 0;
});
afterEach(() => vi.clearAllMocks());

describe("bearCard", () => {
  it.each([
    {
      name: "an open column, with a sprint",
      flags: { is_done: false },
      sprint: "sprint-1",
      status: "open",
      completes: false,
    },
    {
      name: "an open column, with no sprint",
      flags: { is_done: false },
      sprint: undefined,
      status: "open",
      completes: false,
    },
    {
      name: "a Done column",
      flags: { is_done: true },
      sprint: "sprint-1",
      status: "done",
      completes: true,
    },
    {
      name: "a Not Doing column, which closes the card without finishing it",
      flags: { is_done: false, is_not_doing: true },
      sprint: undefined,
      status: "not_doing",
      completes: false,
    },
  ])("bears a card into $name", async ({ flags, sprint, status, completes }) => {
    script("board_columns", column(flags));
    script("tasks", { data: null }, { data: { id: "task-new" } });
    script("task_stage_log", { error: null });

    expect(await bearCard(birth(sprint ? { sprint_id: sprint } : {}))).toEqual({ ok: true, id: "task-new", completed: completes });

    // The column decides the status and the completion date, the database the
    // position, and the actor is who made it.
    const row = inserted();
    expect(row).toMatchObject({ board_id: "board-1", board_column_id: "col-1", status, position: 1, created_by: "person-1" });
    expect(row.completed_at === null).toBe(!completes);
    // The column is read on the card's own board, so another board's column is refused.
    expect(calls.find((c) => c.table === "board_columns")?.filters).toEqual([
      ["eq", "id", "col-1"],
      ["eq", "board_id", "board-1"],
    ]);

    // The create row starts the card's age, with the sprint it begins in.
    expect(logRow()).toEqual({
      task_id: "task-new",
      from_column_id: null,
      to_column_id: "col-1",
      to_sprint_id: sprint ?? null,
      kind: "create",
      moved_by: "person-1",
      note: null,
    });
    expect(vi.mocked(recordAudit).mock.calls[0][0]).toMatchObject({ table: "tasks", recordId: "task-new", operation: "insert", actor: "tester" });

    // A birth in Done is a completion, announced like one, before the landing
    // every birth states; anywhere else it is a landing only.
    expect(sequence).toEqual(completes ? ["audit", "board.card.completed", "board.card.landed"] : ["audit", "board.card.landed"]);
    const landed = published.find(([n]) => n === "board.card.landed")?.[1];
    expect(landed).toMatchObject({ taskId: "task-new", boardSlug: "delivery", status, title: "Write the spec", assigneeId: "person-2", actorPersonId: "person-1" });
  });

  it("dates a card born finished by when the caller says it finished", async () => {
    script("board_columns", column({ is_done: true }));
    script("tasks", { data: null }, { data: { id: "task-new" } });
    script("task_stage_log", { error: null });
    await bearCard({ ...birth(), completedAt: "2026-09-23T10:00:00Z" });
    expect(inserted().completed_at).toBe("2026-09-23T10:00:00Z");
  });

  it("carries the spark a card was picked up from on its events", async () => {
    script("board_columns", column({ is_done: true }));
    script("tasks", { data: null }, { data: { id: "task-new" } });
    script("task_stage_log", { error: null });
    await bearCard(birth({ metadata: { idea_id: "idea-1" } }));
    expect(published.find(([n]) => n === "board.card.completed")?.[1]).toMatchObject({ ideaId: "idea-1" });
  });

  it("reports a failed create row as persisted, with the id, after the audit row and the events", async () => {
    script("board_columns", column({ is_done: true }));
    script("tasks", { data: null }, { data: { id: "task-new" } });
    script("task_stage_log", { error: { message: "history unavailable" } });
    const r = await bearCard(birth());
    expect(r).toEqual({ ok: false, persisted: true, id: "task-new", error: "Card created, but its stage history could not be written: history unavailable" });
    // The card exists, so it was audited and announced whatever the log did.
    expect(sequence).toEqual(["audit", "board.card.completed", "board.card.landed"]);
  });

  it("refuses a column that is not on the card's board, and writes nothing", async () => {
    script("board_columns", { data: null });
    expect(await bearCard(birth())).toEqual({ ok: false, error: "That column is not on this board." });
    expect(calls.some((c) => c.table === "tasks")).toBe(false);
  });

  it("says why the column could not be read rather than calling it missing", async () => {
    script("board_columns", { error: { message: "read timeout" } });
    expect(await bearCard(birth())).toEqual({ ok: false, error: "read timeout" });
  });

  it("hands back the database's code on a refused insert, and owes the card nothing", async () => {
    script("board_columns", column({ is_done: false }));
    script("tasks", { data: null }, { error: { message: "duplicate key", code: "23505" } as { message: string } });
    expect(await bearCard(birth())).toEqual({ ok: false, error: "duplicate key", code: "23505" });
    expect(calls.some((c) => c.table === "task_stage_log")).toBe(false);
    expect(recordAudit).not.toHaveBeenCalled();
    expect(published).toEqual([]);
  });
});
