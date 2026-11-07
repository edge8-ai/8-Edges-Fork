import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script, scriptStorage } from "@/kernel/data/testing/fake-company-os";

// A plan closed to learners (training_plans.open_to_learners false): every
// read a learner looks at drops its sessions, every member action on one is
// refused as if it did not exist, the same learner sees it all once the plan
// opens, and the organiser's reads and corrections carry on unchanged. A
// session with no plan is never closed.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
beforeEach(() => resetFake());
afterEach(() => vi.clearAllMocks());

const DUC = "duc";
const NOW = new Date("2026-10-14T09:00:00Z");
const NOT_FOUND = { ok: false, error: "That training was not found." };
const person = (full: string) => ({ display_name: null, preferred_name: null, full_name: full, email: null });
const flag = (open: boolean) => ({ plan_id: "p1", plan_flag: { open_to_learners: open } });
const writes = (table: string) => calls.filter((c) => c.table === table && c.ops.some((op) => ["update", "insert", "upsert", "delete"].includes(op)));

describe("hiddenFromLearners", () => {
  it("hides only a session on a closed plan, never one with no plan", async () => {
    const { hiddenFromLearners, planHidden } = await import("./learner-visibility");
    expect(hiddenFromLearners(flag(false))).toBe(true);
    expect(hiddenFromLearners(flag(true))).toBe(false);
    expect(hiddenFromLearners({ plan_id: null, plan_flag: null })).toBe(false);
    expect(planHidden({ open_to_learners: false })).toBe(true);
    expect(planHidden({ open_to_learners: true })).toBe(false);
  });
});

// ── the learner's reads ───────────────────────────────────────────────────────

const myRow = (open: boolean, over: Record<string, unknown> = {}) => ({
  id: "a1", status: "pending", source: "member", skip_reason: null, answered_at: null, reviews: [],
  training: { id: "t1", title: "ECP", starts_at: "2026-10-14T07:00:00Z", ends_at: "2026-10-14T08:15:00Z", self_logged: false, cancelled_at: null, created_at: "2026-10-01T00:00:00Z", ...flag(open), type: { id: "ty", name: "English", sort_order: 1 }, organiser: person("Hoan Ngo"), ...over },
});
const TYPES = { data: [{ id: "ty", name: "English", sort_order: 1, archived_at: null }] };

describe("myTrainingRows", () => {
  it("drops a closed plan's session and keeps it once the plan opens, and keeps a session with no plan", async () => {
    const { myTrainingRows } = await import("./trainings");
    script("training_attendance", { data: [myRow(false), { ...myRow(true, { id: "t2", plan_id: null, plan_flag: null }), id: "a2" }] });
    script("training_types", TYPES);
    expect((await myTrainingRows(DUC)).map((r) => r.trainingId)).toEqual(["t2"]);
    script("training_attendance", { data: [myRow(true)] });
    script("training_types", TYPES);
    expect((await myTrainingRows(DUC)).map((r) => r.trainingId)).toEqual(["t1"]);
  });
});

const sessionRow = (open: boolean) => ({
  id: "a1", status: "pending", source: "member",
  training: {
    id: "t1", title: "ECP", starts_at: "2026-10-20T07:00:00Z", ends_at: "2026-10-20T08:15:00Z", cancelled_at: null, ...flag(open), plan_state: "checked", materials: [], recap: null, recap_state: "none",
    plan: { title: "ECP" }, organiser: person("Hoan Ngo"), attendance: [], blocks: [], assignments: [],
  },
});

describe("readMySession and myProgramme", () => {
  it("read a closed plan's session as not there, and show it once the plan opens", async () => {
    const { readMySession, myProgramme } = await import("./my-session");
    script("training_attendance", { data: [sessionRow(false)] }, { data: [sessionRow(false)] });
    expect(await readMySession(DUC, "t1")).toBeNull();
    expect(await myProgramme(DUC, NOW)).toEqual({ next: [], past: [] });
    script("training_attendance", { data: [sessionRow(true)] }, { data: [sessionRow(true)] });
    expect((await readMySession(DUC, "t1"))?.id).toBe("t1");
    expect((await myProgramme(DUC, NOW)).next.map((s) => s.id)).toEqual(["t1"]);
  });
});

const assignment = (open: boolean) => ({ id: "as1", training_id: "t1", due_at: "2026-10-20T00:00:00Z", prompt: "Record yourself.", accepts: ["written"], archived_at: null, training: { title: "ECP", cancelled_at: null, ...flag(open) } });

