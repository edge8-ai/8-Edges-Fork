import { companyOs } from "@/kernel/data/supabase";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, opsFor, resetFake, script } from "@/kernel/data/testing/fake-company-os";
import { DENIED } from "./card-helpers";

// These actions chain several Supabase writes with no transaction between
// them (moveCardColumn, which shares the fake client, is tested beside its code in
// ./move-card.test.ts). What the tests pin down is the contract that E8-09 introduced: every
// write's `error` is read, a failure after an earlier success says so in the
// message, and a failed lookup is never reported as "not found".
//
// The fake client is the house one (kernel/data/testing/fake-company-os.ts):
// each `companyOs.from(table)` call resolves to the next scripted
// `{ data, error }` for that table, in call order, and keeps what it wrote and
// what it filtered on. This suite had its own copy until W.132, which could
// not see a filter's arguments, so a guard on the wrong column passed.

vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("@/entities/boards/lib/access", () => ({
  boardActorFor: vi.fn(async () => ({ label: "tester", personId: "person-1", isAdmin: true })),
}));
vi.mock("@/entities/boards/lib/notify", () => ({ notifyBoardAssignee: vi.fn(async () => undefined) }));
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: vi.fn(async () => undefined) }));
vi.mock("@/kernel/identity/admin-auth", () => ({ requireAdmin: vi.fn(async () => ({ email: "admin@example.com" })) }));
// The company-os door move-card reaches for (Q2) leads, through the barrel, to
// a module built on unstable_cache at load and to the kernel auth guards, whose
// session readers are wrapped in React's `cache` (which the React vitest
// resolves lacks); identity keeps both inert.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), unstable_cache: <T,>(fn: T) => fn }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  cache: <T,>(fn: T) => fn,
}));

beforeEach(() => resetFake());
afterEach(() => vi.clearAllMocks());

describe("closeSprint", () => {
  it("AC3: leaves the sprint open when the rollover stage-log insert fails", async () => {
    script("sprints", { data: { board_id: "board-1" } });
    script("tasks", { data: [{ id: "t1" }, { id: "t2" }] }, { error: null }); // open cards, rollover update
    script("task_stage_log", { error: { message: "history unavailable" } });
    const { closeSprint } = await import("./sprint-actions");
    const r = await closeSprint("sprint-1", null, "board");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("history unavailable");
    expect(r.error).toMatch(/rolled over/);
    // Exactly one query touched `sprints` (the lookup); no `.update()` closed it.
    expect(opsFor("sprints")).toEqual([["select", "eq", "maybeSingle"]]);
  });

  it("does not close the sprint when the open-cards read fails", async () => {
    script("sprints", { data: { board_id: "board-1" } });
    script("tasks", { error: { message: "read timeout" } });
    const { closeSprint } = await import("./sprint-actions");
    const r = await closeSprint("sprint-1", null, "board");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("read timeout");
    expect(opsFor("sprints")).toHaveLength(1);
  });

  it("closes the sprint once the rollover and its history both persist", async () => {
    script("sprints", { data: { board_id: "board-1" } }, { error: null });
    script("tasks", { data: [{ id: "t1" }] }, { error: null });
    script("task_stage_log", { error: null });
    const { closeSprint } = await import("./sprint-actions");
    expect(await closeSprint("sprint-1", null, "board")).toEqual({ ok: true });
    expect(opsFor("sprints")).toHaveLength(2);
  });
});

// E8-10: the guard reads that decide whether a card may be created or re-linked
// used to drop `error`, so a failed lookup surfaced as the "not on this board"
// message — a database outage read to the user as a scoping mistake.
describe("guard reads report the database failure", () => {
  it("createCard says why the column lookup failed instead of 'not on this board'", async () => {
    script("board_columns", { error: { message: "read timeout" } });
    const { createCard } = await import("./actions");
    const r = await createCard({ boardId: "board-1", columnId: "col-a", title: "Write the spec" });
    expect(r).toEqual({ ok: false, error: "read timeout" });
    // The failure stops before any card is written.
    expect(opsFor("tasks")).toEqual([]);
  });

  it("setCardEpic says why the epic lookup failed and leaves the card alone", async () => {
    script("tasks", { data: { board_id: "board-1", epic_id: null } });
    script("epics", { error: { message: "epics unavailable" } });
    const { setCardEpic } = await import("./epic-actions");
    const r = await setCardEpic("task-1", "epic-1", "board");
    expect(r).toEqual({ ok: false, error: "epics unavailable" });
    // Only the guard's own read of `tasks` ran; nothing updated the card.
    expect(opsFor("tasks")).toHaveLength(1);
  });
});

