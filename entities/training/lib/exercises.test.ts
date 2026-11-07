import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// The library (English Program PR 2): the filters as pure functions, and a
// confirm that writes exactly the rows handed to it.

vi.mock("@/kernel/data/supabase", () => fakeSupabase());
beforeEach(() => resetFake());
afterEach(() => vi.clearAllMocks());

const ex = (over: Partial<import("./exercise-rules").Exercise>): import("./exercise-rules").Exercise => ({
  id: "x",
  title: "End consonants drill",
  side: "presentation",
  skills: ["pronunciation"],
  format: "drill",
  minutesMin: 10,
  minutesMax: 15,
  instructions: null,
  materialsUrl: null,
  homeworkAble: false,
  planId: null,
  archived: false,
  ...over,
});

describe("filterExercises", () => {
  it("matches on side, skill, format and a search over title, skills and instructions; blank filters match all", async () => {
    const { filterExercises, facets } = await import("./exercises");
    const rows = [ex({ id: "a" }), ex({ id: "b", title: "Vague instruction, ask back", side: "reactive", skills: ["clarifying questions"], format: "roleplay", instructions: "Give an unclear brief." })];
    expect(filterExercises(rows, {}).map((e) => e.id)).toEqual(["a", "b"]);
    expect(filterExercises(rows, { side: "reactive" }).map((e) => e.id)).toEqual(["b"]);
    expect(filterExercises(rows, { skill: "Pronunciation" }).map((e) => e.id)).toEqual(["a"]);
    expect(filterExercises(rows, { format: "Roleplay" }).map((e) => e.id)).toEqual(["b"]);
    expect(filterExercises(rows, { q: "unclear" }).map((e) => e.id)).toEqual(["b"]);
    expect(filterExercises(rows, { side: "reactive", q: "consonant" })).toEqual([]);
    expect(facets(rows)).toEqual({ skills: ["clarifying questions", "pronunciation"], formats: ["drill", "roleplay"] });
  });
});

describe("ExerciseInput", () => {
  it("lower-cases and dedupes skills, blanks to null, and refuses a longest time below the shortest", async () => {
    const { ExerciseInput } = await import("./exercises");
    const ok = ExerciseInput.safeParse({ title: "x", side: "reactive", skills: ["Pron", "pron"], format: "", minutesMin: 5, minutesMax: 5, instructions: "", materialsUrl: "", homeworkAble: true, planId: null });
    expect(ok.success && ok.data).toMatchObject({ skills: ["pron"], format: null, instructions: null, materialsUrl: null });
    expect(ExerciseInput.safeParse({ title: "x", side: "reactive", skills: [], format: "", minutesMin: 15, minutesMax: 10, instructions: "", materialsUrl: "", homeworkAble: false, planId: null }).success).toBe(false);
  });
});

describe("confirmExerciseDrafts", () => {
  it("inserts exactly the rows it is given, with who added them", async () => {
    const { confirmExerciseDrafts, ExerciseInput } = await import("./exercises");
    const a = ExerciseInput.parse({ title: "A", side: "presentation", skills: ["x"], format: "drill", minutesMin: 5, minutesMax: 10, instructions: "", materialsUrl: "", homeworkAble: false, planId: null });
    const b = ExerciseInput.parse({ title: "B", side: "reactive", skills: [], format: "", minutesMin: 5, minutesMax: 5, instructions: "Go", materialsUrl: "", homeworkAble: true, planId: "8d06e46e-f4ea-4879-b2f7-2f168c0be03b" });
    script("training_exercises", { data: null });
    expect(await confirmExerciseDrafts("hoan", [a, b])).toEqual({ ok: true, added: 2 });
    const insert = calls.find((c) => c.table === "training_exercises" && c.ops.includes("insert"));
    expect(insert?.payloads[0]).toEqual([
      { title: "A", side: "presentation", skills: ["x"], format: "drill", minutes_min: 5, minutes_max: 10, instructions: null, materials_url: null, homework_able: false, plan_id: null, created_by: "hoan" },
      { title: "B", side: "reactive", skills: [], format: null, minutes_min: 5, minutes_max: 5, instructions: "Go", materials_url: null, homework_able: true, plan_id: "8d06e46e-f4ea-4879-b2f7-2f168c0be03b", created_by: "hoan" },
    ]);
  });
});
