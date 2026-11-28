import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// editOnboardingTaskInScope carries the rule team's funnel applied until A.88.6
// (teamUpdateInScope): a task is edited only when it belongs to someone in the
// actor's team scope, re-read right before the write. These prove a caller
// cannot drop that scope by handing in someone else's task id, and that a
// failed ownership read refuses instead of writing (ADR 0025 decision 5).
vi.mock("@/kernel/data/supabase", () => fakeSupabase());

const { editOnboardingTaskInScope } = await import("./plan-progress");

const actor = { teamMemberScope: ["tm-me", "tm-report"] };
const writes = () => calls.filter((c) => c.table === "onboarding_tasks" && c.ops.includes("update"));
const done = { status: "done" as const };

beforeEach(() => resetFake());

describe("editOnboardingTaskInScope", () => {
  it("writes a task that belongs to someone in the actor's scope", async () => {
    script("onboarding_tasks", { data: { team_member_id: "tm-me" } }, { data: null });
    await expect(editOnboardingTaskInScope(actor, "t1", done)).resolves.toEqual({ ok: true, error: null });
    expect(writes()).toHaveLength(1);
    expect(writes()[0].payloads).toEqual([done]);
  });

  it("refuses someone else's task without writing", async () => {
    script("onboarding_tasks", { data: { team_member_id: "tm-stranger" } });
    await expect(editOnboardingTaskInScope(actor, "t1", done)).resolves.toEqual({ ok: false, error: "Not found." });
    expect(writes()).toEqual([]);
  });

  it("refuses a task that does not exist without writing", async () => {
    script("onboarding_tasks", { data: null });
    await expect(editOnboardingTaskInScope(actor, "missing", done)).resolves.toEqual({ ok: false, error: "Not found." });
    expect(writes()).toEqual([]);
  });

  it("refuses when the ownership read fails: an unknown owner is not permission", async () => {
    script("onboarding_tasks", { data: null, error: { message: "timeout" } });
    await expect(editOnboardingTaskInScope(actor, "t1", done)).resolves.toEqual({ ok: false, error: "timeout" });
    expect(writes()).toEqual([]);
  });
});
