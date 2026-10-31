import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";
import { fakeJsonMessage } from "@/kernel/ai/testing/fake-message";

// A lesson's English evaluation (ADR 0016, amended 2026-10-26): only learners
// on the register who attended and spoke are evaluated, every quoted example
// is really in the transcript, the stored shape is checked, and the write
// never touches the teacher's feedback.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
let reply: unknown = { evaluations: [] };
const requests: unknown[] = [];
vi.mock("@/kernel/ai/gateway", () => ({
  aiSite: (decl: { site: string }) => ({
    site: decl.site,
    model: "test-model",
    clientIfConfigured: () => ({
      messages: {
        create: async (body: unknown) => {
          requests.push(body);
          return fakeJsonMessage(reply);
        },
      },
    }),
  }),
}));
beforeEach(() => {
  resetFake();
  requests.length = 0;
});
afterEach(() => vi.clearAllMocks());

const { Evaluation, settleEvaluation, whoSpoke, quotedIn } = await import("./english-evaluation-rules");
const { evaluateLesson, keepEvaluations, saveEvaluations } = await import("./english-evaluation");

const NOW = new Date("2026-10-26T09:00:00Z");
const person = (full: string, preferred: string | null = null) => ({ display_name: null, preferred_name: preferred, full_name: full, email: null, first_name: null });
const DUC = "11111111-1111-4111-8111-111111111111";
const AN = "22222222-2222-4222-8222-222222222222";
const BINH = "33333333-3333-4333-8333-333333333333";

// Lark's own export: speaker and timestamp on one line, the words below.
const TRANSCRIPT = `Participants: Hoan Ngo, Nguyễn Văn Đức, An Tran, Bình Lê
Hoan Ngo 00:00:03.120
Good afternoon. Duc, tell us about your week.

Nguyễn Văn Đức 00:00:10.500
I am go to the client office on Monday
and we discuss about the payment page.

Hoan Ngo 00:01:02.000
Thank you.
`;

const raw = (personId: string, over: Record<string, unknown> = {}) => ({
  person_id: personId,
  level: "b1",
  level_reason: "Clear meaning, frequent tense slips.",
  summary: "Đức explained his week clearly. Verb tenses slipped often.",
  strengths: ["Clear", "Confident", "Good vocabulary", "Asks questions", "Fifth strength"],
  improvements: ["Past tense"],
  examples: [
    { said: "I am go to the client  office on Monday", better: "I went to the client office on Monday" },
    { said: "we discuss about the payment page", better: "we discussed the payment page" },
    { said: "I has finished it", better: "I have finished it" },
  ],
  ...over,
});

describe("the stored shape", () => {
  it("settles an evaluation: CEFR label, lists cut to their limits, invented quotes dropped", () => {
    const e = settleEvaluation(raw(DUC), TRANSCRIPT);
    expect(e).not.toBeNull();
    expect(e!.level).toEqual({ label: "B1", reason: "Clear meaning, frequent tense slips." });
    expect(e!.strengths).toHaveLength(4);
    // The first example has a double space the transcript does not: whitespace aside, it was said. The third was never said.
    expect(e!.examples.map((x) => x.said)).toEqual(["I am go to the client  office on Monday", "we discuss about the payment page"]);
    expect(Evaluation.safeParse(e).success).toBe(true);
  });

  it("refuses a level that is not CEFR and an empty summary", () => {
    expect(settleEvaluation(raw(DUC, { level: "B3" }), TRANSCRIPT)).toBeNull();
    expect(settleEvaluation(raw(DUC, { summary: "  " }), TRANSCRIPT)).toBeNull();
    expect(Evaluation.safeParse({ level: { label: "B1", reason: "x" }, summary: "s", strengths: [], improvements: [], examples: Array(6).fill({ said: "a", better: "b" }) }).success).toBe(false);
  });

  it("matches a quote across whitespace only", () => {
    expect(quotedIn("go to the client office", "I am go to the\nclient   office")).toBe(true);
    expect(quotedIn("went to the client office", TRANSCRIPT)).toBe(false);
    expect(quotedIn("   ", TRANSCRIPT)).toBe(false);
  });
});