describe("myHomework", () => {
  it("drops homework set on a closed plan's session, and shows it once the plan opens", async () => {
    const { myHomework } = await import("./assignments");
    script("training_attendance", { data: [{ training_id: "t1" }] });
    script("training_assignments", { data: [assignment(false)] });
    expect(await myHomework(DUC)).toEqual([]);
    script("training_attendance", { data: [{ training_id: "t1" }] });
    script("training_assignments", { data: [assignment(true)] });
    script("training_submissions", { data: [] });
    expect((await myHomework(DUC)).map((h) => h.assignment.id)).toEqual(["as1"]);
  });
});

describe("myNotes and myPlans", () => {
  const note = (open: boolean) => ({ plan_id: "p1", strong: "s", weak: "w", focus: "f", created_at: "2026-10-10T00:00:00Z", plan: { title: "ECP", archived_at: null, open_to_learners: open, organiser: person("Hoan Ngo") } });
  const membership = (open: boolean) => ({ removed_at: null, plan: { id: "p1", title: "ECP", rhythm: { weekdays: [1], start: "14:00", end: "15:15" }, philosophy: null, archived_at: null, open_to_learners: open, type: { name: "English" }, organiser: person("Hoan Ngo"), members: [] } });

  it("hide a closed plan's note and brief, and show them once it opens", async () => {
    const { myNotes } = await import("./learner-notes");
    const { myPlans } = await import("./plan-read");
    script("training_learner_notes", { data: [note(false)] }, { data: [note(true)] });
    script("training_plan_members", { data: [membership(false)] }, { data: [membership(true)] });
    expect(await myNotes(DUC)).toEqual([]);
    expect(await myPlans(DUC)).toEqual([]);
    expect((await myNotes(DUC)).map((n) => n.planId)).toEqual(["p1"]);
    expect((await myPlans(DUC)).map((p) => p.id)).toEqual(["p1"]);
  });
});

describe("trainingFactsOf", () => {
  it("finds no badge in an attendance, a submission or a review on a closed plan's session", async () => {
    const { trainingFactsOf } = await import("./act-facts");
    const session = (id: string, open: boolean) => ({ id, organiser_id: "hoan", self_logged: false, cancelled_at: null, recap_published_by: null, recap_published_at: null, created_at: "2026-10-01T00:00:00Z", ...flag(open) });
    script("training_attendance", { data: [{ id: "a-closed", training_id: "t-closed", person_id: DUC, updated_at: "2026-10-14T09:00:00Z" }, { id: "a-open", training_id: "t-open", person_id: DUC, updated_at: "2026-10-14T09:00:00Z" }] });
    script("training_submissions", {
      data: [
        { id: "s-closed", person_id: DUC, submitted_at: "2026-10-14T09:00:00Z", assignment: { training: flag(false) } },
        { id: "s-open", person_id: DUC, submitted_at: "2026-10-14T09:00:00Z", assignment: { training: flag(true) } },
      ],
    });
    script("trainings", { data: [] }, { data: [] }, { data: [session("t-closed", false), session("t-open", true)] });
    script("training_reviews", { data: [{ id: "r-closed", attendance_id: "a-closed", created_at: "2026-10-14T09:00:00Z" }, { id: "r-open", attendance_id: "a-open", created_at: "2026-10-14T09:00:00Z" }] });
    const facts = (await trainingFactsOf([DUC])).get(DUC);
    expect(facts?.attended.map((a) => a.id)).toEqual(["a-open"]);
    expect(facts?.submissions.map((s) => s.id)).toEqual(["s-open"]);
    expect(facts?.reviews.map((r) => r.id)).toEqual(["r-open"]);
  });
});

// ── the member's actions ──────────────────────────────────────────────────────

const registerRow = (open: boolean, over: Record<string, unknown> = {}) => ({
  id: "a1", person_id: DUC, status: "attended", source: "transcript", reviews: [],
  training: { organiser_id: "hoan", starts_at: "2026-10-14T07:00:00Z", ends_at: "2026-10-14T08:15:00Z", cancelled_at: null, self_logged: false, created_at: "2026-10-01T00:00:00Z", ...flag(open) },
  ...over,
});

