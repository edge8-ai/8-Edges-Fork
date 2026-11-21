import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// TR.12: the weekly goal is the member's own. The read and the write name only
// the person id they are given (the page and the action pass the signed-in
// member's), the write takes no person from its input, and a failed read
// raises rather than reading as "no goal".
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
beforeEach(() => resetFake());
afterEach(() => vi.clearAllMocks());

const ME = "11111111-1111-4111-8111-111111111111";
const goalCalls = () => calls.filter((c) => c.table === "training_weekly_goals");
const filtersOf = (c: { filters: [string, ...unknown[]][] }) => c.filters.map((f) => f.join(":"));

describe("reading the goal", () => {
  it("reads only the member's own row", async () => {
    const { myWeeklyGoal } = await import("./weekly-goal");
    script("training_weekly_goals", { data: [{ weekly_minutes: 150 }] });
    expect(await myWeeklyGoal(ME)).toBe(150);
    expect(filtersOf(goalCalls()[0])).toEqual([`eq:person_id:${ME}`]);
  });

  it("is no goal when the member has none, or cleared it", async () => {
    const { myWeeklyGoal } = await import("./weekly-goal");
    script("training_weekly_goals", { data: [] });
    expect(await myWeeklyGoal(ME)).toBeNull();
    script("training_weekly_goals", { data: [{ weekly_minutes: null }] });
    expect(await myWeeklyGoal(ME)).toBeNull();
  });

  it("raises when the read fails, rather than reading as no goal", async () => {
    const { myWeeklyGoal } = await import("./weekly-goal");
    script("training_weekly_goals", { data: null, error: { message: "boom" } });
    await expect(myWeeklyGoal(ME)).rejects.toThrow();
  });
});

describe("setting the goal", () => {
  it("writes the member's own row, keyed on them", async () => {
    const { setWeeklyGoal } = await import("./weekly-goal");
    script("training_weekly_goals", { data: null });
    expect(await setWeeklyGoal(ME, { minutes: 90 })).toEqual({ ok: true });
    expect(goalCalls()[0].payloads[0]).toEqual({ person_id: ME, weekly_minutes: 90 });
    expect(goalCalls()[0].ops[0]).toBe("upsert");
    expect(goalCalls()[0].options[0]).toEqual({ onConflict: "person_id" });
  });

  it("clears it with a null, never a delete", async () => {
    const { setWeeklyGoal } = await import("./weekly-goal");
    script("training_weekly_goals", { data: null });
    expect(await setWeeklyGoal(ME, { minutes: null })).toEqual({ ok: true });
    expect(goalCalls()[0].payloads[0]).toEqual({ person_id: ME, weekly_minutes: null });
    expect(goalCalls().filter((c) => c.ops[0] === "delete")).toHaveLength(0);
  });

  it("takes minutes only, within the table's own limits", async () => {
    const { GoalInput } = await import("./weekly-goal");
    expect(GoalInput.safeParse({ minutes: 60 }).success).toBe(true);
    expect(GoalInput.safeParse({ minutes: null }).success).toBe(true);
    expect(GoalInput.safeParse({ minutes: 10 }).success).toBe(false);
    expect(GoalInput.safeParse({ minutes: 1201 }).success).toBe(false);
    expect(GoalInput.safeParse({ minutes: 62.5 }).success).toBe(false);
    expect(GoalInput.safeParse({ minutes: "60" }).success).toBe(false);
    // A person in the input is dropped: the action passes the signed-in member's own id.
    expect(GoalInput.parse({ minutes: 60, person_id: "someone-else" })).toEqual({ minutes: 60 });
  });
});
