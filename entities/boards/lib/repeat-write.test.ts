import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// The successor a repeating card leaves behind (W.59), and the twin-write the
// workboard-cards audit looks for: two people closing the same card within
// seconds must produce ONE next instance.

vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { createRepeatSuccessor } = await import("./repeat-write");

const card = (metadata: Record<string, unknown>, due_date: string | null = "2026-09-21") => ({
  id: "task-1",
  board_id: "board-1",
  title: "Weekly client report",
  description: "Send it Monday.",
  priority: "p2",
  assignee_id: "person-2",
  epic_id: "epic-1",
  sprint_id: "sprint-1",
  human_tokens: 0.5,
  internal: false,
  due_date,
  metadata,
});

const REPEATS = { repeat: { every: "week" } };

// endPosition's fallback read, then the insert. The existence check comes
// first, so a script starts with it.
function scriptSuccessor({ existing }: { existing: unknown[] }) {
  script("tasks", { data: existing }, { data: null }, { data: { id: "task-2" } });
  script("task_stage_log", { error: null });
}

beforeEach(resetFake);
afterEach(() => vi.clearAllMocks());

describe("createRepeatSuccessor", () => {
  it("does nothing at all for a card that does not repeat", async () => {
    expect(await createRepeatSuccessor(card({}), "col-a", "person-1")).toBeNull();
    // Not one query: the pure rule answers before the database is touched.
    expect(calls).toHaveLength(0);
  });

  it("creates the next instance, dated forward, carrying the repeat", async () => {
    scriptSuccessor({ existing: [] });
    expect(await createRepeatSuccessor(card(REPEATS), "col-a", "person-1")).toBeNull();
    const insert = calls.find((c) => c.table === "tasks" && c.ops.includes("insert"));
    expect(insert?.payloads[0]).toEqual(
      expect.objectContaining({
        board_id: "board-1",
        board_column_id: "col-a",
        title: "Weekly client report",
        due_date: "2026-09-28",
        status: "open",
        // The repeat travels with the card, so the series continues without
        // anybody re-arming it; repeat_of is what the guard below reads.
        metadata: { repeat: { every: "week", until: null }, repeat_of: "task-1" },
      }),
    );
  });

  it("writes a create row, because the Flow view reads the log and a card without one has no age", async () => {
    scriptSuccessor({ existing: [] });
    await createRepeatSuccessor(card(REPEATS), "col-a", "person-1");
    const log = calls.find((c) => c.table === "task_stage_log");
    expect(log?.payloads[0]).toEqual(
      expect.objectContaining({ task_id: "task-2", from_column_id: null, to_column_id: "col-a", kind: "create" }),
    );
  });

  it("CLOSING THE CARD TWICE produces exactly one successor", async () => {
    // First close: nothing exists yet, so one is created.
    scriptSuccessor({ existing: [] });
    expect(await createRepeatSuccessor(card(REPEATS), "col-a", "person-1")).toBeNull();
    expect(calls.filter((c) => c.table === "tasks" && c.ops.includes("insert"))).toHaveLength(1);

    // Second close, seconds later: the guard finds the instance that exists
    // and writes nothing. The question asked is "does the next instance
    // exist?", not "did we make one recently?" — a timestamp is exactly the
    // guard a race defeats.
    resetFake();
    script("tasks", { data: [{ id: "task-2" }] });
    expect(await createRepeatSuccessor(card(REPEATS), "col-a", "person-1")).toBeNull();
    expect(calls.filter((c) => c.ops.includes("insert"))).toHaveLength(0);
    expect(calls.filter((c) => c.table === "task_stage_log")).toHaveLength(0);
  });

  it("the guard asks by repeat_of, not by a timestamp", async () => {
    script("tasks", { data: [{ id: "task-2" }] });
    await createRepeatSuccessor(card(REPEATS), "col-a", "person-1");
    expect(calls[0].filters).toContainEqual(["eq", "metadata->>repeat_of", "task-1"]);
  });

  it("a failed existence check creates nothing and says so", async () => {
    // A second copy of a recurring card is worse than a missing one: the
    // missing one is a click to create, the duplicate has to be found first.
    script("tasks", { error: { message: "read timeout" } });
    const message = await createRepeatSuccessor(card(REPEATS), "col-a", "person-1");
    expect(message).toContain("read timeout");
    expect(calls.filter((c) => c.ops.includes("insert"))).toHaveLength(0);
  });

  it("stops at the end of the series", async () => {
    expect(await createRepeatSuccessor(card({ repeat: { every: "week", until: "2026-09-22" } }), "col-a", "person-1")).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("reports a failed insert without pretending the card did not land", async () => {
    script("tasks", { data: [] }, { data: null }, { error: { message: "tasks locked" } });
    expect(await createRepeatSuccessor(card(REPEATS), "col-a", "person-1")).toContain("tasks locked");
  });
});
