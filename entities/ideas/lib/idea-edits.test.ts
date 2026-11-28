import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// editIdeaInScope carries the rule team's funnel applied until A.88.6
// (teamUpdateInScope): a spark is edited only when its author is in the
// actor's person scope, re-read right before the write. These prove a caller
// cannot drop that scope by handing in someone else's id, and that a failed
// ownership read refuses instead of writing (ADR 0025 decision 5).
vi.mock("@/kernel/data/supabase", () => fakeSupabase());

const { editIdeaInScope } = await import("./idea-edits");

const actor = { personScope: ["me", "my-report"] };
const writes = () => calls.filter((c) => c.table === "ideas" && c.ops.includes("update"));

beforeEach(() => resetFake());

describe("editIdeaInScope", () => {
  it("writes a spark whose author is in the actor's scope", async () => {
    script("ideas", { data: { person_id: "my-report" } }, { data: null });
    await expect(editIdeaInScope(actor, "i1", { status: "archived" })).resolves.toEqual({ ok: true, error: null });
    expect(writes()).toHaveLength(1);
    expect(writes()[0].payloads).toEqual([{ status: "archived" }]);
  });

  it("refuses someone else's spark without writing", async () => {
    script("ideas", { data: { person_id: "stranger" } });
    await expect(editIdeaInScope(actor, "i1", { status: "archived" })).resolves.toEqual({ ok: false, error: "Not found." });
    expect(writes()).toEqual([]);
  });

  it("refuses a spark that does not exist without writing", async () => {
    script("ideas", { data: null });
    await expect(editIdeaInScope(actor, "missing", { status: "archived" })).resolves.toEqual({ ok: false, error: "Not found." });
    expect(writes()).toEqual([]);
  });

  it("refuses when the ownership read fails: an unknown owner is not permission", async () => {
    script("ideas", { data: null, error: { message: "timeout" } });
    await expect(editIdeaInScope(actor, "i1", { status: "archived" })).resolves.toEqual({ ok: false, error: "timeout" });
    expect(writes()).toEqual([]);
  });
});
