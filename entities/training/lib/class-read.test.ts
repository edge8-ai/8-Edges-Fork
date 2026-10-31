import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// The Admin view's class reads (ADR 0016, amended 2026-10-26): one row per
// class on a live course, in date order; one class with its attendees, lesson
// plan, recap and each learner's evaluation and feedback. Neither carries a
// review, a skip reason, a submission or a teacher's note.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
beforeEach(() => resetFake());
afterEach(() => vi.clearAllMocks());

const { classRead, classesRead, lessonPlanOf } = await import("./class-read");

const NOW = new Date("2026-10-20T00:00:00Z");
const person = (full: string) => ({ display_name: null, preferred_name: null, full_name: full, email: null });
const DUC = "11111111-1111-4111-8111-111111111111";
const AN = "22222222-2222-4222-8222-222222222222";
const RHYTHM = { weekdays: [2, 4], start: "14:00", end: "15:15" };

describe("classesRead", () => {
  it("lists classes of live courses in date order, with their course, plan, recap and counts", async () => {
    script("training_plans", { data: [{ id: "c1", title: "English Communication Practice", open_to_learners: true, rhythm: RHYTHM }, { id: "c2", title: "English 1-1: Đức", open_to_learners: false, rhythm: null }] });
    script("trainings", {
      data: [
        { id: "t1", plan_id: "c1", title: "ECP", starts_at: "2026-10-14T07:00:00Z", ends_at: "2026-10-14T08:15:00Z", cancelled_at: null, plan_state: "checked", recap_state: "published", attendance: [{ status: "attended", removed_at: null }, { status: "absent", removed_at: null }, { status: "attended", removed_at: "2026-10-13T00:00:00Z" }], blocks: [{ id: "b1" }] },
        { id: "t2", plan_id: "c2", title: "1-1", starts_at: "2026-10-28T07:00:00Z", ends_at: "2026-10-28T08:00:00Z", cancelled_at: null, plan_state: "none", recap_state: "none", attendance: [{ status: "pending", removed_at: null }], blocks: [] },
      ],
    });
    const rows = await classesRead(NOW);
    // Archived courses are never read, so neither are their classes.
    expect(calls.find((c) => c.table === "training_plans")?.filters).toContainEqual(["is", "archived_at", null]);
    expect(rows.map((r) => r.id)).toEqual(["t1", "t2"]);
    expect(rows[0]).toMatchObject({ held: true, courseTitle: "English Communication Practice", courseOpen: true, lessonPlan: "checked", recapState: "published", attended: 1, registered: 2 });
    expect(rows[0]!.courseRhythm).toContain("14:00");
    expect(rows[1]).toMatchObject({ held: false, courseOpen: false, courseRhythm: "No rhythm set", lessonPlan: "none", attended: 0, registered: 1 });
  });

  it("reads no classes when there is no live course", async () => {
    script("training_plans", { data: [] });
    expect(await classesRead(NOW)).toEqual([]);
    expect(calls.filter((c) => c.table === "trainings")).toEqual([]);
  });

  it("says No plan only while there are no blocks and nothing drafted", () => {
    expect(lessonPlanOf("none", 0)).toBe("none");
    expect(lessonPlanOf("none", 3)).toBe("drafted");
    expect(lessonPlanOf("checked", 3)).toBe("checked");
  });
});

describe("classRead", () => {
  const row = {
    id: "t1",
    plan_id: "c1",
    title: "ECP",
    starts_at: "2026-10-14T07:00:00Z",
    ends_at: "2026-10-14T08:15:00Z",
    cancelled_at: null,
    plan_state: "checked",
    recap_state: "drafted",
    recap: { covered: "Small talk and numbers.", learners: [{ person_id: DUC, md: "Your numbers were clear." }], homework_suggestion: "Record a one-minute intro." },
    course: { title: "English Communication Practice", open_to_learners: true },
    organiser: person("Hoan Ngo"),
    attendance: [
      { person_id: DUC, status: "attended", source: "transcript", removed_at: null, skip_reason: "clashed", review: { stars: 1 }, person: person("Nguyễn Văn Đức") },
      { person_id: AN, status: "absent", source: "organiser", removed_at: null, person: person("An Tran") },
      { person_id: "33333333-3333-4333-8333-333333333333", status: "skipped", source: "member", removed_at: null, skip_reason: "unwell", person: person("Bao Le") },
      { person_id: "gone", status: "attended", source: "member", removed_at: "2026-10-13T00:00:00Z", person: person("Gone Person") },
    ],
    blocks: [
      { position: 1, side: "reactive", minutes: 30, text: null, exercise: { title: "Hot seat" } },
      { position: 0, side: "presentation", minutes: 15, text: "Warm-up", exercise: null },
    ],
  };

  it("reads the class with attendees, lesson plan, recap and feedback, and nothing else of a person", async () => {
    script("trainings", { data: [row] });
    script("training_learner_feedback", {
      data: [{ person_id: DUC, evaluation: { level: { label: "B1", reason: "Clear." }, summary: "Good.", strengths: [], improvements: [], examples: [] }, evaluated_at: "2026-10-14T10:00:00Z", feedback: "Slow down.", feedback_at: "2026-10-14T11:00:00Z", person: person("Nguyễn Văn Đức"), author: person("Hoan Ngo") }],
    });
    const c = await classRead("t1", NOW);
    expect(c).toMatchObject({ courseTitle: "English Communication Practice", organiserName: "Hoan Ngo", held: true, lessonPlan: "checked", recapState: "drafted" });
    expect(c!.attendees).toEqual([
      { personId: AN, name: "An Tran", status: "absent", source: "organiser" },
      { personId: "33333333-3333-4333-8333-333333333333", name: "Bao Le", status: "absent", source: "member" },
      { personId: DUC, name: "Nguyễn Văn Đức", status: "attended", source: "transcript" },
    ]);
    expect(c!.blocks.map((b) => b.text)).toEqual(["Warm-up", "Hot seat"]);
    expect(c!.recap?.homework_suggestion).toBe("Record a one-minute intro.");
    expect(c!.feedback[0]).toMatchObject({ personId: DUC, feedback: "Slow down.", feedbackByName: "Hoan Ngo" });
    expect(c!.feedback[0]!.evaluation?.level.label).toBe("B1");
    const text = JSON.stringify(c);
    for (const leak of ["clashed", "unwell", "skip", "stars", "review", "Gone Person", "submission", "strong", "weak", "focus"]) expect(text).not.toContain(leak);
  });

  it("shows No plan when a class has no blocks", async () => {
    script("trainings", { data: [{ ...row, plan_state: "none", blocks: [], recap: null, recap_state: "none" }] });
    script("training_learner_feedback", { data: [] });
    const c = await classRead("t1", NOW);
    expect(c).toMatchObject({ lessonPlan: "none", blocks: [], recap: null, feedback: [] });
  });

  it("finds no class off a course", async () => {
    script("trainings", { data: [] });
    expect(await classRead("t1", NOW)).toBeNull();
  });
});
