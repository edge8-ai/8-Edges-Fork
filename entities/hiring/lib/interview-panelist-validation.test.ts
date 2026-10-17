import { fakeJsonMessage, fakeMessage } from "@/kernel/ai/testing/fake-message";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// The validation-failure path at the A.3 pilot, and the only test in the sweep
// that proves the point end to end: a shape the model got wrong never reaches
// the database.
//
// This is what the cast used to allow. `JSON.parse(out.text)` was validated
// here before A.3 — interview-panelist was chosen as the pilot precisely
// because it already was — but nothing pinned that behaviour, so moving the
// parse into the kernel could have dropped it silently. It could not now.
//
// The fake company_os client is the house one (kernel/data/testing): it
// records every write, and which tables were WRITTEN is the assertion that
// matters here. A queue per table, not one row: `interviews` is read twice
// with different shapes, the round itself and then the earlier rounds for
// carry-forward.
const create = vi.fn();
const writes = () => calls.filter((c) => c.payloads.length > 0 || c.ops.includes("delete")).map((c) => c.table);

vi.mock("@/kernel/data/supabase", () => ({
  companyOs: { from: (table: string) => builderFor(table) },
  supabase: {
    storage: {
      from: () => ({
        download: async () => ({ data: { arrayBuffer: async () => new TextEncoder().encode("[00:10] A transcript.").buffer } }),
      }),
    },
  },
}));
vi.mock("@/kernel/ai/client", () => ({ anthropicIfConfigured: () => ({ messages: { create } }) }));
vi.mock("@/kernel/ai/models", () => ({ modelFor: () => "claude-test-model", siteModelFor: () => "claude-test-model", hostFor: () => null, fallbackFor: () => null }));
vi.mock("@/entities/org", () => ({ selectCoreValues: () => builderFor("core_values") }));
vi.mock("@/kernel/identity/writes", () => ({ insertPeople: (row: unknown) => builderFor("people").insert(row) }));

const { scoreInterview } = await import("./interview-panelist");

const VALID = {
  recommendation: "advance",
  overall_score: 4.2,
  criteria: [{ name: "Craft", score: 4, evidence: "\"a race in our job queue\" (00:20)", confidence: "high" }],
  verified: ["Debugged a real concurrency bug."],
  still_open: [],
  next_round_questions: [],
  summary: "Solid engineering round.",
};

beforeEach(() => {
  resetFake();
  create.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
  script(
    "interviews",
    { data: { id: "iv1", title: "Engineering screen", mode: "video", created_at: "2026-09-14T09:00:00Z", application_id: "app1" } },
    { data: [] }, // priorRounds: no earlier rounds
  );
  script("applications", { data: { id: "app1", job_requisition_id: "job1", ai_summary: null, cover_letter: null, people: { full_name: "Linh Tran" } } });
  script("documents", { data: { storage_path: "transcripts/iv1.txt" } });
  script("job_requisitions", { data: { title: "Engineer", requirements: null, responsibilities: null, full_jd: null } });
  script("core_values", { data: [] });
  script("people", { data: { id: "ai-panelist" } });
  script("interview_scorecards", { data: { id: "sc1" } });
  script("scorecard_scores", { data: null }, { data: null });
});

describe("scoreInterview", () => {
  it("writes the scorecard when the reply matches the schema", async () => {
    create.mockResolvedValue(fakeJsonMessage(VALID));
    expect(await scoreInterview("iv1")).toEqual({ ok: true });
    expect(writes()).toContain("interview_scorecards");
  });

  it("writes nothing when a criterion score is the wrong type", async () => {
    // The whole point of the epic, in one case: structured output is a request,
    // not a guarantee, and a scorecard row is what a wrong shape used to become.
    create.mockResolvedValue(fakeJsonMessage({ ...VALID, criteria: [{ ...VALID.criteria[0], score: "four" }] }));
    const res = await scoreInterview("iv1");
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toContain("criteria.0.score");
    expect(writes()).toEqual([]);
  });

  it("writes nothing when the recommendation is outside the enum", async () => {
    create.mockResolvedValue(fakeJsonMessage({ ...VALID, recommendation: "maybe" }));
    const res = await scoreInterview("iv1");
    expect(res.ok).toBe(false);
    expect(writes()).toEqual([]);
  });

  it("writes nothing when the reply is truncated mid-JSON by the token cap", async () => {
    // readTextOutput names max_tokens before the parse, so the stored error
    // says "raise max_tokens" rather than reading like an API outage.
    create.mockResolvedValue(fakeMessage({ text: '{"recommendation":"adv', stopReason: "max_tokens" }));
    const res = await scoreInterview("iv1");
    expect(res.ok === false && res.error).toContain("max_tokens");
    expect(writes()).toEqual([]);
  });

  it("passes the site's own refusal message through", async () => {
    create.mockResolvedValue(fakeMessage({ stopReason: "refusal" }));
    expect(await scoreInterview("iv1")).toEqual({ ok: false, error: "The model declined to score this interview." });
    expect(writes()).toEqual([]);
  });
});
