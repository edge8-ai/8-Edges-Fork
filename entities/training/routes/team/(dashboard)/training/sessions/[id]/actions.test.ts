import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// The teacher's feedback on one learner for one lesson (ADR 0016, amended
// 2026-10-26): the session's organiser only, a learner on its register only,
// under the length cap, and the write names the feedback's columns alone, so
// an evaluation already on the row stays. The lib runs for real over the fake.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const requirePermission = vi.fn(async (_atom: string) => ({ may: () => true, user: { id: "u1", email: "hoan@example.test" }, personId: "hoan", impersonation: null }));
vi.mock("@/kernel/identity/access-request", () => ({ requirePermission: (atom: string) => requirePermission(atom) }));
vi.mock("@/kernel/identity/team-auth", () => ({ requireTeamMember: vi.fn(async () => ({ personId: "hoan", teamMemberId: "tm1" })) }));
const recordAudit = vi.fn(async (_row: Record<string, unknown>) => undefined);
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: (row: Record<string, unknown>) => recordAudit(row) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

beforeEach(() => resetFake());
afterEach(() => vi.clearAllMocks());

const { saveLearnerFeedbackAction } = await import("./actions");
const feedbackWrites = () => calls.filter((c) => c.table === "training_learner_feedback" && c.ops.includes("upsert"));

describe("saveLearnerFeedbackAction", () => {
  it("asks for training.organise and writes the feedback's columns only", async () => {
    script("trainings", { data: [{ id: "t1" }] });
    script("training_attendance", { data: [{ id: "r1" }] });
    script("training_learner_feedback", { data: null });
    expect(await saveLearnerFeedbackAction("t1", "duc", "  Strong opening; slow down on numbers.  ")).toEqual({ ok: true });
    expect(requirePermission).toHaveBeenCalledWith("training.organise");
    expect(calls.find((c) => c.table === "trainings")?.filters).toContainEqual(["eq", "organiser_id", "hoan"]);
    expect(calls.find((c) => c.table === "training_attendance")?.filters).toEqual(
      expect.arrayContaining([
        ["eq", "training_id", "t1"],
        ["eq", "person_id", "duc"],
        ["is", "removed_at", null],
      ]),
    );
    const write = feedbackWrites()[0];
    expect(write?.options[0]).toEqual({ onConflict: "training_id,person_id" });
    const row = write?.payloads[0] as Record<string, unknown>;
    expect(row).toMatchObject({ training_id: "t1", person_id: "duc", feedback: "Strong opening; slow down on numbers.", feedback_by: "hoan" });
    for (const k of ["evaluation", "evaluation_model", "evaluated_at"]) expect(row).not.toHaveProperty(k);
    // Audited without the text itself.
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ table: "training_learner_feedback", context: expect.objectContaining({ action: "teacher-feedback", personId: "duc" }) }));
    expect(JSON.stringify(recordAudit.mock.calls)).not.toContain("slow down");
  });

  it("refuses a session the reader does not organise, before writing", async () => {
    script("trainings", { data: [] });
    expect(await saveLearnerFeedbackAction("t1", "duc", "Good.")).toEqual({ ok: false, error: "That session was not found." });
    expect(feedbackWrites()).toEqual([]);
  });

  it("refuses a person who is not on the session's register", async () => {
    script("trainings", { data: [{ id: "t1" }] });
    script("training_attendance", { data: [] });
    expect(await saveLearnerFeedbackAction("t1", "stranger", "Good.")).toEqual({ ok: false, error: "That learner is not on this session." });
    expect(feedbackWrites()).toEqual([]);
  });

  it("refuses feedback over the length cap without reading anything", async () => {
    expect(await saveLearnerFeedbackAction("t1", "duc", "x".repeat(4001))).toMatchObject({ ok: false });
    expect(calls).toEqual([]);
  });

  it("clears the feedback on an empty text", async () => {
    script("trainings", { data: [{ id: "t1" }] });
    script("training_attendance", { data: [{ id: "r1" }] });
    script("training_learner_feedback", { data: null });
    expect(await saveLearnerFeedbackAction("t1", "duc", "   ")).toEqual({ ok: true });
    expect(feedbackWrites()[0]?.payloads[0]).toMatchObject({ feedback: null, feedback_by: null, feedback_at: null });
  });
});
