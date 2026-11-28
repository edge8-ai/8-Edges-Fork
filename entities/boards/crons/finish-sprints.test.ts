import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// What the Wednesday-midnight routine promises (W.207.1): on every board with
// weekly sprints, each sprint that ended is closed and its open cards and
// subtasks are carried into the sprint that is starting, with a history row and
// an audit row under the system's name; done cards stay where they finished; a
// board with no sprint for the week, or without weekly sprints, is left alone
// and named; and a second run changes nothing. Scripted order, per table: the
// boards read, the sprints read, then for each ended sprint its open-card read,
// the target-sprint check, the cards' update, their history rows and the close.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("@/kernel/audit/routine-runs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/kernel/audit/routine-runs")>()),
  withRoutineRun: (_id: string, req: Request, handler: (req: Request) => Promise<Response>) => handler(req),
}));
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: vi.fn(async () => {}), recordAuditMany: vi.fn(async () => {}) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/kernel/config/dates", async (original) => ({
  ...(await original<typeof import("@/kernel/config/dates")>()),
  saigonToday: () => "2026-09-23", // a Wednesday: the sprint of 2026-W39 starts today
}));

const { GET } = await import("./finish-sprints");
const { recordAudit, recordAuditMany } = await import("@/kernel/audit/audit");

const board = (id: string, weekly: boolean) => ({
  id,
  name: `Board ${id}`,
  slug: `board-${id}`,
  description: null,
  client_company_id: null,
  ai_program_id: null,
  owner_id: null,
  status: "active",
  sort_order: 0,
  metadata: weekly ? { weekly_sprints: "product" } : {},
});
const sprint = (id: string, boardId: string, startsOn: string, week: string) => ({
  id,
  board_id: boardId,
  name: `Sprint ${id}`,
  goal: null,
  starts_on: startsOn,
  ends_on: startsOn,
  status: "active",
  week,
  locked_at: null,
});
const THIS_WEEK = "2026-W39";
const THIS_START = "2026-09-23";
const run = async () => {
  const res = await GET(new Request("https://example.test/api/cron/finish-sprints/"));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};
// One ended sprint's closing, in the order the close asks.
const scriptClose = (opts: { open: string[]; target: ReturnType<typeof sprint> }) => {
  script("tasks", { data: opts.open.map((id) => ({ id })) });
  script("sprints", { data: [opts.target] });
  if (opts.open.length) {
    script("tasks", { error: null });
    script("task_stage_log", { error: null });
  }
  script("sprints", { error: null });
};
const written = (table: string, op: string) => calls.filter((c) => c.table === table && c.ops.includes(op));

beforeEach(() => {
  resetFake();
  vi.clearAllMocks();
});

