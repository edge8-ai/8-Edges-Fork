import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script, timeline } from "@/kernel/data/testing/fake-company-os";

// TR.2's member actions at their seam: each asks for training.mine first, and a
// member answers only for themselves and only once a training has started. The
// lib runs for real over the fake client.

const may = vi.fn((_permission: string, _target?: { person?: string }) => true);
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("@/kernel/identity/access-request", () => ({
  requirePermission: vi.fn(async () => ({ may, user: { id: "u1", email: "me@example.test" }, personId: "me", impersonation: null })),
}));
vi.mock("@/kernel/identity/team-auth", () => ({ requireTeamMember: vi.fn(async () => ({ personId: "me", teamMemberId: "tm1" })) }));
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: vi.fn(async () => undefined) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

beforeEach(() => resetFake());
afterEach(() => vi.clearAllMocks());

const writes = (table: string, op: string) => calls.filter((c) => c.table === table && c.ops.includes(op));
const ID = "6f1c6a9e-2b8f-4a3e-9d6e-1a2b3c4d5e6f";
const FUTURE = "2099-01-01T09:00:00Z";
// A training that ended an hour ago: started, and inside its seven-day window.
const RECENT = { starts_at: new Date(Date.now() - 2 * 3_600_000).toISOString(), ends_at: new Date(Date.now() - 3_600_000).toISOString(), cancelled_at: null, organiser_id: "hoan", self_logged: false, created_at: "2026-01-01T00:00:00Z" };
// One that ended eight days ago: its answer and review are final.
const CLOSED = { starts_at: new Date(Date.now() - 8 * 86_400_000 - 3_600_000).toISOString(), ends_at: new Date(Date.now() - 8 * 86_400_000).toISOString(), cancelled_at: null, organiser_id: "hoan", self_logged: false, created_at: "2026-01-01T00:00:00Z" };

describe("answering on My Training", () => {
  it("asks for training.mine and writes only the member's own row", async () => {
    script("training_attendance", { data: [{ id: "a1", person_id: "me", source: "member", reviews: [], status: "pending", training: RECENT }] }, { data: null });
    script("training_reviews", { data: null });
    const { answerMyTraining } = await import("./actions");
    const { requirePermission } = await import("@/kernel/identity/access-request");

    expect(await answerMyTraining("a1", { answer: "skipped", reason: "needed_rest" })).toEqual({ ok: true });
    expect(requirePermission).toHaveBeenCalledWith("training.mine");
    const update = writes("training_attendance", "update")[0];
    expect(update?.payloads[0]).toMatchObject({ status: "skipped", skip_reason: "needed_rest" });
    expect(update?.filters).toContainEqual(["eq", "person_id", "me"]);
  });

  it("repeats the not-removed condition on the write itself", async () => {
    script("training_attendance", { data: [{ id: "a1", person_id: "me", source: "member", reviews: [], status: "pending", training: RECENT }] }, { data: null });
    const { answerMyTraining } = await import("./actions");
    await answerMyTraining("a1", { answer: "attended" });
    expect(writes("training_attendance", "update")[0]?.filters).toContainEqual(["is", "removed_at", null]);
  });

  it("refuses before the training starts, and writes nothing", async () => {
    script("training_attendance", { data: [{ id: "a1", person_id: "me", source: "member", reviews: [], status: "pending", training: { starts_at: FUTURE, ends_at: FUTURE, cancelled_at: null } }] });
    const { answerMyTraining } = await import("./actions");
    expect(await answerMyTraining("a1", { answer: "attended" })).toEqual({ ok: false, error: "You can say once it has started." });
    expect(writes("training_attendance", "update")).toEqual([]);
  });

  it("treats someone else's attendance as not found", async () => {
    script("training_attendance", { data: [] });
    const { answerMyTraining } = await import("./actions");
    expect(await answerMyTraining("theirs", { answer: "attended" })).toEqual({ ok: false, error: "That training was not found." });
  });
});

