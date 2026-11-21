import { describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// W.139: "resolve the blockers naming this card" is documented as resolving
// every OPEN blocker. It filtered on "not done", which also caught a blocker
// closed with its card in Not Doing and stamped it finished, with a date.

vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const row = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock("./mutation", () => ({
  boardMutation: vi.fn(async () => ({ ok: true, actor: { label: "tester", personId: "person-1", isAdmin: true }, row: row.value })),
}));
const published = vi.hoisted(() => [] as [string, Record<string, unknown>][]);
vi.mock("@/kernel/events", () => ({ publish: vi.fn(async (name: string, payload: Record<string, unknown>) => void published.push([name, payload])) }));

const { addBlocker, resolveBlockersNaming, setBlockerAssignee } = await import("./blocker-actions");

describe("resolveBlockersNaming", () => {
  it("resolves only the open blockers that name the card", async () => {
    resetFake();
    script("tasks", { error: null });
    expect(await resolveBlockersNaming("card-1", "board")).toEqual({ ok: true });
    const update = calls.find((c) => c.table === "tasks" && c.ops[0] === "update");
    expect(update?.filters).toContainEqual(["eq", "metadata->>blocked_by_task_id", "card-1"]);
    expect(update?.filters).toContainEqual(["eq", "status", "open"]);
    expect(update?.payloads[0]).toMatchObject({ status: "done" });
  });

  it("says why when the write fails", async () => {
    resetFake();
    script("tasks", { error: { message: "tasks locked" } });
    expect(await resolveBlockersNaming("card-1", "board")).toEqual({ ok: false, error: "tasks locked" });
  });
});

// TH.8.3: a blocker tagged to someone is news in their inbox, once per tag.
describe("a blocker handed to someone", () => {
  it("states it when a blocker is added with someone tagged", async () => {
    resetFake();
    published.length = 0;
    row.value = { board_id: "b-1", title: "Ship it" };
    script("tasks", { data: { id: "bl-1" } });
    script("people", { data: { is_team_member: true } });
    script("board_members", { error: null });
    expect(await addBlocker("card-1", "Waiting on the key", "person-2", "eight-edges")).toEqual({ ok: true });
    // A teammate tagged joins the board, so the card the inbox links opens for them.
    expect(calls.find((c) => c.table === "board_members")?.payloads[0]).toEqual({ board_id: "b-1", person_id: "person-2", role: "member" });
    expect(published).toEqual([
      ["board.blocker.handed", expect.objectContaining({ blockerId: "bl-1", taskId: "card-1", body: "Waiting on the key", title: "Ship it", assigneeId: "person-2", actorPersonId: "person-1" })],
    ]);
  });

  it("states nothing for a blocker tagged to nobody or to the person adding it", async () => {
    resetFake();
    published.length = 0;
    row.value = { board_id: "b-1", title: "Ship it" };
    script("tasks", { data: { id: "bl-2" } }, { data: { id: "bl-3" } });
    script("people", { data: { is_team_member: true } });
    script("board_members", { error: null });
    await addBlocker("card-1", "Waiting", null, "eight-edges");
    await addBlocker("card-1", "Waiting", "person-1", "eight-edges");
    expect(published).toEqual([]);
  });

  it("states it when the tag moves to someone new, and not when it stays", async () => {
    resetFake();
    published.length = 0;
    row.value = { board_id: "b-1", parent_task_id: "card-1", title: "Waiting on the key", assignee_id: "person-3" };
    script("tasks", { error: null }, { data: { title: "Ship it" } }, { error: null });
    script("people", { data: { is_team_member: true } });
    script("board_members", { error: null });
    await setBlockerAssignee("bl-1", "person-2", "eight-edges");
    await setBlockerAssignee("bl-1", "person-3", "eight-edges");
    expect(published.map(([name, p]) => [name, p.assigneeId, p.title])).toEqual([["board.blocker.handed", "person-2", "Ship it"]]);
  });
});

// Khoa, 2026-10-19: a client contact tag stays attribution, never access.
describe("who a blocker tag brings onto the board", () => {
  it("leaves a client contact off the board, and still tells the inbox", async () => {
    resetFake();
    published.length = 0;
    row.value = { board_id: "b-1", title: "Ship it" };
    script("tasks", { data: { id: "bl-4" } });
    script("people", { data: { is_team_member: false } });
    expect(await addBlocker("card-1", "Waiting on the client", "contact-1", "eight-edges")).toEqual({ ok: true });
    expect(calls.some((c) => c.table === "board_members")).toBe(false);
    expect(published.map(([name]) => name)).toEqual(["board.blocker.handed"]);
  });

  it("says the blocker was saved when the teammate could not be added", async () => {
    resetFake();
    row.value = { board_id: "b-1", title: "Ship it" };
    script("tasks", { data: { id: "bl-5" } });
    script("people", { data: { is_team_member: true } });
    script("board_members", { error: { message: "board_members locked" } });
    const r = await addBlocker("card-1", "Waiting", "person-2", "eight-edges");
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/^Blocker saved, but .*board_members locked$/) });
  });
});
