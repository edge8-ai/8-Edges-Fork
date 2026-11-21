import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// W.194. A tick is answered as soon as it has landed and been audited; the
// announcement to its listeners (the inbox, the content calendar) runs after
// the response. Before this, the action awaited every listener, and the box in
// the drawer could not change until the inbox had finished its reads.

const { deferred, publish } = vi.hoisted(() => ({
  deferred: [] as (() => Promise<void>)[],
  publish: vi.fn(async (..._args: unknown[]) => undefined),
}));
vi.mock("next/server", () => ({ after: (task: () => Promise<void>) => void deferred.push(task) }));
vi.mock("@/kernel/events", () => ({ publish }));
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("@/entities/boards/lib/access", () => ({
  boardActorFor: vi.fn(async () => ({ label: "tester", personId: "person-1", isAdmin: true })),
}));
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: vi.fn(async () => undefined) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), unstable_cache: <T,>(fn: T) => fn }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  cache: <T,>(fn: T) => fn,
}));

beforeEach(() => {
  resetFake();
  deferred.length = 0;
});
afterEach(() => vi.clearAllMocks());

describe("toggleSubtask (W.194)", () => {
  it("answers before the listeners hear of the tick, and they hear of it afterwards", async () => {
    script(
      "tasks",
      { data: { id: "sub-1", board_id: "board-1", title: "Seen in a browser", parent_task_id: "card-1", subject_type: null, subject_id: null } },
      { error: null },
      { data: { title: "Content card", assignee_id: "person-2" } },
    );
    const { toggleSubtask } = await import("./actions");

    expect(await toggleSubtask("sub-1", true, "eight-edges")).toEqual({ ok: true });
    expect(publish).not.toHaveBeenCalled();
    expect(deferred).toHaveLength(1);

    await deferred[0]();
    expect(publish).toHaveBeenCalledWith(
      "board.subtask.toggled",
      expect.objectContaining({ subtaskId: "sub-1", done: true, parentTaskId: "card-1", assigneeId: "person-2", parentTitle: "Content card" }),
    );
  });

  it("announces nothing when the tick never landed", async () => {
    script("tasks", { data: { id: "sub-1", board_id: "board-1", title: "x", parent_task_id: null, subject_type: null, subject_id: null } }, { error: { message: "write refused" } });
    const { toggleSubtask } = await import("./actions");

    const r = await toggleSubtask("sub-1", true, "eight-edges");
    expect(r.ok).toBe(false);
    expect(deferred).toHaveLength(0);
  });
});