describe("logging your own training", () => {
  it("records it as self-logged, with the member as organiser and already there", async () => {
    script("training_types", { data: [{ id: ID }] });
    script("trainings", { data: { id: "t9" } });
    script("training_attendance", { data: null });
    const { logMyTraining } = await import("./actions");
    expect(await logMyTraining({ typeId: ID, title: "Next.js 16, sitting 3", date: "2026-01-01", start: "20:00", minutes: 90 })).toEqual({ ok: true });
    expect(writes("trainings", "insert")[0]?.payloads[0]).toMatchObject({ organiser_id: "me", self_logged: true });
    expect(writes("training_attendance", "insert")[0]?.payloads[0]).toMatchObject({ person_id: "me", status: "attended" });
  });

  it("withdraws the training when its attendance cannot be saved, so a retry leaves no duplicate", async () => {
    script("training_types", { data: [{ id: ID }] });
    script("trainings", { data: { id: "t9" } }, { data: null });
    script("training_attendance", { error: { message: "boom" } });
    const { logMyTraining } = await import("./actions");
    expect(await logMyTraining({ typeId: ID, title: "Next.js 16, sitting 3", date: "2026-01-01", start: "20:00", minutes: 90 })).toEqual({ ok: false, error: "Could not log that. Try again." });
    const withdrawn = writes("trainings", "update")[0];
    expect(withdrawn?.payloads[0]).toMatchObject({ cancelled_by: "me" });
    expect(withdrawn?.filters).toContainEqual(["eq", "id", "t9"]);
  });

  it("refuses a training that has not happened yet", async () => {
    script("training_types", { data: [{ id: ID }] });
    const { logMyTraining } = await import("./actions");
    expect(await logMyTraining({ typeId: ID, title: "Later", date: "2099-01-01", start: "20:00", minutes: 60 })).toEqual({ ok: false, error: "Log a training once it has started." });
    expect(writes("trainings", "insert")).toEqual([]);
  });
});

describe("the seven-day window on the member's word (TR.3)", () => {
  it("refuses an answer once the window has closed, and writes nothing", async () => {
    script("training_attendance", { data: [{ id: "a1", person_id: "me", source: "member", reviews: [], status: "pending", training: CLOSED }] });
    const { answerMyTraining } = await import("./actions");
    expect(await answerMyTraining("a1", { answer: "attended" })).toEqual({ ok: false, error: "That one is final now." });
    expect(writes("training_attendance", "update")).toEqual([]);
  });

  it("removes the review before a reviewed training becomes skipped, so the attendance key can change", async () => {
    script("training_attendance", { data: [{ id: "a1", person_id: "me", source: "member", reviews: [{ id: "rv1" }], status: "attended", training: RECENT }] }, { data: null });
    script("training_reviews", { data: null });
    const { answerMyTraining } = await import("./actions");
    expect(await answerMyTraining("a1", { answer: "skipped", reason: null })).toEqual({ ok: true });
    expect(timeline()).toEqual(["training_attendance:select", "training_reviews:delete", "training_attendance:update"]);
    expect(calls.find((c) => c.table === "training_reviews")?.filters).toContainEqual(["eq", "attendance_id", "a1"]);
  });

  it("leaves the attendance alone when the review cannot be removed", async () => {
    script("training_attendance", { data: [{ id: "a1", person_id: "me", source: "member", reviews: [{ id: "rv1" }], status: "attended", training: RECENT }] });
    script("training_reviews", { error: { message: "boom" } });
    const { answerMyTraining } = await import("./actions");
    expect(await answerMyTraining("a1", { answer: "skipped", reason: null })).toEqual({ ok: false, error: "Could not save that. Try again." });
    expect(writes("training_attendance", "update")).toEqual([]);
  });

  // The confirm ("I was there" / "I was not") used to reach a writer that never
  // checked the window, so it could change a session of any age (A.40).
  it("refuses the confirm once the window has closed, and writes nothing", async () => {
    script("training_attendance", { data: [{ id: "a1", person_id: "me", source: "transcript", reviews: [], status: "attended", training: CLOSED }] });
    const { confirmAttendance } = await import("./actions");
    expect(await confirmAttendance("t1", "absent")).toEqual({ ok: false, error: "That one is final now." });
    expect(writes("training_attendance", "update")).toEqual([]);
  });

  it("records the confirm as the member's word, so a later transcript reading keeps it", async () => {
    script("training_attendance", { data: [{ id: "a1", person_id: "me", source: "transcript", reviews: [], status: "attended", training: RECENT }] }, { data: null });
    const { confirmAttendance } = await import("./actions");
    expect(await confirmAttendance("t1", "absent")).toEqual({ ok: true });
    expect(writes("training_attendance", "update")[0]?.payloads[0]).toMatchObject({ status: "absent", source: "member" });
  });
});

