import { companyOs } from "@/kernel/data/supabase";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";
import { cardStuck } from "./types";

// getWorkboard is the one read behind every workboard surface (WB-01). What
// these tests pin down is the two things a surface relies on it for: the
// PRIVACY HARD LINE of clientSafe (no internal card and no working notes ever
// leave the server for a client), and the lane merge (a lane is a column
// name, and a card lands on the lane its own board's column is named).
//
// The fake client is the kernel's house fake
// (kernel/data/testing/fake-company-os.ts), as actions.test.ts uses: every
// `companyOs.from(t)` hands back a chainable builder that, when awaited,
// resolves to the next scripted response for that table, in call order, and
// throws on a query no test scripted.

vi.mock("@/kernel/data/supabase", () => ({
  companyOs: { from: (table: string) => builderFor(table) },
}));
// The door this file reaches for pulls the entity barrel, and through it a
// module built on unstable_cache at load and the kernel auth guards, whose
// session readers are wrapped in React's `cache` (which the React vitest
// resolves lacks); these keep both inert.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), unstable_cache: <T,>(fn: T) => fn }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  cache: <T,>(fn: T) => fn,
}));

const { getWorkboard } = await import("./workboard");

const DAY = 86_400_000;
const board = (id: string, client: string | null) => ({
  id,
  name: `Board ${id}`,
  slug: `board-${id}`,
  description: null,
  client_company_id: client,
  ai_program_id: null,
  owner_id: null,
  status: "active",
  sort_order: 1,
});
const column = (id: string, board_id: string, name: string, position: number, is_done = false) => ({ id, board_id, name, position, is_done });
const task = (over: Record<string, unknown>) => ({
  id: "t",
  title: "Card",
  description: "notes",
  board_id: "b1",
  board_column_id: "c1",
  sprint_id: null,
  epic_id: null,
  position: 1,
  assignee_id: null,
  created_by: null,
  status: "open",
  priority: "p2",
  due_date: null,
  human_tokens: 3,
  completed_at: null,
  internal: false,
  subject_type: null,
  subject_id: null,
  parent_task_id: null,
  metadata: { source: "agent" },
  archived_at: null,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  ...over,
});

