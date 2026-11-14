import { describe, expect, it } from "vitest";
import { visibleReviewFields, reviewLinkPath } from "./reviews-labels";

type F = { config: { show_when?: { types?: string[] } } | null; label: string };
const fields: F[] = [
  { label: "Work quality", config: null },
  { label: "Decision (probation)", config: { show_when: { types: ["probation"] } } },
  { label: "Keeper", config: { show_when: { types: ["midyear"] } } },
];

describe("visibleReviewFields", () => {
  it("shows the manager the decision field for their cycle type only", () => {
    expect(visibleReviewFields(fields, "probation").map((f) => f.label)).toEqual([
      "Work quality",
      "Decision (probation)",
    ]);
  });
  it("hides every gated field from reviewers beyond the manager", () => {
    expect(visibleReviewFields(fields, "probation", "reviewer").map((f) => f.label)).toEqual(["Work quality"]);
    expect(visibleReviewFields(fields, "probation", "external").map((f) => f.label)).toEqual(["Work quality"]);
  });
});

describe("reviewLinkPath", () => {
  it("carries the token only on external rows", () => {
    expect(reviewLinkPath({ id: "r1", rater_kind: "external", review_type: "probation", access_token: "a+b" })).toBe(
      "/surveys/perf-review-manager?review=r1&t=a%2Bb",
    );
    expect(reviewLinkPath({ id: "r2", rater_kind: "reviewer", review_type: "probation", access_token: "x" })).toBe(
      "/surveys/perf-review-manager?review=r2",
    );
    expect(reviewLinkPath({ id: "r3", rater_kind: "self", review_type: "probation", access_token: null })).toBe(
      "/surveys/perf-review-self?review=r3",
    );
  });
});