describe("the member's word and review on a closed plan's session", () => {
  it("is refused as not found, and writes nothing", async () => {
    const { memberSays, saveReview, removeReview } = await import("./attendance-word");
    const key = { trainingId: "t1", personId: DUC };
    script("training_attendance", { data: [registerRow(false)] }, { data: [registerRow(false)] }, { data: [registerRow(false)] }, { data: [registerRow(false)] });
    expect(await memberSays(key, { answer: "attended" }, NOW)).toEqual(NOT_FOUND);
    expect(await memberSays(key, { answer: "absent" }, NOW)).toEqual(NOT_FOUND);
    expect(await saveReview(key, { stars: 4, load: "about_right", tags: [], note: null, signed: false }, NOW)).toEqual(NOT_FOUND);
    expect(await removeReview(key, NOW)).toEqual(NOT_FOUND);
    expect(writes("training_attendance")).toEqual([]);
    expect(writes("training_reviews")).toEqual([]);
  });

  it("goes through once the plan opens", async () => {
    const { memberSays } = await import("./attendance-word");
    script("training_attendance", { data: [registerRow(true)] }, { data: null });
    expect(await memberSays({ trainingId: "t1", personId: DUC }, { answer: "absent" }, NOW)).toEqual({ ok: true });
    expect(writes("training_attendance")).toHaveLength(1);
  });
});

describe("homework on a closed plan's session", () => {
  const mine = (open: boolean) => ({ id: "as1", training_id: "t1", due_at: "2026-10-20T00:00:00Z", prompt: "Write.", accepts: ["written", "upload"], archived_at: null, training: { ...flag(open), attendance: [{ person_id: DUC, removed_at: null }] } });

  it("is refused as not found for a submission and an upload, and writes nothing", async () => {
    const { recordSubmission, createSignedUpload } = await import("./assignments");
    script("training_assignments", { data: [mine(false)] }, { data: [mine(false)] });
    expect(await recordSubmission(DUC, "as1", { kind: "written", text: "Hello" }, NOW)).toEqual({ ok: false, error: "That homework was not found." });
    expect(await createSignedUpload(DUC, "as1", "a.mp3")).toEqual({ ok: false, error: "That homework was not found." });
    expect(writes("training_submissions")).toEqual([]);
  });

  it("is saved once the plan opens", async () => {
    const { recordSubmission } = await import("./assignments");
    script("training_assignments", { data: [mine(true)] });
    script("training_submissions", { data: null });
    expect(await recordSubmission(DUC, "as1", { kind: "written", text: "Hello" }, NOW)).toEqual({ ok: true });
  });

  it("will not open the learner's own file on a closed plan, and will once it opens", async () => {
    const { signMyDownload } = await import("./assignments");
    const path = `plan/p1/assignment/as1/${DUC}/x-a.mp3`;
    script("training_plans", { data: [{ open_to_learners: false }] }, { data: [{ open_to_learners: true }] });
    expect(await signMyDownload(DUC, path)).toEqual({ ok: false, error: "That file was not found." });
    scriptStorage("createSignedUrl", { data: { signedUrl: "https://signed" } });
    expect(await signMyDownload(DUC, path)).toEqual({ ok: true, url: "https://signed" });
  });
});

// ── the organiser, unaffected ─────────────────────────────────────────────────

describe("the organiser on a closed plan", () => {
  it("still reads the plan and every session, and sees it is closed", async () => {
    const { readPlan } = await import("./plan-read");
    script("training_plans", {
      data: [{ id: "p1", type_id: "ty", title: "ECP", rhythm: { weekdays: [1], start: "14:00", end: "15:15" }, published_until: null, lark_title: null, open_to_learners: false, recipients: [], philosophy: null, philosophy_updated_at: null, type: { name: "English" }, editor: null, members: [] }],
    });
    script("trainings", { data: [{ id: "t1", title: "ECP", notes: null, starts_at: "2026-10-20T07:00:00Z", ends_at: "2026-10-20T08:15:00Z", cancelled_at: null, plan_state: "none", attendance: [{ removed_at: null }] }] });
    const plan = await readPlan("hoan", "p1", NOW);
    expect(plan?.openToLearners).toBe(false);
    expect(plan?.sessions.map((s) => s.id)).toEqual(["t1"]);
  });

  it("still corrects a learner's row on the register", async () => {
    const { organiserCorrects } = await import("./attendance-word");
    script("training_attendance", { data: [registerRow(false, { source: "member", status: "pending" })] }, { data: null });
    expect(await organiserCorrects("hoan", { trainingId: "t1", personId: DUC }, "attended", NOW)).toEqual({ ok: true });
    expect(writes("training_attendance")).toHaveLength(1);
  });
});
