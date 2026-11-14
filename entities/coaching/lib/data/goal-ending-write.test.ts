import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// K.83: a goal's ending, written by its owner once its date has passed. The
// writer is the one place the rules hold, whatever a stale page sends: the goal
// must be the actor's, it must really have ended, and each answer writes only
// its own columns. Today is pinned so "ended" does not depend on the run date.

const audits: unknown[] = [];
vi.mock("@/kernel/data/supabase", async () => {
  const { builderFor } = await import("@/kernel/data/testing/fake-company-os");
  return { companyOs: { from: (t: string) => builderFor(t) } };
});
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: async (row: unknown) => void audits.push(row) }));
vi.mock("@/kernel/config/dates", async () => ({
  ...(await vi.importActual<object>("@/kernel/config/dates")),
  saigonToday: () => "2026-10-11",
}));

const { myEndGoal } = await import("./my-goals");
import type { TeamActor } from "@/kernel/identity/team-auth";

const actor = { teamMemberId: "tm-1", email: "owner@example.test" } as TeamActor;
const mine = { id: "g-1", created_by: "tm-1", coaching_profiles: { team_member_id: "tm-1" } };
const row = (over: Record<string, unknown> = {}) => ({ status: "active", due_date: "2026-09-30", current_value: 19, ...over });
const updates = () => calls.filter((c) => c.table === "goals" && c.ops.includes("update"));

beforeEach(() => {
  resetFake();
  audits.length = 0;
});

describe("myEndGoal refuses", () => {
  it("a goal on someone else's profile, and writes nothing", async () => {
    script("goals", { data: { ...mine, coaching_profiles: { team_member_id: "tm-2" } } });
    expect(await myEndGoal(actor, "g-1", { kind: "missed", note: "Slipped" })).toEqual({ ok: false, error: "Not found." });
    expect(updates()).toEqual([]);
  });

  it("a goal still running, or one that already has an ending", async () => {
    script("goals", { data: mine }, { data: row({ due_date: "2026-10-31" }) });
    expect((await myEndGoal(actor, "g-1", { kind: "landed", finalValue: 20 })).ok).toBe(false);
    script("goals", { data: mine }, { data: row({ status: "achieved" }) });
    expect((await myEndGoal(actor, "g-1", { kind: "missed", note: "Slipped" })).ok).toBe(false);
    expect(updates()).toEqual([]);
  });

  it("a blank or overlong line, and an extension that is not after today", async () => {
    script("goals", { data: mine }, { data: row() });
    expect((await myEndGoal(actor, "g-1", { kind: "missed", note: "   " })).ok).toBe(false);
    script("goals", { data: mine }, { data: row() });
    expect((await myEndGoal(actor, "g-1", { kind: "missed", note: "x".repeat(201) })).ok).toBe(false);
    script("goals", { data: mine }, { data: row() });
    expect((await myEndGoal(actor, "g-1", { kind: "extended", dueDate: "2026-10-11" })).ok).toBe(false);
    expect(updates()).toEqual([]);
  });
});

describe("myEndGoal records", () => {
  const written = () => updates()[0]?.payloads[0] as Record<string, unknown>;

  it("Landed as achieved, with the final number and the moment", async () => {
    script("goals", { data: mine }, { data: row() }, { data: null, error: null });
    expect(await myEndGoal(actor, "g-1", { kind: "landed", finalValue: 21 })).toEqual({ ok: true });
    expect(written()).toMatchObject({ status: "achieved", current_value: 21 });
    expect(written().outcome_at).toEqual(expect.any(String));
  });

  it("Missed with its line, trimmed", async () => {
    script("goals", { data: mine }, { data: row() }, { data: null, error: null });
    expect(await myEndGoal(actor, "g-1", { kind: "missed", note: "  Launch slipped to November " })).toEqual({ ok: true });
    expect(written()).toMatchObject({ status: "missed", outcome_note: "Launch slipped to November" });
  });

  it("Extend as a new date, keeping the one it replaced, and the goal still active", async () => {
    script("goals", { data: mine }, { data: row() }, { data: null, error: null });
    expect(await myEndGoal(actor, "g-1", { kind: "extended", dueDate: "2026-10-31" })).toEqual({ ok: true });
    expect(written()).toMatchObject({ due_date: "2026-10-31", extended_from: "2026-09-30" });
    expect(written()).not.toHaveProperty("status");
  });

  it("only on a goal still active, so two pages cannot both end it", async () => {
    script("goals", { data: mine }, { data: row() }, { data: null, error: null });
    await myEndGoal(actor, "g-1", { kind: "missed", note: "Slipped" });
    expect(updates()[0].filters).toContainEqual(["eq", "status", "active"]);
  });

  it("an audit row under its own name, which the bump caption does not count", async () => {
    script("goals", { data: mine }, { data: row() }, { data: null, error: null });
    await myEndGoal(actor, "g-1", { kind: "missed", note: "Slipped" });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ table: "goal_endings", recordId: "g-1" });
  });
});