describe("finish sprints", () => {
  it("closes the ended sprint and carries its open cards and subtasks into the sprint that is starting", async () => {
    const starting = sprint("new", "b1", THIS_START, THIS_WEEK);
    script("boards", { data: [board("b1", true)] });
    script("sprints", { data: [sprint("old", "b1", "2026-09-16", "2026-W38"), starting] });
    scriptClose({ open: ["card-1", "subtask-1"], target: starting });
    const { status, body } = await run();
    expect(status).toBe(200);
    expect(body).toMatchObject({ week: THIS_WEEK, sprintsClosed: 1, carried: 2, skipped: [], failures: [] });
    expect(body.closed).toEqual([{ board: "Board b1", sprint: "Sprint old", carried: 2 }]);
    // Each carried card has its history row, the same kind a manual rollover writes.
    const log = written("task_stage_log", "insert")[0].payloads[0] as Record<string, unknown>[];
    expect(log.map((r) => [r.task_id, r.kind, r.from_sprint_id, r.to_sprint_id])).toEqual([
      ["card-1", "sprint_rollover", "old", "new"],
      ["subtask-1", "sprint_rollover", "old", "new"],
    ]);
    // The audit rows carry the system's name, for the cards and for the closed sprint.
    const cardAudits = vi.mocked(recordAuditMany).mock.calls[0][0] as { actor: string }[];
    expect(cardAudits.map((a) => a.actor)).toEqual(["finish-sprints", "finish-sprints"]);
    expect(vi.mocked(recordAudit).mock.calls[0][0]).toMatchObject({ table: "sprints", recordId: "old", actor: "finish-sprints", newData: { status: "closed", rolled: 2, to: "new" } });
    expect(written("sprints", "update")).toHaveLength(1);
  });

  it("closes an ended sprint that has nothing open, carrying nothing", async () => {
    // Every card in it was done: they stay where they finished, so nothing is moved or logged.
    const starting = sprint("new", "b1", THIS_START, THIS_WEEK);
    script("boards", { data: [board("b1", true)] });
    script("sprints", { data: [sprint("old", "b1", "2026-09-16", "2026-W38"), starting] });
    scriptClose({ open: [], target: starting });
    const { body } = await run();
    expect(body).toMatchObject({ sprintsClosed: 1, carried: 0 });
    expect(written("tasks", "update")).toHaveLength(0);
    expect(written("task_stage_log", "insert")).toHaveLength(0);
    expect(written("sprints", "update")).toHaveLength(1);
  });

  it("leaves a board alone that has no sprint for the week, and names it", async () => {
    script("boards", { data: [board("b1", true)] });
    script("sprints", { data: [sprint("old", "b1", "2026-09-16", "2026-W38")] });
    const { status, body } = await run();
    expect(status).toBe(200);
    expect(body).toMatchObject({ sprintsClosed: 0, carried: 0, skipped: [{ board: "Board b1", reason: "no sprint for 2026-W39" }] });
    expect(written("sprints", "update")).toHaveLength(0);
    expect(written("tasks", "update")).toHaveLength(0);
  });

  it("leaves a board without weekly sprints alone, and names it", async () => {
    const starting = sprint("new", "b1", THIS_START, THIS_WEEK);
    script("boards", { data: [board("b1", true), board("b2", false)] });
    script("sprints", { data: [sprint("old", "b1", "2026-09-16", "2026-W38"), starting, sprint("hand", "b2", "2026-09-09", "2026-W37")] });
    scriptClose({ open: ["card-1"], target: starting });
    const { body } = await run();
    expect(body).toMatchObject({ sprintsClosed: 1, carried: 1, skipped: [{ board: "Board b2", reason: "weekly sprints are not switched on" }] });
    // Board b2's sprint was never closed: only one sprint update ran.
    expect(written("sprints", "update")).toHaveLength(1);
  });

  it("changes nothing on a second run, when no sprint that started earlier is still active", async () => {
    script("boards", { data: [board("b1", true)] });
    script("sprints", { data: [sprint("new", "b1", THIS_START, THIS_WEEK)] });
    const { status, body } = await run();
    expect(status).toBe(200);
    expect(body).toMatchObject({ sprintsClosed: 0, carried: 0, skipped: [], failures: [] });
    expect(calls.some((c) => c.ops.some((o) => ["update", "insert"].includes(o)))).toBe(false);
  });

  it("names the board and sprint that would not close, and still closes the others", async () => {
    const starting = sprint("new", "b1", THIS_START, THIS_WEEK);
    script("boards", { data: [board("b1", true)] });
    script("sprints", { data: [sprint("old-1", "b1", "2026-09-09", "2026-W37"), sprint("old-2", "b1", "2026-09-16", "2026-W38"), starting] });
    script("tasks", { error: { message: "read failed" } });
    scriptClose({ open: ["card-1"], target: starting });
    const { status, body } = await run();
    expect(status).toBe(500);
    expect(body.failures).toEqual([{ subject: "Board b1 / Sprint old-1", step: "close sprint", error: "Could not load the sprint's open cards: read failed" }]);
    expect(body).toMatchObject({ sprintsClosed: 1, carried: 1 });
  });
});