// AR-02: createCard is the first action whose input goes through a zod schema.
// The schema runs after the board guard, so a rejected input never reaches the
// database, and the error string names the field so the user can fix it.
describe("createCard (schema boundary)", () => {
  const good = { boardId: "board-1", columnId: "col-a", title: "Write the spec" };

  it("rejects a blank title with a readable, field-prefixed message and touches no table", async () => {
    const { createCard } = await import("./actions");
    const r = await createCard({ ...good, title: "   " });
    expect(r).toEqual({ ok: false, error: "title: Give the card a title." });
    expect(calls).toHaveLength(0);
  });

  it("rejects a wrongly typed field the way an untyped client could send it", async () => {
    const { createCard } = await import("./actions");
    // The cast is the point: server actions are called over the wire, so the
    // TypeScript signature is not a guarantee about what arrives.
    const r = await createCard({ ...good, humanTokens: "eight" } as unknown as Parameters<typeof createCard>[0]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/^humanTokens: /);
    expect(calls).toHaveLength(0);
  });

  it("lets well-formed input through to the handler and inserts the card", async () => {
    script("board_columns", { data: { id: "col-a", is_done: false } });
    script("tasks", { data: null }, { data: { id: "task-new" } }); // endPosition, insert
    script("task_stage_log", { error: null }); // the create row (W.184)
    const { createCard } = await import("./actions");
    expect(await createCard(good)).toEqual({ ok: true, id: "task-new" });
    expect(opsFor("tasks").at(-1)).toContain("insert");
  });

  // W.184 (2026-10-08): 134 of 139 cards made here in a fortnight had no
  // create row, so the Flow view gave them no age.
  it("writes the card's create row, in the column it was made in", async () => {
    script("board_columns", { data: { id: "col-a", is_done: false } });
    script("tasks", { data: null }, { data: { id: "task-new" } });
    script("task_stage_log", { error: null }); // the create row (W.184)
    const { createCard } = await import("./actions");
    expect(await createCard(good)).toEqual({ ok: true, id: "task-new" });
    const log = calls.filter((c) => c.table === "task_stage_log" && c.ops[0] === "insert");
    expect(log).toHaveLength(1);
    expect(log[0].payloads[0]).toEqual({ task_id: "task-new", from_column_id: null, to_column_id: "col-a", kind: "create", moved_by: "person-1" });
  });

  it("hands back the id when the card was written but its create row was not", async () => {
    script("board_columns", { data: { id: "col-a", is_done: false } });
    script("tasks", { data: null }, { data: { id: "task-new" } });
    script("task_stage_log", { error: { message: "history unavailable" } });
    const { createCard } = await import("./actions");
    const r = await createCard(good);
    expect(r).toEqual({ ok: false, error: "Card created, but its stage history could not be written: history unavailable", id: "task-new" });
  });

  // Bug hunt F10 (2026-10-05): the PR row shows on a new card, and what was
  // pasted there was dropped on Create.
  it("stores a PR pasted on a new card, the way Save stores one on a saved card", async () => {
    script("board_columns", { data: { id: "col-a", is_done: false } });
    script("tasks", { data: null }, { data: { id: "task-new" } });
    script("task_stage_log", { error: null }); // the create row (W.184)
    const { createCard } = await import("./actions");
    expect(await createCard({ ...good, prUrl: "github.com/edge8-ai/edge8-web/pull/1800" })).toEqual({ ok: true, id: "task-new" });
    const insert = calls.filter((c) => c.table === "tasks" && c.ops[0] === "insert").at(-1)!;
    expect((insert.payloads[0] as { metadata: Record<string, unknown> }).metadata).toEqual({ pr_url: "https://github.com/edge8-ai/edge8-web/pull/1800" });
  });
});

