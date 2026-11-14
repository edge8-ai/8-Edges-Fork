import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// The Onboarding screen shows counts to anyone who may open it, and names, exit
// reasons and written answers only to a holder of the team's records
// (org.people). These prove the readers never build the person-level rows for
// a reader without it, so no later change to the page or its components can
// show or serialize them, and that a failed read raises instead of answering
// "nobody left".
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const org = vi.hoisted(() => ({
  surveyToRun: vi.fn(),
  surveyFields: vi.fn(),
  surveyAnswersOf: vi.fn(),
  surveyAnswerValues: vi.fn(),
}));
vi.mock("@/entities/org", () => org);

const { hiringOutcomes, day8Results, MIN_ANSWERS } = await import("./outcomes");

const TODAY = "2026-11-11";
const person = (name: string) => ({ full_name: name, display_name: name, preferred_name: null, email: null });
const HIRES = [
  { id: "tm-stay", status: "active", employment_stage: "full_time", start_date: "2026-06-05", end_date: null, probation_ends_on: "2026-08-04", termination_reason: null, people: person("Stayed Person") },
  { id: "tm-now", status: "active", employment_stage: "probation", start_date: "2026-09-14", end_date: null, probation_ends_on: "2026-11-13", termination_reason: null, people: person("Probation Person") },
  { id: "tm-term", status: "alumni", employment_stage: "probation", start_date: "2026-09-03", end_date: "2026-10-30", probation_ends_on: "2026-11-01", termination_reason: "performance", people: person("Left Marked") },
  // No stage on the record: counted by the last day falling inside sixty days of the start.
  { id: "tm-early", status: "alumni", employment_stage: null, start_date: "2026-05-11", end_date: "2026-05-27", probation_ends_on: null, termination_reason: null, people: person("Left Early") },
  // Left after passing probation: not a probation loss.
  { id: "tm-later", status: "alumni", employment_stage: "full_time", start_date: "2025-12-03", end_date: "2026-09-30", probation_ends_on: "2026-02-01", termination_reason: "resigned", people: person("Left Later") },
];
const scriptHires = () => script("team_members", { data: HIRES }, { data: null, count: 17 });

beforeEach(() => {
  resetFake();
  vi.clearAllMocks();
});

describe("hiringOutcomes", () => {
  it("counts who stayed, who is on probation and who left before it ended", async () => {
    scriptHires();
    const out = await hiringOutcomes(TODAY, { people: false });
    expect(out).toMatchObject({ hires: 5, onProbation: 1, lost: 2, stayed: 2, leftThisYear: 17 });
  });

  it("builds no person-level row for a reader without the team's records", async () => {
    scriptHires();
    const out = await hiringOutcomes(TODAY, { people: false });
    expect(out.exits).toEqual([]);
    expect(JSON.stringify(out)).not.toMatch(/Left Marked|Left Early|performance/);
    // Their onboarding records and survey answers are not even read.
    expect(calls.some((c) => c.table === "onboarding_plans")).toBe(false);
    expect(org.surveyAnswerValues).not.toHaveBeenCalled();
  });

  it("lists who left, with the reason and their onboarding, for a holder", async () => {
    scriptHires();
    script("onboarding_plans", { data: [{ team_member_id: "tm-term", decision: "terminate", day8_response_id: "r9", plan_url: "https://example.test/plan", plan_path: null }] });
    org.surveyAnswerValues.mockResolvedValue({ data: [{ response_id: "r9", value: "4" }, { response_id: "r9", value: "5" }, { response_id: "r9", value: "words" }], error: null });
    const out = await hiringOutcomes(TODAY, { people: true });
    expect(out.exits.map((x) => x.name)).toEqual(["Left Marked", "Left Early"]);
    expect(out.exits[0]).toMatchObject({ reason: "performance", decision: "terminate", dayLeft: 58, day8Score: 4.5, day8Answered: true, hadPlan: true, hadRecord: true });
    expect(out.exits[1]).toMatchObject({ dayLeft: 17, hadRecord: false, day8Answered: false });
  });

  it("raises when the hires cannot be read, never answering that nobody left", async () => {
    script("team_members", { data: null, error: { message: "timeout" } }, { data: null, count: 0 });
    await expect(hiringOutcomes(TODAY, { people: true })).rejects.toThrow(/hires of the last twelve months/);
  });
});

describe("day8Results", () => {
  const FIELDS = [
    { id: "f-rate", type: "rating", label: "I feel good about the culture" },
    { id: "f-few", type: "rating", label: "A question two people answered" },
    { id: "f-text", type: "long_text", label: "What can we do better?" },
    { id: "f-file", type: "file", label: "Upload" },
  ];
  const answered = [1, 2, 3].map((n) => ({ responseId: `r${n}`, name: `Person ${n}` }));
  const ANSWERS = [
    ...["5", "4", "5"].map((value, i) => ({ response_id: `r${i + 1}`, field_id: "f-rate", value })),
    { response_id: "r1", field_id: "f-few", value: "2" },
    { response_id: "r2", field_id: "f-few", value: "5" },
    { response_id: "r1", field_id: "f-text", value: "More time with my manager." },
    { response_id: "r2", field_id: "f-text", value: "  " },
    { response_id: "r3", field_id: "f-file", value: "uploads/private.pdf" },
  ];
  const ready = () => {
    org.surveyToRun.mockResolvedValue({ data: { id: "s1" }, error: null });
    org.surveyFields.mockResolvedValue({ data: FIELDS, error: null });
    org.surveyAnswersOf.mockResolvedValue({ data: ANSWERS, error: null });
  };

  it("averages a rating only once three people have answered it", async () => {
    ready();
    const out = await day8Results(answered, { people: false });
    expect(MIN_ANSWERS).toBe(3);
    expect(out.ratings).toEqual([{ label: "I feel good about the culture", avg: 4.7, answers: 3 }]);
  });

  it("counts the written answers but hands none to a reader without the team's records", async () => {
    ready();
    const out = await day8Results(answered, { people: false });
    expect(out.writtenCount).toBe(1);
    expect(out.written).toEqual([]);
    expect(JSON.stringify(out)).not.toMatch(/Person 1|More time/);
  });

  it("gives a holder each written answer with who wrote it, and never a file or a blank", async () => {
    ready();
    const out = await day8Results(answered, { people: true });
    expect(out.written).toEqual([{ question: "What can we do better?", name: "Person 1", text: "More time with my manager." }]);
  });

  it("raises when the answers cannot be read", async () => {
    ready();
    org.surveyAnswersOf.mockResolvedValue({ data: null, error: { message: "timeout" } });
    await expect(day8Results(answered, { people: true })).rejects.toThrow(/Day 8 answers/);
  });
});
