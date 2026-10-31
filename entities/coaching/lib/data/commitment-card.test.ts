import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// "Add to Workboard" from either side of a commitment (A.53). The birth is
// bearCard's and is tested beside it; what is pinned here is what the two
// pushes used to disagree on: a failed duplicate check refuses rather than
// carding the promise twice, both sides land in the open sprint, and the card
// is the right person's.

vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const boards = vi.hoisted(() => ({
  pickable: [] as { id: string; slug: string; name: string; columnId: string; sprintId: string | null }[],
  births: [] as { card: Record<string, unknown>; actor: { personId: string | null } }[],
  sprints: [] as [string, string, string][],
}));
vi.mock("@/entities/boards", async () => ({
  // boards' real questions (card-lookups.test.ts and board-directory.test.ts
  // pin their queries), reading the fake client this file mocks.
  ...(await vi.importActual<Record<string, unknown>>("@/entities/boards/lib/card-lookups")),
  ...(await vi.importActual<Record<string, unknown>>("@/entities/boards/lib/board-directory")),
  SUBJECT_COMMITMENT: "coaching_commitment",
  pickableBoards: async () => boards.pickable,
  bearCard: async (b: { card: Record<string, unknown>; actor: { personId: string | null } }) => {
    boards.births.push(b);
    return { ok: true, id: "task-new" };
  },
  setCardSprint: async (taskId: string, sprintId: string, slug: string) => {
    boards.sprints.push([taskId, sprintId, slug]);
    return { ok: true };
  },
}));

const { pushCommitmentCard } = await import("./commitment-card");

const actor = (isAdmin = false) => ({ personId: "person-coach", teamMemberId: "tm-coach", displayName: "Coach", isAdmin }) as unknown as Parameters<typeof pushCommitmentCard>[0]["actor"];
const commitment = (owner: "coach" | "member") => ({ id: "commit-1", title: "Ship the pilot", dueOn: "2026-10-20", owner, profileId: "profile-1" });
const BOARD = { id: "board-1", slug: "delivery", name: "Delivery", columnId: "col-todo", sprintId: "sprint-1" };

beforeEach(() => {
  resetFake();
  boards.pickable = [BOARD];
  boards.births.length = 0;
  boards.sprints.length = 0;
});

describe("pushCommitmentCard", () => {
  it("refuses when the duplicate check fails, rather than carding the promise twice", async () => {
    script("tasks", { error: { message: "read timeout" } });
    const r = await pushCommitmentCard({ side: "coach", actor: actor(), commitment: commitment("member"), boardId: "board-1" });
    expect(r).toEqual({ ok: false, error: "Could not check the Workboard." });
    expect(boards.births).toEqual([]);
  });

  it("is the answer already when a live card links the promise", async () => {
    script("tasks", { data: [{ id: "task-old" }] });
    expect(await pushCommitmentCard({ side: "member", actor: actor(), commitment: commitment("member"), boardId: "board-1" })).toEqual({ ok: true });
    expect(boards.births).toEqual([]);
  });

  it("from the coach's side, cards a member commitment for the coached person, in the open sprint", async () => {
    script("tasks", { data: [] });
    script("coaching_profiles", { data: { team_member_id: "tm-member", coach_id: "tm-coach" } });
    script("team_members", { data: { person_id: "person-member" } });
    const r = await pushCommitmentCard({ side: "coach", actor: actor(), commitment: commitment("member"), boardId: "board-1" });
    expect(r).toEqual({ ok: true, created: { taskId: "task-new", assigneeId: "person-member", title: "Ship the pilot" }, note: null });
    expect(boards.births[0].card).toMatchObject({ board_id: "board-1", board_column_id: "col-todo", assignee_id: "person-member", due_date: "2026-10-20", subject_id: "commit-1" });
    expect(boards.births[0].actor.personId).toBe("person-coach");
    expect(boards.sprints).toEqual([["task-new", "sprint-1", "delivery"]]);
  });

  it("from the member's side, cards the promise for the member without reading the profile", async () => {
    script("tasks", { data: [] });
    const r = await pushCommitmentCard({ side: "member", actor: actor(), commitment: commitment("member"), boardId: "board-1" });
    expect(r.ok).toBe(true);
    expect(boards.births[0].card.assignee_id).toBe("person-coach");
    expect(calls.some((c) => c.table === "coaching_profiles")).toBe(false);
  });

  it("refuses a board the member does not work on", async () => {
    const r = await pushCommitmentCard({ side: "member", actor: actor(true), commitment: commitment("member"), boardId: "board-other" });
    expect(r).toEqual({ ok: false, error: "You are not a member of that board." });
  });

  it("honours an admin coach's pick of a board they are not on, outside any sprint", async () => {
    script("boards", { data: { id: "board-other", slug: "client", name: "Client" } });
    script("board_columns", { data: { id: "col-first" } });
    script("tasks", { data: [] });
    script("coaching_profiles", { data: { team_member_id: "tm-member", coach_id: "tm-coach" } });
    script("team_members", { data: { person_id: "person-coach" } });
    const r = await pushCommitmentCard({ side: "coach", actor: actor(true), commitment: commitment("coach"), boardId: "board-other" });
    expect(r.ok).toBe(true);
    expect(boards.births[0].card).toMatchObject({ board_id: "board-other", board_column_id: "col-first", assignee_id: "person-coach" });
    expect(boards.sprints).toEqual([]);
  });

  it("does not card a promise whose assignee could not be read", async () => {
    script("tasks", { data: [] });
    script("coaching_profiles", { error: { message: "read timeout" } });
    const r = await pushCommitmentCard({ side: "coach", actor: actor(), commitment: commitment("member"), boardId: "board-1" });
    expect(r).toEqual({ ok: false, error: "Could not read who the card is for." });
    expect(boards.births).toEqual([]);
  });
});