// W.163 F8: setting a card's PR link asks HTT for that PR's title and state on
// the bus, because HTT's sync never re-states a PR that has stopped changing.
// The real bus, with a listener standing in for HTT.
describe("a PR link set asks for its stamp (F8)", () => {
  const good = { boardId: "board-1", columnId: "col-a", title: "Write the spec" };
  const asked: unknown[] = [];
  beforeEach(async () => {
    asked.length = 0;
    const { subscribe, resetSubscribers } = await import("@/kernel/events");
    resetSubscribers();
    subscribe("test", "board.card.pr_linked", (p) => void asked.push(p));
  });
  afterEach(async () => (await import("@/kernel/events")).resetSubscribers());

  it("createCard asks for the PR pasted on the new card", async () => {
    script("board_columns", { data: { id: "col-a", is_done: false } });
    script("tasks", { data: null }, { data: { id: "task-new" } });
    script("task_stage_log", { error: null }); // the create row (W.184)
    const { createCard } = await import("./actions");
    await createCard({ ...good, prUrl: "github.com/edge8-ai/edge8-web/pull/1800" });
    expect(asked).toEqual([{ taskId: "task-new", prUrl: "https://github.com/edge8-ai/edge8-web/pull/1800" }]);
  });

  it("createCard asks nothing for a card with no PR", async () => {
    script("board_columns", { data: { id: "col-a", is_done: false } });
    script("tasks", { data: null }, { data: { id: "task-new" } });
    script("task_stage_log", { error: null }); // the create row (W.184)
    const { createCard } = await import("./actions");
    await createCard(good);
    expect(asked).toEqual([]);
  });

  it("updateCard asks when the link changes, once the write has held", async () => {
    script("tasks", { data: { board_id: "board-1", assignee_id: null, title: "Card", metadata: { pr_url: "https://github.com/edge8-ai/edge8-web/pull/1" } } }, { error: null });
    const { updateCard } = await import("./actions");
    expect(await updateCard("task-1", { prUrl: "https://github.com/edge8-ai/edge8-web/pull/1800" }, "board")).toEqual({ ok: true });
    expect(asked).toEqual([{ taskId: "task-1", prUrl: "https://github.com/edge8-ai/edge8-web/pull/1800" }]);
  });

  it("updateCard asks nothing when its write failed", async () => {
    script("tasks", { data: { board_id: "board-1", assignee_id: null, title: "Card", metadata: {} } }, { error: { message: "connection reset" } });
    const { updateCard } = await import("./actions");
    await updateCard("task-1", { prUrl: "https://github.com/edge8-ai/edge8-web/pull/1800" }, "board");
    expect(asked).toEqual([]);
  });
});

