import { beforeEach, describe, expect, it, vi } from "vitest";
import { queries, recordingFrom, resetQueries, type Step } from "./testing/query-recorder";

// The survey response and answer questions and commands org's door answers
// (A.67). Each row is the query a caller in another entity built by hand before
// A.67, step for step.

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: recordingFrom } }));

import {
  cohortFeedbackResponses,
  cohortSurveysAnsweredBy,
  discardSurveyResponse,
  recordSurveyAnswers,
  recordSurveyResponse,
  surveyAnswerValues,
  surveyResponsesOfPerson,
} from "./survey-responses";

beforeEach(() => resetQueries());

const RESPONSE = { survey_id: "s1", respondent_kind: "external", person_id: null, respondent_name: "Guest", respondent_email: "guest@example.test" } as const;
const ANSWERS = [{ response_id: "r1", field_id: "f1", value: "5" }];

const cases: [string, () => Promise<unknown>, string, Step[]][] = [
  // portal submit route.
  ["recordSurveyResponse", () => recordSurveyResponse(RESPONSE), "survey_responses", [["insert", RESPONSE], ["select", "id"], ["single"]]],
  ["recordSurveyAnswers", () => recordSurveyAnswers(ANSWERS), "survey_answers", [["insert", ANSWERS]]],
  ["discardSurveyResponse", () => discardSurveyResponse("r1"), "survey_responses", [["delete"], ["eq", "id", "r1"]]],
  // retreats my-retreat page, matched by person id and by a literal, quoted email.
  [
    "cohortSurveysAnsweredBy",
    () => cohortSurveysAnsweredBy("saigon-26", { personId: "p1", email: "a_b@example.test" }),
    "survey_responses",
    [["select", "surveys(slug)"], ["eq", "cohort_slug", "saigon-26"], ["or", 'person_id.eq.p1,respondent_email.ilike."a\\\\_b@example.test"']],
  ],
  // retreats event page's feedback results.
  [
    "cohortFeedbackResponses",
    () => cohortFeedbackResponses("saigon-26"),
    "survey_responses",
    [["select", "submitted_at, surveys(id, slug, name)"], ["eq", "cohort_slug", "saigon-26"]],
  ],
  // crm person view.
  [
    "surveyResponsesOfPerson",
    () => surveyResponsesOfPerson("p1"),
    "survey_responses",
    [["select", "id, survey_id, submitted_at, created_at"], ["eq", "person_id", "p1"], ["order", "created_at", { ascending: false }]],
  ],
  // onboarding cycle.
  ["surveyAnswerValues", () => surveyAnswerValues(["r1", "r2"]), "survey_answers", [["select", "response_id, value"], ["in", "response_id", ["r1", "r2"]]]],
];

describe("survey response questions and commands", () => {
  it.each(cases)("%s makes the query its caller made", async (_name, call, table, steps) => {
    await call();
    expect(queries).toEqual([{ table, steps }]);
  });

  // The caller returned early when it had nothing to match a guest on, so the
  // question reads nothing then: no unfiltered read of a cohort's responses.
  it("reads nothing for a guest with neither a person id nor a spellable email", async () => {
    expect(await cohortSurveysAnsweredBy("saigon-26", {})).toEqual({ data: [], error: null });
    expect(await cohortSurveysAnsweredBy("saigon-26", { email: "a*b@example.test" })).toEqual({ data: [], error: null });
    expect(queries).toEqual([]);
  });
});