beforeEach(() => {
  resetFake();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

// Two client boards; the second renamed its middle column.
function scriptTwoBoards(
  tasks: unknown[],
  people: unknown[] = [{ id: "p1", display_name: "Quinn", full_name: null, email: "q@x" }],
  epics: unknown[] = [],
  deliverables: { data?: unknown; error?: { message: string } } = { data: [] },
) {
  script("boards", { data: [board("b1", "co1"), board("b2", "co2")] });
  // The second boards read: every client with a live board, for the client colours.
  script("boards", { data: [{ client_company_id: "co2" }, { client_company_id: "co1" }, { client_company_id: "co1" }] });
  script("board_columns", {
    data: [
      column("c1", "b1", "To do", 0),
      column("c2", "b1", "Doing", 1),
      column("c3", "b1", "Done", 2, true),
      column("c4", "b2", "To do", 0),
      column("c5", "b2", "In progress", 1),
      column("c6", "b2", "Done", 2, true),
    ],
  });
  script("board_members", { data: [] });
  script("sprints", { data: [] });
  script("epics", { data: epics });
  script("tasks", { data: tasks });
  script("staff_assignments", { data: [] });
  script("companies", { data: [{ id: "co1", name: "Acme" }, { id: "co2", name: "Beta" }] });
  script("person_companies", { data: [] });
  script("people", { data: people });
  script("task_stage_log", { data: [] });
  script("task_comments", { data: [{ id: "k1", task_id: "t1", author_label: "Dave", body: "secret", created_at: "2026-09-02T00:00:00Z" }] });
  script("task_attachments", deliverables);
}

describe("getWorkboard epics", () => {
  it("lists epics alphabetically whatever their sort_order", async () => {
    const epic = (id: string, name: string, sort_order: number) => ({ id, board_id: "b1", name, description: null, color: null, status: "active", sort_order });
    scriptTwoBoards([], undefined, [epic("e1", "Recruitment", 1), epic("e2", "accounting", 2), epic("e3", "Engagement", 0)]);
    const wb = await getWorkboard({ scope: { kind: "all" } });
    expect(wb.epics.map((e) => e.name)).toEqual(["accounting", "Engagement", "Recruitment"]);
  });
});

// W.158: the paperclip's number. Team surfaces only; a failed count is no count.
describe("getWorkboard deliverable counts", () => {
  it("counts each card's live deliverables on a team read", async () => {
    scriptTwoBoards([task({ id: "t1" }), task({ id: "t2" })], undefined, [], { data: [{ task_id: "t1" }, { task_id: "t1" }, { task_id: "t1" }] });
    const wb = await getWorkboard({ scope: { kind: "all" } });
    expect(wb.cards.map((c) => c.deliverable_count)).toEqual([3, 0]);
    const q = calls.find((c) => c.table === "task_attachments")!;
    expect(q.filters).toEqual(expect.arrayContaining([["is", "archived_at", null]]));
  });

  it("draws no count at all when the count could not be read", async () => {
    scriptTwoBoards([task({ id: "t1" })], undefined, [], { error: { message: "down" } });
    const wb = await getWorkboard({ scope: { kind: "all" } });
    expect(wb.cards[0].deliverable_count).toBeUndefined();
  });

  it("never asks on a client-safe read", async () => {
    scriptTwoBoards([task({ id: "t1" })], undefined, [], { data: [{ task_id: "t1" }] });
    const wb = await getWorkboard({ scope: { kind: "companies", ids: ["co1", "co2"] }, clientSafe: true });
    expect(wb.cards[0].deliverable_count).toBeUndefined();
    expect(calls.some((c) => c.table === "task_attachments")).toBe(false);
  });
});

describe("getWorkboard lanes", () => {
  it("merges lanes by column name in first-seen order and maps each board's columns", async () => {
    scriptTwoBoards([task({ id: "t1", assignee_id: "p1" }), task({ id: "t2", board_id: "b2", board_column_id: "c5" })]);
    const wb = await getWorkboard({ scope: { kind: "all" } });
    expect(wb.lanes.map((l) => l.id)).toEqual(["To do", "Doing", "Done", "In progress"]);
    expect(wb.lanes.find((l) => l.id === "Done")?.isDone).toBe(true);
    expect(wb.boards[1].laneColumn).toEqual({ "To do": "c4", "In progress": "c5", Done: "c6" });
    expect(wb.cards.map((c) => c.laneId)).toEqual(["To do", "In progress"]);
    expect(wb.clients.map((c) => c.name)).toEqual(["Acme", "Beta"]);
    // Colours follow company id order, so each client gets its own slot on every surface.
    expect(wb.boards.map((b) => b.client_color)).toEqual([0, 1]);
    expect(wb.cards[0].comments).toHaveLength(1);
  });

  it("scopes to an assignee and drops done cards older than the window on a many-board scope", async () => {
    const old = new Date(Date.now() - 30 * DAY).toISOString();
    const recent = new Date(Date.now() - 2 * DAY).toISOString();
    scriptTwoBoards([
      task({ id: "t1", assignee_id: "p1" }),
      task({ id: "t2", assignee_id: "p1", status: "done", completed_at: old, board_column_id: "c3" }),
      task({ id: "t3", assignee_id: "p1", status: "done", completed_at: recent, board_column_id: "c3" }),
      task({ id: "t4", assignee_id: "p9" }),
      task({ id: "sub", parent_task_id: "t1", assignee_id: "p1" }),
    ]);
    const wb = await getWorkboard({ scope: { kind: "all" }, assigneeId: "p1" });
    expect(wb.cards.map((c) => c.id)).toEqual(["t1", "t3"]);
    expect(wb.cards[0].subtasks.map((s) => s.id)).toEqual(["sub"]);
  });

  it("orders the Done lane newest to oldest by completion, leaving other lanes in position order", async () => {
    const older = new Date(Date.now() - 5 * DAY).toISOString();
    const newer = new Date(Date.now() - 1 * DAY).toISOString();
    scriptTwoBoards([
      task({ id: "todo1", position: 0 }),
      task({ id: "done-old", position: 1, status: "done", completed_at: older, board_column_id: "c3" }),
      task({ id: "todo2", position: 2, board_column_id: "c2" }),
      task({ id: "done-new", position: 3, status: "done", completed_at: newer, board_column_id: "c3" }),
    ]);
    const wb = await getWorkboard({ scope: { kind: "all" } });
    const done = wb.cards.filter((c) => c.laneId === "Done").map((c) => c.id);
    expect(done).toEqual(["done-new", "done-old"]);
    // Non-done cards keep their position order.
    expect(wb.cards.filter((c) => c.laneId !== "Done").map((c) => c.id)).toEqual(["todo1", "todo2"]);
  });

  it("splits blocker children out of subtasks and resolves the tag name", async () => {
    scriptTwoBoards([
      task({ id: "t1", assignee_id: "p1" }),
      task({ id: "sub", parent_task_id: "t1", title: "A subtask" }),
      task({ id: "blk", parent_task_id: "t1", title: "Blocked on API", assignee_id: "p1", metadata: { kind: "blocker" } }),
      task({ id: "blk2", parent_task_id: "t1", title: "Waiting on client", assignee_id: null, status: "done", metadata: { kind: "blocker" } }),
    ]);
    const wb = await getWorkboard({ scope: { kind: "all" } });
    const card = wb.cards.find((c) => c.id === "t1")!;
    expect(card.subtasks.map((s) => s.id)).toEqual(["sub"]);
    expect(card.blockers).toEqual([
      { id: "blk", body: "Blocked on API", assignee_id: "p1", assignee_name: "Quinn", resolved: false, blocked_by: null },
      { id: "blk2", body: "Waiting on client", assignee_id: null, assignee_name: null, resolved: true, blocked_by: null },
    ]);
  });
});

describe("getWorkboard clientSafe", () => {
  it("never lets an internal card or the team's working notes leave the server", async () => {
    scriptTwoBoards([
      task({ id: "t1", assignee_id: "p1" }),
      task({ id: "t2", internal: true }),
      task({ id: "sub", parent_task_id: "t1" }),
      task({ id: "blk", parent_task_id: "t1", title: "Internal blocker", metadata: { kind: "blocker" } }),
    ]);
    // task_comments is not read at all on a client-safe scope: no query on it
    // is even built.
    const wb = await getWorkboard({ scope: { kind: "companies", ids: ["co1", "co2"] }, clientSafe: true });
    expect(wb.cards.map((c) => c.id)).toEqual(["t1"]);
    const card = wb.cards[0];
    expect(card.title).toBe("Card");
    expect(card.assignee_name).toBe("Quinn");
    expect(card.human_tokens).toBe(3);
    expect(card.description).toBeNull();
    expect(card.comments).toEqual([]);
    expect(card.subtasks).toEqual([]);
    expect(card.blockers).toEqual([]);
    expect(card.metadata).toEqual({});
    expect(card.agent).toBe(true);
    expect(calls.some((c) => c.table === "task_comments")).toBe(false);
  });

  it("never names a nameless assignee by their address on a client-safe scope (S.16.26)", async () => {
    scriptTwoBoards([task({ id: "t1", assignee_id: "p1" })], [{ id: "p1", display_name: null, full_name: null, email: "q@x" }]);
    const wb = await getWorkboard({ scope: { kind: "companies", ids: ["co1", "co2"] }, clientSafe: true });
    expect(wb.cards[0].assignee_name).not.toContain("@");
  });

  it("a card asking for a hand does not say so on the portal (W.62)", async () => {
    // The rule is "it appears nowhere but the board", and this is where it is
    // enforced: clientSafeCard blanks metadata, so `cardStuck` — and the
    // strip and badge that read it — answer nothing on a client-safe scope.
    scriptTwoBoards([task({ id: "t1", metadata: { stuck: { since: "2026-09-20T09:00:00Z", note: "waiting on the schema" } } })]);
    const wb = await getWorkboard({ scope: { kind: "companies", ids: ["co1", "co2"] }, clientSafe: true });
    expect(cardStuck(wb.cards[0])).toBeNull();
  });

  it("sends the portal no deliverables, and no PR stamp (W.155, W.161)", async () => {
    // Deliverables are team only. The portal's cards are shaped here, and the
    // loader never reads task_attachments at all on a client-safe scope; the
    // PR's synced title and state ride in metadata, which is blanked.
    scriptTwoBoards([task({ id: "t1", metadata: { pr_url: "https://github.com/o/r/pull/1", pr_synced: { key: "r#1", title: "Internal title", state: "merged" } } })]);
    const wb = await getWorkboard({ scope: { kind: "companies", ids: ["co1", "co2"] }, clientSafe: true });
    expect(JSON.stringify(wb.cards[0])).not.toContain("Internal title");
    expect(calls.some((c) => c.table === "task_attachments")).toBe(false);
  });
});
