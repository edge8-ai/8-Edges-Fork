import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";
import { readMyWeek } from "./my-week-read";

// W.169.1. The read exists because the page used to load every task in the
// company and filter to the reader in JavaScript. What is pinned here is the
// shape that makes it cheap and safe: the person filter is IN the query, the
// board reads name only the boards the reader's cards sit on, and a failed
// read raises instead of rendering as "you have no work".
vi.mock("@/kernel/data/supabase", () => fakeSupabase());

beforeEach(() => resetFake());

const ME = "person-me";
const cardRow = (id: string, boardId: string, over: Record<string, unknown> = {}) => ({
  id,
  title: id,
  board_id: boardId,
  board_column_id: `${boardId}-todo`,
  sprint_id: null,
  status: "open",
  priority: "p2",
  due_date: null,
  human_tokens: null,
  completed_at: null,
  assignee_id: ME,
  metadata: {},
  ...over,
});
const boardRow = (id: string, client: string | null = null) => ({
  id,
  name: id,
  slug: id,
  description: null,
  client_company_id: client,
  ai_program_id: null,
  owner_id: null,
  status: "active",
  sort_order: 0,
  metadata: {},
});

describe("readMyWeek", () => {
  it("asks for the reader's cards by assignee in SQL, and reads only the boards they sit on", async () => {
    script(
      "tasks",
      { data: [cardRow("c1", "b1"), cardRow("c2", "b2")] },
      { data: [{ id: "bl1", title: "Needs you", parent_task_id: "p1" }] },
      { data: [cardRow("p1", "b3", { assignee_id: "someone-else" })] },
    );
    script("boards", { data: [boardRow("b1", "co1"), boardRow("b2"), boardRow("b3")] });
    script("board_columns", { data: [{ id: "b1-todo", board_id: "b1", name: "To do", position: 0, is_done: false, wip_limit: null, is_not_doing: false }] });
    script("sprints", { data: [] });
    script("companies", { data: [{ id: "co1", name: "Northwind" }] });

    const read = await readMyWeek(ME, "2026-10-07");

    const [cards, blockers] = calls.filter((c) => c.table === "tasks");
    expect(cards.filters).toContainEqual(["eq", "assignee_id", ME]);
    expect(cards.filters).toContainEqual(["is", "parent_task_id", null]);
    // Six sprints back for the garden (W.173), and a day early on top:
    // completed_at is an instant, the sprint a Saigon calendar.
    expect(cards.filters).toContainEqual(["or", "status.eq.open,and(status.eq.done,completed_at.gte.2026-08-25)"]);
    expect(blockers.filters).toContainEqual(["eq", "assignee_id", ME]);
    expect(blockers.filters).toContainEqual(["eq", "metadata->>kind", "blocker"]);
    // A resolved blocker is a closed child task: only open ones are asked for.
    expect(blockers.filters).toContainEqual(["eq", "status", "open"]);

    const boards = calls.find((c) => c.table === "boards");
    expect(boards?.filters).toContainEqual(["in", "id", ["b1", "b2", "b3"]]);
    expect(calls.find((c) => c.table === "board_columns")?.filters).toContainEqual(["in", "board_id", ["b1", "b2", "b3"]]);

    expect(read.cards.map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(read.blockers).toEqual([expect.objectContaining({ id: "bl1", title: "Needs you", blockedCard: expect.objectContaining({ id: "p1" }) })]);
    expect(read.boards.find((b) => b.id === "b1")).toMatchObject({ client_name: "Northwind", columns: [expect.objectContaining({ id: "b1-todo" })] });
  });

  it("drops a blocker on the reader's own card: a note to yourself is not somebody waiting", async () => {
    script(
      "tasks",
      { data: [] },
      { data: [{ id: "bl1", title: "Remember", parent_task_id: "p1" }] },
      { data: [cardRow("p1", "b1")] },
    );
    const read = await readMyWeek(ME, "2026-10-07");
    expect(read.blockers).toEqual([]);
    expect(calls.some((c) => c.table === "boards")).toBe(false);
  });

  it("drops a blocker whose card is closed: a finished card waits on nobody", async () => {
    script(
      "tasks",
      { data: [] },
      { data: [{ id: "bl1", title: "Sign-off", parent_task_id: "p-closed" }] },
      // The blocked-card read asks for open cards only, so a closed one does not come back.
      { data: [] },
    );
    const read = await readMyWeek(ME, "2026-10-07");
    expect(calls.filter((c) => c.table === "tasks")[2]?.filters).toContainEqual(["eq", "status", "open"]);
    expect(read.blockers).toEqual([]);
  });

  it("raises on a failed read rather than answering with an empty week", async () => {
    script("tasks", { error: { message: "connection reset" } }, { data: [] });
    await expect(readMyWeek(ME, "2026-10-07")).rejects.toThrow(/connection reset/);
  });
});
