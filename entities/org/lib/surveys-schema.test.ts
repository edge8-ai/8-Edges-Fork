import { describe, expect, it } from "vitest";
import { mergeBuilderConfig, validateAnswer, type SurveyFieldRow } from "./surveys-schema";

// CR.1.3: a client review ends with two confirmations the member must tick
// before the form can be sent. validateAnswer is the one check, shared by the
// runner in the browser and the submit endpoint on the server.

const field = (config: SurveyFieldRow["config"], required = true): SurveyFieldRow =>
  ({
    id: "f1",
    survey_id: "s1",
    position: 22,
    type: "yes_no",
    label: "I understand that I will not be able to make changes after I submit this review",
    help_text: null,
    required,
    config,
  }) as SurveyFieldRow;

describe("a confirmation that must be accepted", () => {
  it("accepts yes", () => {
    expect(validateAnswer(field({ must_accept: true }), true)).toEqual({ ok: true, text: "Yes", json: true });
  });

  it("refuses no, with a message that names the confirmation", () => {
    const res = validateAnswer(field({ must_accept: true }), false);
    expect(res.ok).toBe(false);
    expect(res).toMatchObject({ error: expect.stringContaining("Please confirm") });
  });

  it("refuses no answer at all", () => {
    expect(validateAnswer(field({ must_accept: true }), undefined).ok).toBe(false);
  });

  it("leaves an ordinary yes or no question free to be answered no", () => {
    expect(validateAnswer(field({}), false)).toEqual({ ok: true, text: "No", json: false });
  });
});

describe("a builder save of a field's config", () => {
  it("keeps the keys the builder has no input for", () => {
    const existing = { min: 1, max: 4, levels: { "4": "Almost always" }, maps_to: "performance_reviews.ratings.teamwork" };
    expect(mergeBuilderConfig(existing, { min: 1, max: 4, min_label: "Never" })).toEqual({
      min: 1,
      max: 4,
      min_label: "Never",
      levels: { "4": "Almost always" },
      maps_to: "performance_reviews.ratings.teamwork",
    });
  });

  it("lets the builder clear its own keys, such as an end label it no longer sends", () => {
    expect(mergeBuilderConfig({ min: 1, max: 5, max_label: "Great", must_accept: true }, { min: 1, max: 5 })).toEqual({ min: 1, max: 5, must_accept: true });
  });

  it("treats a field with no config as empty", () => {
    expect(mergeBuilderConfig(null, { choices: ["a", "b"] })).toEqual({ choices: ["a", "b"] });
  });
});