describe("who is evaluated", () => {
  const people = [
    { id: DUC, names: ["Nguyễn Văn Đức"] },
    { id: AN, names: ["An Tran"] },
  ];

  it("counts a learner who has a turn, not one only on the participants header", () => {
    expect([...whoSpoke(TRANSCRIPT, people)]).toEqual([DUC]);
  });

  it("keeps one evaluation per learner who spoke and none for anyone else", () => {
    const kept = keepEvaluations([raw(DUC), raw(DUC, { summary: "Second try." }), raw(AN), raw("someone-else")], [DUC], TRANSCRIPT);
    expect(kept.map((k) => k.personId)).toEqual([DUC]);
    expect(kept[0]!.evaluation.summary).toContain("explained his week");
  });
});

describe("saving", () => {
  it("upserts the evaluation's columns only, so the teacher's feedback stays", async () => {
    script("training_learner_feedback", { data: null });
    const e = settleEvaluation(raw(DUC), TRANSCRIPT)!;
    expect(await saveEvaluations("t1", [{ personId: DUC, evaluation: e }], "test-model", NOW)).toEqual({ ok: true });
    const up = calls.find((c) => c.table === "training_learner_feedback" && c.ops.includes("upsert"));
    expect(up?.options[0]).toEqual({ onConflict: "training_id,person_id" });
    const rows = up?.payloads[0] as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]!).sort()).toEqual(["evaluated_at", "evaluation", "evaluation_model", "person_id", "training_id", "updated_at"]);
    for (const k of ["feedback", "feedback_by", "feedback_at"]) expect(rows[0]).not.toHaveProperty(k);
  });

  it("evaluates a lesson the organiser runs: attended speakers only, never the organiser, then saves", async () => {
    script("trainings", {
      data: [
        {
          id: "t1",
          title: "ECP",
          starts_at: "2026-10-26T07:00:00Z",
          ends_at: "2026-10-26T08:15:00Z",
          organiser_id: "hoan",
          attendance: [
            { person_id: DUC, status: "attended", removed_at: null, person: person("Nguyễn Văn Đức") },
            { person_id: AN, status: "attended", removed_at: null, person: person("An Tran") },
            { person_id: BINH, status: "absent", removed_at: null, person: person("Bình Lê") },
            { person_id: "hoan", status: "attended", removed_at: null, person: person("Hoan Ngo") },
          ],
        },
      ],
    });
    script("training_learner_feedback", { data: null });
    reply = { evaluations: [raw(DUC), raw(AN), raw(BINH)] };
    expect(await evaluateLesson("hoan", "t1", TRANSCRIPT, NOW)).toEqual({ ok: true, evaluated: 1 });
    // Only Đức spoke: An sat silent, Bình was absent, Hoan teaches.
    const sent = JSON.stringify(requests[0]);
    expect(sent).toContain(DUC);
    expect(sent).not.toContain(AN);
    expect(sent).not.toContain(BINH);
    const read = calls.find((c) => c.table === "trainings");
    expect(read?.filters).toContainEqual(["eq", "organiser_id", "hoan"]);
    const rows = calls.find((c) => c.table === "training_learner_feedback")?.payloads[0] as { person_id: string }[];
    expect(rows.map((r) => r.person_id)).toEqual([DUC]);
  });

  it("makes no model call and writes nothing when nobody on the register spoke", async () => {
    script("trainings", { data: [{ id: "t1", title: "ECP", starts_at: "2026-10-26T07:00:00Z", ends_at: "2026-10-26T08:15:00Z", organiser_id: "hoan", attendance: [{ person_id: AN, status: "attended", removed_at: null, person: person("An Tran") }] }] });
    expect(await evaluateLesson("hoan", "t1", TRANSCRIPT, NOW)).toEqual({ ok: true, evaluated: 0 });
    expect(requests).toHaveLength(0);
    expect(calls.filter((c) => c.table === "training_learner_feedback")).toEqual([]);
  });

  it("finds nothing on a session the reader does not organise", async () => {
    script("trainings", { data: [] });
    expect(await evaluateLesson("someone", "t1", TRANSCRIPT, NOW)).toEqual({ ok: false, error: "That session was not found." });
  });
});
