import { describe, expect, it } from "vitest";
import { formSteps } from "./form-steps";
import type { SurveyFieldRow } from "./surveys-schema";

// CR.2.2: a client review shows each competency's rating and its comment on
// one screen, and a core value with the reason for choosing it. The pairing is
// read from what the two fields map onto, so a form whose fields do not pair
// keeps one question per screen exactly as before.

const field = (id: string, type: string, mapsTo?: string): SurveyFieldRow =>
  ({ id, type, label: id, help_text: null, required: true, position: 0, config: mapsTo ? { maps_to: mapsTo } : {} }) as unknown as SurveyFieldRow;

const ids = (steps: SurveyFieldRow[][]) => steps.map((s) => s.map((f) => f.id));

describe("formSteps", () => {
  it("puts a rating and the comment on the same key on one screen", () => {
    const steps = formSteps([
      field("r1", "rating", "performance_reviews.ratings.teamwork"),
      field("c1", "long_text", "performance_reviews.metadata.comment_teamwork"),
    ]);
    expect(ids(steps)).toEqual([["r1", "c1"]]);
  });

  it("puts a core value choice and its reason on one screen", () => {
    const steps = formSteps([
      field("v", "single_choice", "performance_reviews.metadata.core_value_strongest"),
      field("why", "long_text", "performance_reviews.metadata.core_value_strongest_why"),
    ]);
    expect(ids(steps)).toEqual([["v", "why"]]);
  });

  it("leaves a comment on another key as its own screen", () => {
    const steps = formSteps([
      field("r1", "rating", "performance_reviews.ratings.teamwork"),
      field("c2", "long_text", "performance_reviews.metadata.comment_integrity"),
    ]);
    expect(ids(steps)).toEqual([["r1"], ["c2"]]);
  });

  it("only pairs a comment that comes straight after its rating", () => {
    const steps = formSteps([
      field("r1", "rating", "performance_reviews.ratings.teamwork"),
      field("x", "long_text", "performance_reviews.achievements"),
      field("c1", "long_text", "performance_reviews.metadata.comment_teamwork"),
    ]);
    expect(ids(steps)).toEqual([["r1"], ["x"], ["c1"]]);
  });

  it("keeps a company review form, whose fields never pair, one question per screen", () => {
    const steps = formSteps([
      field("a", "rating", "performance_reviews.ratings.collaboration"),
      field("b", "long_text", "performance_reviews.achievements"),
      field("c", "yes_no"),
      field("d", "short_text"),
    ]);
    expect(ids(steps)).toEqual([["a"], ["b"], ["c"], ["d"]]);
  });

  it("answers an empty form with no screens", () => {
    expect(formSteps([])).toEqual([]);
  });
});
