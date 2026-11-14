import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// What a goal write refuses, against a scripted Supabase client. The fake is
// the one from entities/coaching/lib/cycle.test.ts (the repo copies it per
// suite): every table carries a queue of responses consumed one per awaited
// query, and every call is recorded so a test can assert what was NOT written.
//
// K.13 added these: the three goal editors collapsed into one form, and
// validation, the ownership gate and the ladder round-trip had no test at all.

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (t: string) => builderFor(t) } }));

import { ladderValue, parseLadder } from "../ladder";
import { ladderColumns } from "./shared";
import { goalColumns, myUpdateGoal, validateGoal, type MyGoalInput } from "./my-goals";
import type { TeamActor } from "@/kernel/identity/team-auth";
import type { EdgesLadder } from "../types";

const actor = { teamMemberId: "tm-1" } as TeamActor;

const input = (over: Partial<MyGoalInput> = {}): MyGoalInput => ({
  title: "Cut days to hire to under 20 by 30 September",
  ladder: { kind: "key_result", id: "kr-1" },
  descriptionMarkdown: null,
  status: "active",
  quarterLabel: "2026-Q3",
  metricUnit: "days",
  startValue: 34,
  targetValue: 20,
  currentValue: 28,
  dueDate: "2026-09-30",
  stretchMarkdown: "Ten days",
  ...over,
});

beforeEach(() => {
  resetFake();
});

describe("validateGoal", () => {
  it("accepts a complete goal", () => {
    expect(validateGoal(input())).toBeNull();
  });

  it("needs a title, and a short one", () => {
    expect(validateGoal(input({ title: "   " }))).toBe("Write the goal first.");
    expect(validateGoal(input({ title: "x".repeat(201) }))).toBe("Keep the goal title under 200 characters.");
  });

  it("needs a ladder: 'stands on its own' is no longer a goal", () => {
    expect(validateGoal(input({ ladder: { kind: "none" } }))).toBe(
      "Pick the company goal this ladders up to.",
    );
  });

  it("rejects a non-numeric measure and a malformed date", () => {
    expect(validateGoal(input({ targetValue: Number("twenty") }))).toBe(
      "The measure values need to be numbers.",
    );
    expect(validateGoal(input({ dueDate: "30/09/2026" }))).toBe("Pick a valid due date.");
    // A blank date is fine; only a malformed one is not.
    expect(validateGoal(input({ dueDate: null }))).toBeNull();
  });

  it("rejects an unknown status", () => {
    expect(validateGoal(input({ status: "parked" as MyGoalInput["status"] }))).toBe("Bad status.");
  });
});

describe("the ladder round-trip", () => {
  it("survives picker value -> LadderInput -> columns", () => {
    const ladder: EdgesLadder = { kind: "key_result", id: "kr-7", label: "Ship the portal" };
    expect(ladderValue(ladder)).toBe("key_result:kr-7");
    expect(parseLadder(ladderValue(ladder))).toEqual({ kind: "key_result", id: "kr-7" });
    expect(ladderColumns(parseLadder(ladderValue(ladder)))).toEqual({
      objective_id: null,
      key_result_id: "kr-7",
    });
  });

  it("keeps an objective on the objective column", () => {
    expect(ladderColumns(parseLadder("objective:o-2"))).toEqual({
      objective_id: "o-2",
      key_result_id: null,
    });
  });

  it("clears both columns for no ladder, and ignores a malformed value", () => {
    expect(ladderColumns(parseLadder(""))).toEqual({ objective_id: null, key_result_id: null });
    expect(parseLadder("something:")).toEqual({ kind: "none" });
  });

  it("writes the stretch answer and drops a blank one", () => {
    expect(goalColumns(input()).stretch_markdown).toBe("Ten days");
    expect(goalColumns(input({ stretchMarkdown: "  " })).stretch_markdown).toBeNull();
  });
});

describe("goalOwnership, through myUpdateGoal", () => {
  const goalOn = (teamMemberId: string) => ({
    id: "g-1",
    created_by: teamMemberId,
    coaching_profiles: { team_member_id: teamMemberId },
  });
  const updates = () => calls.filter((c) => c.table === "goals" && c.ops.includes("update"));

  it("refuses a goal on someone else's profile, and writes nothing", async () => {
    script("goals", { data: goalOn("tm-2") });
    const res = await myUpdateGoal(actor, "g-1", input());
    expect(res).toEqual({ ok: false, error: "Not found." });
    expect(updates()).toEqual([]);
  });

  it("refuses a goal id that finds nothing", async () => {
    script("goals", { data: null });
    expect(await myUpdateGoal(actor, "g-404", input())).toEqual({ ok: false, error: "Not found." });
    expect(updates()).toEqual([]);
  });

  it("refuses an empty goal id without asking the database", async () => {
    expect(await myUpdateGoal(actor, "", input())).toEqual({ ok: false, error: "Not found." });
    expect(calls).toEqual([]);
  });

  it("allows a goal on the actor's own profile, even one their coach wrote", async () => {
    script("goals", { data: goalOn("tm-1") }, { data: null, error: null });
    expect(await myUpdateGoal(actor, "g-1", input())).toEqual({ ok: true });
    expect(updates()).toHaveLength(1);
  });

  it("validates only after ownership, so a forged id learns nothing", async () => {
    script("goals", { data: goalOn("tm-2") });
    expect(await myUpdateGoal(actor, "g-1", input({ title: "" }))).toEqual({
      ok: false,
      error: "Not found.",
    });
  });
});
