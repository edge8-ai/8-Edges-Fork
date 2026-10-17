import { describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// W.139: "resolve the blockers naming this card" is documented as resolving
// every OPEN blocker. It filtered on "not done", which also caught a blocker
// closed with its card in Not Doing and stamped it finished, with a date.

vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("./mutation", () => ({
  boardMutation: vi.fn(async () => ({ ok: true, actor: { label: "tester", personId: "person-1", isAdmin: true }, row: {} })),
}));

const { resolveBlockersNaming } = await import("./blocker-actions");

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
