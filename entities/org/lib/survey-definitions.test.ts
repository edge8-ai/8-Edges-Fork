import { beforeEach, describe, expect, it, vi } from "vitest";
import { queries, recordingFrom, resetQueries, type Step } from "./testing/query-recorder";

// The survey and survey-field questions org's door answers (A.67). Each row is
// the query a caller in another entity built by hand before A.67, step for
// step. The public runner's reads are reached by anyone with a link, so their
// column lists are pinned exactly.

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: recordingFrom } }));

import {
  publishedSurveyOptions,
  surveyField,
  surveyFields,
  surveyForSubmission,
  surveyForUpload,
  surveyHeadline,
  surveySlug,
  surveyToRun,
  surveyWithId,
} from "./survey-definitions";

beforeEach(() => resetQueries());

const BY_SLUG: Step[] = [["eq", "slug", "pulse"], ["maybeSingle"]];

const cases: [string, () => Promise<unknown>, string, Step[]][] = [
  // portal submit route.
  [
    "surveyForSubmission",
    () => surveyForSubmission("pulse"),
    "surveys",
    [["select", "id, name, status, is_anonymous, archived_at, purpose, metadata"], ...BY_SLUG],
  ],
  // portal upload route.
  ["surveyForUpload", () => surveyForUpload("pulse"), "surveys", [["select", "id, status, archived_at"], ...BY_SLUG]],
  // portal runner page's metadata.
  ["surveyHeadline", () => surveyHeadline("pulse"), "surveys", [["select", "name, description"], ...BY_SLUG]],
  // portal runner page.
  [
    "surveyToRun",
    () => surveyToRun("pulse"),
    "surveys",
    [
      ["select", "id, slug, name, description, status, is_anonymous, intro_text, thank_you_text, purpose, created_at, updated_at, archived_at"],
      ...BY_SLUG,
    ],
  ],
  // retreats updateEvent.
  ["surveyWithId", () => surveyWithId("s1"), "surveys", [["select", "id"], ["eq", "id", "s1"], ["maybeSingle"]]],
  // retreats event page and generateEventQrs.
  ["surveySlug", () => surveySlug("s1"), "surveys", [["select", "slug"], ["eq", "id", "s1"], ["maybeSingle"]]],
  // retreats event page's feedback survey picker.
  [
    "publishedSurveyOptions",
    () => publishedSurveyOptions(),
    "surveys",
    [["select", "id, name"], ["is", "archived_at", null], ["eq", "status", "published"], ["order", "name", { ascending: true }]],
  ],
  // portal submit route and the runner page (twice).
  [
    "surveyFields",
    () => surveyFields("s1"),
    "survey_fields",
    [["select", "id, survey_id, position, type, label, help_text, required, config"], ["eq", "survey_id", "s1"], ["order", "position", { ascending: true }]],
  ],
  // portal upload route.
  [
    "surveyField",
    () => surveyField("s1", "f1"),
    "survey_fields",
    [["select", "id, type, config"], ["eq", "id", "f1"], ["eq", "survey_id", "s1"], ["maybeSingle"]],
  ],
];

describe("survey definition questions", () => {
  it.each(cases)("%s makes the query its caller made", async (_name, call, table, steps) => {
    await call();
    expect(queries).toEqual([{ table, steps }]);
  });
});
