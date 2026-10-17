import { companyOs } from "@/kernel/data/supabase";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";
import { cardStuck } from "./types";

// getWorkboard is the one read behind every workboard surface (WB-01). What
// these tests pin down is the two things a surface relies on it for: the
// PRIVACY LINE of clientSafe (no internal card ever leaves the server for a
// client; everything else does, as the team sees it), and the lane merge (a lane is a column
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

  it("counts on a client-safe read too, since 2026-10-12 the client's board is the team's", async () => {
    scriptTwoBoards([task({ id: "t1" })], undefined, [], { data: [{ task_id: "t1" }] });
    const wb = await getWorkboard({ scope: { kind: "companies", ids: ["co1", "co2"] }, clientSafe: true });
    expect(wb.cards[0].deliverable_count).toBe(1);
    expect(calls.some((c) => c.table === "task_attachments")).toBe(true);
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
  it("drops an internal card and nothing else: the client reads the card as the team does (2026-10-12)", async () => {
    scriptTwoBoards([
      task({ id: "t1", assignee_id: "p1" }),
      task({ id: "t2", internal: true }),
      task({ id: "sub", parent_task_id: "t1" }),
      task({ id: "blk", parent_task_id: "t1", title: "Internal blocker", metadata: { kind: "blocker" } }),
    ]);
    const wb = await getWorkboard({ scope: { kind: "companies", ids: ["co1", "co2"] }, clientSafe: true });
    expect(wb.cards.map((c) => c.id)).toEqual(["t1"]);
    const card = wb.cards[0];
    expect(card.title).toBe("Card");
    expect(card.assignee_name).toBe("Quinn");
    expect(card.human_tokens).toBe(3);
    expect(card.description).toBe("notes");
    expect(card.subtasks.map((s) => s.id)).toEqual(["sub"]);
    expect(card.blockers.map((b) => b.id)).toEqual(["blk"]);
    expect(card.agent).toBe(true);
    // Comments are read for the client too.
    expect(calls.some((c) => c.table === "task_comments")).toBe(true);
  });

  it("never names a nameless assignee by their address on a client-safe scope (S.16.26)", async () => {
    scriptTwoBoards([task({ id: "t1", assignee_id: "p1" })], [{ id: "p1", display_name: null, full_name: null, email: "q@x" }]);
    const wb = await getWorkboard({ scope: { kind: "companies", ids: ["co1", "co2"] }, clientSafe: true });
    expect(wb.cards[0].assignee_name).not.toContain("@");
  });

  it("a card asking for a hand says so on the portal too, since the board is the same there (2026-10-12)", async () => {
    scriptTwoBoards([task({ id: "t1", metadata: { stuck: { since: "2026-09-20T09:00:00Z", note: "waiting on the schema" } } })]);
    const wb = await getWorkboard({ scope: { kind: "companies", ids: ["co1", "co2"] }, clientSafe: true });
    expect(cardStuck(wb.cards[0])?.note).toBe("waiting on the schema");
  });

  it("sends the portal the PR stamp and the comments as the team sees them (2026-10-12)", async () => {
    scriptTwoBoards([task({ id: "t1", metadata: { pr_url: "https://github.com/o/r/pull/1", pr_synced: { key: "r#1", title: "Internal title", state: "merged" } } })], undefined, [{ id: "k1", task_id: "t1", author_id: "p1", body: "secret", created_at: "2026-09-02T00:00:00Z", parent_id: null, resolved_at: null, resolved_by: null, mentions: [] }]);
    const wb = await getWorkboard({ scope: { kind: "companies", ids: ["co1", "co2"] }, clientSafe: true });
    expect(JSON.stringify(wb.cards[0])).toContain("Internal title");
    expect(wb.cards[0].comments.map((c) => c.body)).toEqual(["secret"]);
  });
});