// AR-26: every board mutation now enters through `boardMutation`, so the denial
// path is one decision instead of twenty. This suite is the proof: it drives
// every exported mutation with the gate closed and asserts two things at once —
// the caller is told the same thing each time (DENIED, never a per-table "not
// found" that would confirm the row exists), and nothing was written.
describe("boardMutation (the one denial path)", () => {
  // Each case names the table the action reads to learn its board, so the
  // fixture can hand that lookup a row and let the *actor* be the reason the
  // action stops. A null table means the action is handed a board id directly.
  // Blockers and reordering live in their own action files (BL-01/RE-01) but
  // enter through the same boardMutation gate, so the one denial path covers them
  // too; the runner is handed all three modules merged.
  type Actions = typeof import("./actions") & typeof import("./blocker-actions") & typeof import("./reorder-actions") & typeof import("./epic-actions") & typeof import("./token-actions") & typeof import("./sprint-actions") & typeof import("./snooze-actions");
  const mutations: [name: string, lookup: string | null, run: (m: Actions) => Promise<unknown>][] = [
    ["createCard", null, (m) => m.createCard({ boardId: "board-1", columnId: "col-a", title: "Write the spec" })],
    ["setCardRoadmapItem", "tasks", (m) => m.setCardRoadmapItem("task-1", null, "board")],
    ["updateCard", "tasks", (m) => m.updateCard("task-1", { title: "New" }, "board")],
    ["archiveCard", "tasks", (m) => m.archiveCard("task-1", "board")],
    ["setCardInternal", "tasks", (m) => m.setCardInternal("task-1", true, "board")],
    ["createSprint", null, (m) => m.createSprint("board-1", { name: "Sprint 1" }, "board")],
    ["setCardSprint", "tasks", (m) => m.setCardSprint("task-1", null, "board")],
    ["closeSprint", "sprints", (m) => m.closeSprint("sprint-1", null, "board")],
    ["createEpic", null, (m) => m.createEpic("board-1", { name: "Epic" }, "board")],
    ["updateEpic", "epics", (m) => m.updateEpic("epic-1", { name: "Epic" }, "board")],
    ["setEpicArchived", "epics", (m) => m.setEpicArchived("epic-1", true, "board")],
    ["setCardEpic", "tasks", (m) => m.setCardEpic("task-1", null, "board")],
    ["addSubtask", "tasks", (m) => m.addSubtask("task-1", "Subtask", "board")],
    ["toggleSubtask", "tasks", (m) => m.toggleSubtask("task-1", true, "board")],
    ["addBlocker", "tasks", (m) => m.addBlocker("task-1", "Blocked on API", null, "board")],
    ["toggleBlocker", "tasks", (m) => m.toggleBlocker("blocker-1", true, "board")],
    ["setBlockerAssignee", "tasks", (m) => m.setBlockerAssignee("blocker-1", "person-2", "board")],
    ["reorderCard", "tasks", (m) => m.reorderCard("task-1", ["task-1", "task-2"], "board")],
    ["updateSprintBrief", "sprints", (m) => m.updateSprintBrief("sprint-1", { goal: "Ship" }, "board")],
    ["setSprintMeeting", "sprints", (m) => m.setSprintMeeting("sprint-1", null, "board")],
    ["pullSprintBriefFromMeeting", "sprints", (m) => m.pullSprintBriefFromMeeting("sprint-1")],
    ["setTaskTokens", "tasks", (m) => m.setTaskTokens("task-1", 3, "board")],
    ["addComment", "tasks", (m) => m.addComment("task-1", "Nice", "board")],
    ["restoreCard", "tasks", (m) => m.restoreCard("task-1", "board")],
    ["snoozeCard", "tasks", (m) => m.snoozeCard("task-1", "2026-10-01", "board")],
  ];

  const WRITES = ["insert", "update", "upsert", "delete"];
  const wrote = () => calls.filter((c) => c.ops.some((op) => WRITES.includes(op)));

  afterEach(async () => {
    // The factory's default is a permitted admin; every other suite depends on
    // it, so put it back rather than leaving the gate closed.
    const { boardActorFor } = await import("./access");
    vi.mocked(boardActorFor).mockResolvedValue({ label: "tester", personId: "person-1", isAdmin: true });
  });

  it.each(mutations)("%s denies a non-member and writes nothing", async (_name, lookup, run) => {
    const { boardActorFor } = await import("./access");
    vi.mocked(boardActorFor).mockResolvedValue(null);
    if (lookup) script(lookup, { data: { board_id: "board-1" } });
    const actions = { ...(await import("./actions")), ...(await import("./blocker-actions")), ...(await import("./reorder-actions")), ...(await import("./epic-actions")), ...(await import("./token-actions")), ...(await import("./sprint-actions")), ...(await import("./snooze-actions")) };
    expect(await run(actions)).toEqual({ ok: false, error: DENIED });
    expect(wrote()).toEqual([]);
  });

  it("sizing a subtask re-derives the parent card as the sum of its sized subtasks", async () => {
    // gate lookup -> the estimate module's row read (with parent) -> its own
    // subtasks (none) -> subtask update -> siblings read -> parent update
    script(
      "tasks",
      { data: { board_id: "board-1" } },
      { data: { parent_task_id: "parent-1" } },
      { data: [] },
      { data: null },
      { data: [{ human_tokens: 0.3 }, { human_tokens: 2 }, { human_tokens: null }] },
      { data: null },
    );
    const { setTaskTokens } = await import("./token-actions");
    expect(await setTaskTokens("sub-1", 0.3, "board")).toEqual({ ok: true });
    expect(wrote().map((c) => c.payloads[0])).toEqual([{ human_tokens: 0.3 }, { human_tokens: 2.3 }]);
  });

  it("refuses to type a figure onto a card whose subtasks are sized", async () => {
    // gate lookup -> the module's row read -> the card's own sized subtasks
    script("tasks", { data: { board_id: "board-1", assignee_id: null, title: "Card", metadata: {} } }, { data: { parent_task_id: null } }, { data: [{ human_tokens: 1 }] });
    const { updateCard } = await import("./actions");
    const r = await updateCard("task-1", { humanTokens: 3 }, "board");
    expect(r.ok).toBe(false);
    expect(wrote()).toEqual([]);
  });

  // A.29.2. setTaskTokens used to write any row; only the List's disabled input
  // kept a typed figure off a parent whose subtasks are sized. The estimate
  // module refuses it for every writer now.
  it("refuses setTaskTokens on a card whose subtasks are sized, and writes nothing", async () => {
    script("tasks", { data: { board_id: "board-1" } }, { data: { parent_task_id: null } }, { data: [{ human_tokens: 1 }, { human_tokens: 0.3 }] });
    const { setTaskTokens } = await import("./token-actions");
    const { DERIVED_TOKENS_ERROR } = await import("./tokens");
    expect(await setTaskTokens("parent-1", 5, "board")).toEqual({ ok: false, error: DERIVED_TOKENS_ERROR });
    expect(wrote()).toEqual([]);
  });

  // A.29.2. updateCard wrote the column itself and never touched the parent,
  // so a subtask's estimate edited through it left the parent's sum stale.
  it("re-derives the parent when a subtask's estimate is saved through updateCard", async () => {
    // gate lookup -> module row read (a subtask) -> its own subtasks (none) ->
    // its estimate -> the parent's subtasks -> the parent's figure
    script(
      "tasks",
      { data: { board_id: "board-1", assignee_id: null, title: "Sub", metadata: {} } },
      { data: { parent_task_id: "parent-1" } },
      { data: [] },
      { data: null },
      { data: [{ human_tokens: 0.3 }, { human_tokens: 1 }] },
      { data: null },
    );
    const { updateCard } = await import("./actions");
    expect(await updateCard("sub-1", { humanTokens: 0.3 }, "board")).toEqual({ ok: true });
    // One write for the subtask's own fields, its estimate included, then the parent's sum.
    expect(wrote().map((c) => c.payloads[0])).toEqual([{ human_tokens: 0.3 }, { human_tokens: 1.3 }]);
  });

  // W.130. The estimate rides in updateCard's one write, so a write that fails
  // leaves no estimate behind and re-derives no parent.
  it("writes no estimate and re-derives no parent when updateCard's write fails", async () => {
    script(
      "tasks",
      { data: { board_id: "board-1", assignee_id: null, title: "Sub", metadata: {} } },
      { data: { parent_task_id: "parent-1", human_tokens: null } },
      { data: [] },
      { error: { message: "connection reset" } },
    );
    const { updateCard } = await import("./actions");
    const r = await updateCard("sub-1", { title: "Renamed", humanTokens: 0.3 }, "board");
    expect(r).toEqual({ ok: false, error: "connection reset" });
    expect(wrote()).toHaveLength(1);
    expect(wrote()[0].payloads[0]).toMatchObject({ title: "Renamed", human_tokens: 0.3 });
  });

  // W.130 review. Two half-done writes in one save are both reported: the
  // membership failure used to replace the parent's, so a stale parent sum
  // was never mentioned.
  it("reports a failed parent re-derive alongside a failed board membership", async () => {
    script(
      "tasks",
      { data: { board_id: "board-1", assignee_id: null, title: "Sub", metadata: {} } },
      { data: { parent_task_id: "parent-1", human_tokens: null } },
      { data: [] },
      { data: null },
      { error: { message: "parent read timeout" } },
    );
    script("board_members", { error: { message: "members unavailable" } });
    const { updateCard } = await import("./actions");
    const r = await updateCard("sub-1", { humanTokens: 0.3, assigneeId: "person-2" }, "board");
    expect(r.ok).toBe(false);
    const error = r.ok ? "" : r.error;
    expect(error).toContain("members unavailable");
    expect(error).toContain("parent read timeout");
    // The card's own write is audited even though the save stopped early.
    const { recordAudit } = await import("@/kernel/audit/audit");
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ recordId: "sub-1", newData: expect.objectContaining({ human_tokens: 0.3 }) }));
  });

  // W.130. Clearing a subtask that WAS sized takes its work out of the parent,
  // exactly as archiving it does: a parent left with no sized subtask is
  // cleared rather than keeping the old sum.
  it("clears the parent's figure when its only sized subtask is cleared", async () => {
    script(
      "tasks",
      { data: { board_id: "board-1" } },
      { data: { parent_task_id: "parent-1", human_tokens: 0.3 } },
      { data: [] },
      { data: null },
      { data: [{ human_tokens: null }] },
      { data: null },
    );
    const { setTaskTokens } = await import("./token-actions");
    expect(await setTaskTokens("sub-1", null, "board")).toEqual({ ok: true });
    expect(wrote().map((c) => c.payloads[0])).toEqual([{ human_tokens: null }, { human_tokens: null }]);
  });

  // W.130 round 2. A clear is the one estimate write a retry cannot repair:
  // the retry would find the subtask already empty and leave the parent's
  // stale sum alone. So a clear whose parent fails is put back, and the retry
  // starts from the same state.
  it("puts a cleared subtask back when its parent fails, so saving again clears the parent", async () => {
    script(
      "tasks",
      { data: { board_id: "board-1" } },
      { data: { parent_task_id: "parent-1", human_tokens: 0.3 } },
      { data: [] },
      { data: null },
      { error: { message: "parent read timeout" } },
      { data: [{ id: "sub-1" }] },
    );
    const { setTaskTokens } = await import("./token-actions");
    const first = await setTaskTokens("sub-1", null, "board");
    expect(first.ok).toBe(false);
    expect(first.ok ? "" : first.error).toMatch(/^Estimate not saved, because .*parent read timeout.*Save again/);
    expect(wrote().map((c) => c.payloads[0])).toEqual([{ human_tokens: null }, { human_tokens: 0.3 }]);

    calls.length = 0;
    // The retry reads the row as the first attempt left it: sized again.
    script(
      "tasks",
      { data: { board_id: "board-1" } },
      { data: { parent_task_id: "parent-1", human_tokens: 0.3 } },
      { data: [] },
      { data: null },
      { data: [{ human_tokens: null }] },
      { data: null },
    );
    expect(await setTaskTokens("sub-1", null, "board")).toEqual({ ok: true });
    expect(wrote().map((c) => c.payloads[0])).toEqual([{ human_tokens: null }, { human_tokens: null }]);
  });

  it("leaves a figure someone else saved in between rather than putting the old one back", async () => {
    script(
      "tasks",
      { data: { board_id: "board-1" } },
      { data: { parent_task_id: "parent-1", human_tokens: 0.3 } },
      { data: [] },
      { data: null },
      { error: { message: "parent read timeout" } },
      // The put-back is conditional on the row still being empty: no row matched.
      { data: [] },
    );
    const { setTaskTokens } = await import("./token-actions");
    const r = await setTaskTokens("sub-1", null, "board");
    expect(r.ok ? "" : r.error).toMatch(/^Subtask saved, but .*parent read timeout/);
    const putBack = wrote()[1];
    expect(putBack.payloads[0]).toEqual({ human_tokens: 0.3 });
    // The guard is on THIS row and on the value this save wrote, not merely
    // some `.is` (W.132): `.is("archived_at", null)` would not protect a
    // newer figure.
    expect(putBack.filters).toEqual([
      ["eq", "id", "sub-1"],
      ["is", "human_tokens", null],
    ]);
  });

  it("reports both failures when the put-back itself fails (W.132)", async () => {
    script(
      "tasks",
      { data: { board_id: "board-1" } },
      { data: { parent_task_id: "parent-1", human_tokens: 0.3 } },
      { data: [] },
      { data: null },
      { error: { message: "parent read timeout" } },
      { error: { message: "put-back refused" } },
    );
    const { setTaskTokens } = await import("./token-actions");
    const r = await setTaskTokens("sub-1", null, "board");
    expect(r.ok).toBe(false);
    const error = r.ok ? "" : r.error;
    expect(error).toContain("parent read timeout");
    expect(error).toContain("put-back refused");
    // Not reported as put back, because it was not: the subtask stays cleared.
    expect(error).not.toMatch(/^Estimate not saved/);
  });

  it("says so through updateCard when a cleared subtask is put back", async () => {
    script(
      "tasks",
      { data: { board_id: "board-1", assignee_id: null, title: "Sub", metadata: {} } },
      { data: { parent_task_id: "parent-1", human_tokens: 0.3 } },
      { data: [] },
      { data: null },
      { error: { message: "parent read timeout" } },
      { data: [{ id: "sub-1" }] },
    );
    const { updateCard } = await import("./actions");
    const r = await updateCard("sub-1", { title: "Renamed", humanTokens: null }, "board");
    expect(r.ok ? "" : r.error).toMatch(/^Card saved, but its estimate was put back, because .*parent read timeout/);
  });

  it("archiving a sized subtask re-derives its parent from what remains", async () => {
    // lookup (with parent) -> archive update -> remaining subtasks read -> parent update
    script("tasks", { data: { board_id: "board-1", parent_task_id: "parent-1", human_tokens: 0.3 } }, { data: null }, { data: [{ human_tokens: 1 }] }, { data: null });
    const { archiveCard } = await import("./actions");
    expect(await archiveCard("sub-1", "board")).toEqual({ ok: true });
    expect(wrote()).toHaveLength(2);
    expect(wrote()[1].payloads[0]).toEqual({ human_tokens: 1 });
  });

  it("archiving the last sized subtask clears the parent's derived figure rather than keeping stale work", async () => {
    script("tasks", { data: { board_id: "board-1", parent_task_id: "parent-1", human_tokens: 0.3 } }, { data: null }, { data: [{ human_tokens: null }] }, { data: null });
    const { archiveCard } = await import("./actions");
    expect(await archiveCard("sub-1", "board")).toEqual({ ok: true });
    expect(wrote()).toHaveLength(2);
    expect(wrote()[1].payloads[0]).toEqual({ human_tokens: null });
  });

  it("archiving a top-level card touches no parent", async () => {
    script("tasks", { data: { board_id: "board-1", parent_task_id: null, human_tokens: 2 } }, { data: null });
    const { archiveCard } = await import("./actions");
    expect(await archiveCard("task-1", "board")).toEqual({ ok: true });
    expect(wrote()).toHaveLength(1);
  });

  it("tells a caller the same thing whether the row is missing or out of reach", async () => {
    // The gate stays open here: the row itself is gone. Before AR-26 this said
    // "Card not found." while a denied member got DENIED, so anyone holding a
    // task id could tell an existing card from a non-existent one.
    script("tasks", { data: null });
    const { archiveCard } = await import("./actions");
    expect(await archiveCard("task-1", "board")).toEqual({ ok: false, error: DENIED });
    expect(wrote()).toEqual([]);
  });

  it("still separates a failed lookup from a missing row", async () => {
    script("tasks", { error: { message: "read timeout" } });
    const { archiveCard } = await import("./actions");
    const r = await archiveCard("task-1", "board");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("read timeout");
    expect(r.error).not.toBe(DENIED);
  });
});
