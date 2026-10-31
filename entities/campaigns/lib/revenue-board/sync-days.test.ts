import { beforeEach, describe, expect, it, vi } from "vitest";
import { answerOnlySelectedColumns, builderFor, calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// The hourly pass from calendar to board. Scripted in the order it asks:
// the content read, the day-card read, the subtask read, then its writes.

vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const landed: { taskId: string; toColumnId: string }[] = [];
const births: { card: Record<string, unknown>; completedAt?: string }[] = [];
vi.mock("@/entities/boards", async () => ({
  // boards' real questions and the sync's edit command (card-lookups.test.ts
  // pins their queries), on the fake client.
  ...(await vi.importActual<Record<string, unknown>>("@/entities/boards/lib/card-lookups")),
  ...(await vi.importActual<Record<string, unknown>>("@/entities/boards/lib/sync-edits")),
  // bearCard's own contract (status, position, create row, events) is tested
  // beside it (A.53); here the birth is the insert it makes, scripted on tasks.
  bearCard: async (b: { card: Record<string, unknown>; completedAt?: string }) => {
    births.push(b);
    const { data, error } = await builderFor("tasks").insert(b.card).select("id").single();
    if (error) return { ok: false, error: error.message, ...((error as { code?: string }).code ? { code: (error as { code?: string }).code } : {}) };
    return { ok: true, id: (data as { id?: string } | null)?.id ?? "new-card" };
  },
  bearSubtasks: (row: unknown) => builderFor("tasks").insert(row),
  dayLabel: () => "Thu 24 Sep",
  landCardAsSystem: async (m: { taskId: string; toColumnId: string }) => {
    landed.push(m);
    return { ok: true };
  },
}));

const { syncContentDays } = await import("./sync-days");

const BOARD = {
  id: "board-1",
  slug: "revenue",
  ownerId: "thao",
  epicId: "epic-1",
  columns: { todo: "col-todo", doing: "col-doing", waiting: "col-waiting", done: "col-done", notDoing: "col-nd" },
};
const post = (id: string, status: string, channel = "linkedin", campaign: string | null = null, startsOn = "2026-09-20") => ({
  id,
  title: `Post ${id}`,
  channel,
  status,
  publish_date: "2026-09-24",
  marketing_campaigns: campaign ? { name: campaign, starts_on: startsOn } : null,
});
const inserts = () => calls.filter((c) => c.table === "tasks" && c.ops[0] === "insert").map((c) => c.payloads[0] as Record<string, unknown>);

beforeEach(() => {
  resetFake();
  landed.length = 0;
  births.length = 0;
});

describe("the content days on the Revenue board", () => {
  it("makes a day's card for the owner, with a subtask per post", async () => {
    script("marketing_content", { data: [post("a1", "approved"), post("a2", "drafted", "twitter")] });
    script("tasks", { data: [] }, { data: [] }, { data: { id: "day-1", status: "open", archived_at: null, metadata: { content_day: "2026-09-24", content_state: "open" } } }, { error: null }, { error: null });

    const r = await syncContentDays(BOARD, "2026-09-24");
    expect(r).toMatchObject({ cardsCreated: 1, subtasksWritten: 2, moved: 0, errors: [] });
    const [card, s1, s2] = inserts();
    expect(card).toMatchObject({ title: "Content · Thu 24 Sep", metadata: { content_title: "Content · Thu 24 Sep" }, assignee_id: "thao", due_date: "2026-09-24", board_column_id: "col-todo", subject_type: "marketing_day", epic_id: "epic-1" });
    expect(s1).toMatchObject({ parent_task_id: "day-1", title: "LinkedIn: Post a1", status: "open", subject_id: "a1", human_tokens: 0.05 });
    expect(s2).toMatchObject({ title: "Twitter: Post a2 (needs a human)" });
  });

  it("closes the day once its last post is out", async () => {
    const day = { id: "day-1", status: "open", archived_at: null, metadata: { content_day: "2026-09-24", content_state: "open" } };
    const sub = { id: "s1", parent_task_id: "day-1", title: "LinkedIn: Post a1", status: "open", archived_at: null, subject_id: "a1" };
    script("marketing_content", { data: [post("a1", "published")] });
    script("tasks", { data: [day] }, { data: [sub] }, { error: null }, { error: null });

    const r = await syncContentDays(BOARD, "2026-09-24");
    expect(r).toMatchObject({ moved: 1, errors: [] });
    expect(landed).toEqual([{ taskId: "day-1", toColumnId: "col-done", label: "content sync" }]);
  });

  it("does not drag a day back when a person reopened it and nothing on the calendar changed", async () => {
    const day = { id: "day-1", status: "open", archived_at: null, metadata: { content_day: "2026-09-24", content_state: "done" } };
    const sub = { id: "s1", parent_task_id: "day-1", title: "LinkedIn: Post a1", status: "done", archived_at: null, subject_id: "a1" };
    script("marketing_content", { data: [post("a1", "published")] });
    script("tasks", { data: [day] }, { data: [sub] });

    const r = await syncContentDays(BOARD, "2026-09-24");
    expect(r).toMatchObject({ moved: 0, errors: [] });
    expect(landed).toEqual([]);
  });

  it("leaves a day alone that a person archived", async () => {
    const day = { id: "day-1", status: "open", archived_at: "2026-09-24T01:00:00Z", metadata: { content_day: "2026-09-24" } };
    script("marketing_content", { data: [post("a1", "approved")] });
    script("tasks", { data: [day] }, { data: [] });

    const r = await syncContentDays(BOARD, "2026-09-24");
    expect(r).toMatchObject({ cardsCreated: 0, subtasksWritten: 0 });
    expect(inserts()).toEqual([]);
  });
});

// The day card names the campaigns its posts belong to, so a campaign's posts
// are findable on the board by its name, not only by the date.
describe("a day card's title", () => {
  const updates = () => calls.filter((c) => c.table === "tasks" && c.ops[0] === "update").map((c) => c.payloads[0] as Record<string, unknown>);

  it("names the campaigns with a post that day when it makes the card", async () => {
    // As PostgREST answers: the campaign's name comes back only if the read
    // asks for it, so a select that dropped the join fails here.
    answerOnlySelectedColumns();
    script("marketing_content", { data: [post("a1", "approved", "linkedin", "Level 3"), post("a2", "approved", "twitter", "Day 17", "2026-09-24")] });
    script("tasks", { data: [] }, { data: [] }, { data: { id: "day-1" } }, { error: null }, { error: null });

    await syncContentDays(BOARD, "2026-09-24");
    // Day 17 launches that day, so it is named first; the join must carry the
    // campaign's start date for the sync to know.
    expect(inserts()[0]).toMatchObject({ title: "Content · Thu 24 Sep · Day 17 + Level 3", metadata: { content_title: "Content · Thu 24 Sep · Day 17 + Level 3" } });
    expect(calls.find((c) => c.table === "marketing_content")?.columns).toContain("marketing_campaigns!campaign_id(name, starts_on)");
  });

  it("retitles a card made before titles named campaigns, and a later close keeps the new title's record", async () => {
    const day = { id: "day-1", title: "Content · Thu 24 Sep", status: "open", archived_at: null, metadata: { content_day: "2026-09-24", content_state: "open" } };
    const sub = { id: "s1", parent_task_id: "day-1", title: "LinkedIn: Post a1", status: "open", archived_at: null, subject_id: "a1" };
    script("marketing_content", { data: [post("a1", "published", "linkedin", "Level 3")] });
    script("tasks", { data: [day] }, { data: [sub] }, { error: null }, { error: null }, { error: null });

    const r = await syncContentDays(BOARD, "2026-09-24");
    expect(r).toMatchObject({ retitled: 1, moved: 1, errors: [] });
    const [retitle, , close] = updates();
    expect(retitle).toEqual({ title: "Content · Thu 24 Sep · Level 3", metadata: { content_day: "2026-09-24", content_state: "open", content_title: "Content · Thu 24 Sep · Level 3" } });
    expect(close).toMatchObject({ metadata: { content_state: "done", content_title: "Content · Thu 24 Sep · Level 3" } });
  });

  it("follows a campaign joining the day, while the title is still the sync's own", async () => {
    const day = { id: "day-1", title: "Content · Thu 24 Sep · Level 3", status: "open", archived_at: null, metadata: { content_day: "2026-09-24", content_state: "open", content_title: "Content · Thu 24 Sep · Level 3" } };
    const sub = (id: string, ch: string) => ({ id: `s-${id}`, parent_task_id: "day-1", title: `${ch}: Post ${id}`, status: "open", archived_at: null, subject_id: id });
    script("marketing_content", { data: [post("a1", "approved", "linkedin", "Level 3"), post("a2", "approved", "linkedin", "Day 17")] });
    script("tasks", { data: [day] }, { data: [sub("a1", "LinkedIn"), sub("a2", "LinkedIn")] }, { error: null });

    const r = await syncContentDays(BOARD, "2026-09-24");
    expect(r).toMatchObject({ retitled: 1, errors: [] });
    expect(updates()).toEqual([{ title: "Content · Thu 24 Sep · Level 3 + Day 17", metadata: { ...day.metadata, content_title: "Content · Thu 24 Sep · Level 3 + Day 17" } }]);
  });

  it("never overwrites a title a person typed", async () => {
    const day = { id: "day-1", title: "Launch day posts", status: "open", archived_at: null, metadata: { content_day: "2026-09-24", content_state: "open", content_title: "Content · Thu 24 Sep" } };
    const sub = { id: "s1", parent_task_id: "day-1", title: "LinkedIn: Post a1", status: "open", archived_at: null, subject_id: "a1" };
    script("marketing_content", { data: [post("a1", "approved", "linkedin", "Level 3")] });
    script("tasks", { data: [day] }, { data: [sub] });

    const r = await syncContentDays(BOARD, "2026-09-24");
    expect(r).toMatchObject({ retitled: 0, errors: [] });
    expect(updates()).toEqual([]);
  });
});

// R.22: two passes can overlap, so an insert may find its card already made
// (the database holds one per day and one per post, 23505 on the second), and
// that is "another run made it", not an error.
describe("a pass that overlaps another", () => {
  const duplicate = { message: "duplicate key value violates unique constraint", code: "23505" };
  const updates = () => calls.filter((c) => c.table === "tasks" && c.ops[0] === "update").map((c) => c.payloads[0] as Record<string, unknown>);

  it("carries on with the day card another run made a moment ago", async () => {
    const theirs = { id: "day-theirs", status: "open", archived_at: null, metadata: { content_day: "2026-09-24", content_state: "open" } };
    script("marketing_content", { data: [post("a1", "approved")] });
    script("tasks", { data: [] }, { data: [] }, { error: duplicate }, { data: theirs }, { error: null });

    const r = await syncContentDays(BOARD, "2026-09-24");
    expect(r).toMatchObject({ cardsCreated: 0, subtasksWritten: 1, errors: [] });
    expect(inserts()[1]).toMatchObject({ parent_task_id: "day-theirs", subject_id: "a1" });
    const reread = calls.filter((c) => c.table === "tasks" && c.ops[0] === "select")[2];
    expect(reread?.filters).toContainEqual(["eq", "metadata->>content_day", "2026-09-24"]);
    expect(updates()).toEqual([]);
  });

  it("does not count a subtask another run filed a moment ago as an error", async () => {
    const day = { id: "day-1", status: "open", archived_at: null, metadata: { content_day: "2026-09-24", content_state: "open" } };
    script("marketing_content", { data: [post("a1", "approved")] });
    script("tasks", { data: [day] }, { data: [] }, { error: duplicate });

    const r = await syncContentDays(BOARD, "2026-09-24");
    expect(r).toMatchObject({ subtasksWritten: 0, errors: [] });
  });

  it("still reports an insert that failed for any other reason", async () => {
    const day = { id: "day-1", status: "open", archived_at: null, metadata: { content_day: "2026-09-24", content_state: "open" } };
    script("marketing_content", { data: [post("a1", "approved")] });
    script("tasks", { data: [day] }, { data: [] }, { error: { message: "permission denied" } });

    const r = await syncContentDays(BOARD, "2026-09-24");
    expect(r.errors).toEqual(["Post a1: permission denied"]);
  });
});

// R.22: a post that leaves the window (deleted, re-dated outside it, or
// undated) no longer leaves its subtask frozen on the day it left.
describe("a post that left the window", () => {
  const today = { id: "day-24", status: "open", archived_at: null, metadata: { content_day: "2026-09-24", content_state: "open" } };
  const past = { id: "day-20", status: "done", archived_at: null, metadata: { content_day: "2026-09-20", content_state: "done" } };
  const sub = (id: string, subject: string, over: Record<string, unknown> = {}) => ({
    id,
    parent_task_id: "day-24",
    title: `LinkedIn: Post ${subject}`,
    status: "open",
    archived_at: null,
    subject_id: subject,
    ...over,
  });
  const writes = () => calls.filter((c) => c.table === "tasks" && c.ops[0] === "update").map((c) => ({ patch: c.payloads[0] as Record<string, unknown>, id: c.filters.find((f) => f[0] === "eq" && f[1] === "id")?.[2] }));

  it("archives a deleted post's subtask, moves a re-dated one to its new day's card, and archives one whose day has no card yet", async () => {
    script("marketing_content", { data: [post("a1", "approved")] }, { data: [{ id: "moved", publish_date: "2026-09-20" }, { id: "later", publish_date: "2026-10-15" }] });
    script("tasks", { data: [today, past] }, { data: [sub("s1", "a1"), sub("s-gone", "gone"), sub("s-moved", "moved"), sub("s-later", "later")] }, { error: null }, { error: null }, { error: null });

    const r = await syncContentDays(BOARD, "2026-09-24");
    expect(r).toMatchObject({ tidied: 3, errors: [] });
    const w = writes();
    expect(w.map((x) => x.id)).toEqual(["s-gone", "s-moved", "s-later"]);
    expect(w[0].patch).toEqual({ archived_at: expect.any(String) });
    expect(w[1].patch).toEqual({ parent_task_id: "day-20" });
    expect(w[2].patch).toEqual({ archived_at: expect.any(String) });
    // Only the window's day cards are searched for leftovers; a card on a past
    // day keeps whatever a move put there, so nothing moves twice.
    const read = calls.filter((c) => c.table === "tasks" && c.ops[0] === "select")[1];
    const reach = read?.filters.find((f) => f[0] === "or")?.[1] as string;
    expect(reach).toContain("parent_task_id.in.(day-24)");
    expect(reach).not.toContain("day-20");
  });

  it("brings an archived subtask back under its day's card when the post's day enters the window", async () => {
    script("marketing_content", { data: [post("a1", "approved")] });
    script("tasks", { data: [today] }, { data: [sub("s1", "a1", { parent_task_id: "day-20", archived_at: "2026-09-20T01:00:00Z" })] }, { error: null });

    const r = await syncContentDays(BOARD, "2026-09-24");
    expect(r).toMatchObject({ subtasksWritten: 1, tidied: 0, errors: [] });
    expect(writes()[0]).toMatchObject({ id: "s1", patch: { parent_task_id: "day-24", archived_at: null } });
  });

  it("tidies a day whose every post has left, though nothing is in the window", async () => {
    script("marketing_content", { data: [] }, { data: [] });
    script("tasks", { data: [today] }, { data: [sub("s-gone", "gone")] }, { error: null });

    const r = await syncContentDays(BOARD, "2026-09-24");
    expect(r).toMatchObject({ tidied: 1, errors: [] });
    expect(writes()[0]).toMatchObject({ id: "s-gone", patch: { archived_at: expect.any(String) } });
  });

  it("touches nothing, and says why, when the posts that left cannot be read", async () => {
    script("marketing_content", { data: [] }, { error: { message: "content unavailable" } });
    script("tasks", { data: [today] }, { data: [sub("s-gone", "gone")] });

    const r = await syncContentDays(BOARD, "2026-09-24");
    expect(r.errors).toEqual(["posts that left the window: content unavailable"]);
    expect(writes()).toEqual([]);
  });
});