// A.45, the PR #2120 review: `people` is one list behind the assignee picker,
// the Assignee filter, the bulk bar and group-by-assignee, so who is on it
// depends on whose board it is. Staff everywhere; a client's contacts only on
// that one client's board; no contact, and no contact read, for a client.
describe("getWorkboard people knows its audience", () => {
  const staffRow = { id: "p1", display_name: "Quinn", preferred_name: null, full_name: null, email: "q@x", is_team_member: true };
  const contactRow = (id: string, name: string) => ({ id, display_name: name, preferred_name: null, full_name: null, email: `${id}@x`, is_team_member: false });
  // One contact at each client: k1 works at co1 (Acme), k2 at co2 (Beta).
  const contacts = [{ person_id: "k1", company_id: "co1" }, { person_id: "k2", company_id: "co2" }];
  const peopleRows = [staffRow, contactRow("k1", "Avery"), contactRow("k2", "Blake")];

  // One board, a client's or (client null) Edge8's own. The contact read is
  // scripted only when the caller says it should happen, so a read the code
  // should not make throws in the fake rather than passing quietly.
  function scriptOneBoard(client: string | null, people: unknown[], contactRows?: unknown[]) {
    script("boards", { data: [board("b1", client)] });
    script("boards", { data: client ? [{ client_company_id: client }] : [] });
    script("board_columns", { data: [column("c1", "b1", "To do", 0)] });
    script("board_members", { data: [] });
    script("sprints", { data: [] });
    script("epics", { data: [] });
    script("tasks", { data: [task({ id: "t1", assignee_id: "p1" })] });
    if (client) {
      script("staff_assignments", { data: [] });
      script("companies", { data: [{ id: client, name: "Acme" }] });
      script("client_backlog_items", { data: [] });
      script("client_roadmap_groups", { data: [] });
    }
    if (contactRows) script("person_companies", { data: contactRows });
    script("people", { data: people });
    script("task_stage_log", { data: [] });
    script("task_comments", { data: [] });
    // The archived-cards read, single-board only.
    script("tasks", { data: [] });
    script("task_attachments", { data: [] });
  }

  it("a client-safe read never reads contacts and lists staff only (a)", async () => {
    // The card is assigned to a contact, which a client board allows: the card
    // still names them, but the list does not offer them.
    scriptTwoBoards([task({ id: "t1", assignee_id: "k1" })], [staffRow, contactRow("k1", "Avery")]);
    const wb = await getWorkboard({ scope: { kind: "companies", ids: ["co1", "co2"] }, clientSafe: true });
    expect(calls.some((c) => c.table === "person_companies")).toBe(false);
    expect(wb.clientContacts).toEqual([]);
    expect(wb.people.map((p) => p.id)).toEqual(["p1"]);
    expect(wb.cards[0].assignee_name).toBe("Avery");
  });

  it("one client's board read client-safe lists staff only too (a)", async () => {
    scriptOneBoard("co1", [staffRow]);
    const wb = await getWorkboard({ scope: { kind: "boards", ids: ["b1"] }, clientSafe: true });
    expect(calls.some((c) => c.table === "person_companies")).toBe(false);
    expect(wb.clientContacts).toEqual([]);
    expect(wb.people.map((p) => p.id)).toEqual(["p1"]);
  });

  it("the all-boards scope offers no contact as an assignee, though a blocker may still tag one (b)", async () => {
    script("boards", { data: [board("b1", "co1"), board("b2", "co2")] });
    script("boards", { data: [{ client_company_id: "co1" }, { client_company_id: "co2" }] });
    script("board_columns", { data: [column("c1", "b1", "To do", 0), column("c4", "b2", "To do", 0)] });
    script("board_members", { data: [] });
    script("sprints", { data: [] });
    script("epics", { data: [] });
    script("tasks", { data: [task({ id: "t1" })] });
    script("staff_assignments", { data: [] });
    script("companies", { data: [{ id: "co1", name: "Acme" }, { id: "co2", name: "Beta" }] });
    script("person_companies", { data: contacts });
    script("people", { data: peopleRows });
    script("task_stage_log", { data: [] });
    script("task_comments", { data: [] });
    script("task_attachments", { data: [] });
    const wb = await getWorkboard({ scope: { kind: "all" } });
    expect(wb.people.map((p) => p.id)).toEqual(["p1"]);
    // The blocker picker's Client list is a separate list and keeps its contacts.
    expect(wb.clientContacts.map((p) => p.id).sort()).toEqual(["k1", "k2"]);
  });

  it("one client's board offers that client's contacts and no other company's (c)", async () => {
    // The read asks for co1 only; the stray co2 row proves the merge checks
    // the company itself rather than trusting the filter.
    scriptOneBoard("co1", peopleRows, contacts);
    const wb = await getWorkboard({ scope: { kind: "boards", ids: ["b1"] } });
    const contactRead = calls.find((c) => c.table === "person_companies")!;
    expect(contactRead.filters).toEqual(expect.arrayContaining([["in", "company_id", ["co1"]]]));
    expect(wb.people.map((p) => p.id)).toEqual(["k1", "p1"]);
  });

  it("Edge8's own board (no client) offers staff only and reads no contacts", async () => {
    scriptOneBoard(null, [staffRow]);
    const wb = await getWorkboard({ scope: { kind: "boards", ids: ["b1"] } });
    expect(calls.some((c) => c.table === "person_companies")).toBe(false);
    expect(wb.people.map((p) => p.id)).toEqual(["p1"]);
  });
});