describe("reviewing on My Training (TR.3)", () => {
  const review = { stars: 4, load: "about_right", tags: ["useful", "useful"], note: " Good pace ", signed: true };

  it("asks for training.mine, reads only the member's own row, and saves one review per attendance", async () => {
    script("training_attendance", { data: [{ id: "a1", person_id: "me", source: "member", reviews: [], status: "attended", training: RECENT }] });
    script("training_reviews", { data: null });
    const { reviewMyTraining } = await import("./actions");
    const { requirePermission } = await import("@/kernel/identity/access-request");

    expect(await reviewMyTraining("a1", review)).toEqual({ ok: true });
    expect(requirePermission).toHaveBeenCalledWith("training.mine");
    expect(calls.find((c) => c.table === "training_attendance")?.filters).toContainEqual(["eq", "person_id", "me"]);
    const saved = writes("training_reviews", "upsert")[0];
    expect(saved?.payloads[0]).toEqual({ attendance_id: "a1", stars: 4, load: "about_right", tags: ["useful"], note: "Good pace", signed: true });
    expect(saved?.options[0]).toMatchObject({ onConflict: "attendance_id" });
  });

  it("refuses a review of a training the member has not said they went to", async () => {
    script("training_attendance", { data: [{ id: "a1", person_id: "me", source: "member", reviews: [], status: "skipped", training: RECENT }] });
    const { reviewMyTraining } = await import("./actions");
    expect(await reviewMyTraining("a1", review)).toEqual({ ok: false, error: "Say you went first." });
    expect(writes("training_reviews", "upsert")).toEqual([]);
  });

  it("counts a training the member logged late from when they logged it (Khoa, 2026-10-12)", async () => {
    script("training_attendance", { data: [{ id: "a1", person_id: "me", source: "member", reviews: [], status: "attended", training: { ...CLOSED, self_logged: true, created_at: new Date(Date.now() - 3_600_000).toISOString() } }] });
    script("training_reviews", { data: null });
    const { reviewMyTraining } = await import("./actions");
    expect(await reviewMyTraining("a1", review)).toEqual({ ok: true });
  });

  it("refuses once the review is final", async () => {
    script("training_attendance", { data: [{ id: "a1", person_id: "me", source: "member", reviews: [], status: "attended", training: CLOSED }] });
    const { reviewMyTraining } = await import("./actions");
    expect(await reviewMyTraining("a1", review)).toEqual({ ok: false, error: "That one is final now." });
    expect(writes("training_reviews", "upsert")).toEqual([]);
  });

  it("treats someone else's attendance as not found", async () => {
    script("training_attendance", { data: [] });
    const { reviewMyTraining } = await import("./actions");
    expect(await reviewMyTraining("theirs", review)).toEqual({ ok: false, error: "That training was not found." });
  });

  it("refuses a review with no stars before reading anything", async () => {
    const { reviewMyTraining } = await import("./actions");
    expect((await reviewMyTraining("a1", { ...review, stars: 0 })).ok).toBe(false);
    expect(calls).toEqual([]);
  });

  it("removes the member's own review inside the window", async () => {
    script("training_attendance", { data: [{ id: "a1", person_id: "me", source: "member", reviews: [], status: "attended", training: RECENT }] });
    script("training_reviews", { data: null });
    const { removeMyReview } = await import("./actions");
    expect(await removeMyReview("a1")).toEqual({ ok: true });
    const removed = calls.find((c) => c.table === "training_reviews" && c.ops.includes("delete"));
    expect(removed?.filters).toContainEqual(["eq", "attendance_id", "a1"]);
  });

  it("keeps a final review", async () => {
    script("training_attendance", { data: [{ id: "a1", person_id: "me", source: "member", reviews: [], status: "attended", training: CLOSED }] });
    const { removeMyReview } = await import("./actions");
    expect(await removeMyReview("a1")).toEqual({ ok: false, error: "That one is final now." });
    expect(calls.filter((c) => c.table === "training_reviews")).toEqual([]);
  });
});
