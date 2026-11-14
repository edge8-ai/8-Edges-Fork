import { describe, expect, it } from "vitest";
import { memberAnswersBeside } from "./beside";
import type { SurveyFieldRow } from "../surveys-schema";

// CR.2.2: the client manager sees the member's own answer beside each
// question (story 38). What sits beside a question is read from the member's
// part by the key both forms map onto, so the rater's wording never matters.

const field = (id: string, type: string, mapsTo?: string, config: Record<string, unknown> = {}): SurveyFieldRow =>
  ({ id, type, label: id, help_text: null, required: true, position: 0, config: { ...(mapsTo ? { maps_to: mapsTo } : {}), ...config } }) as unknown as SurveyFieldRow;

const levels = { "1": "Often does not", "2": "Sometimes", "3": "Often demonstrates", "4": "Almost always" };

const raterForm = [
  field("cv", "single_choice", "performance_reviews.metadata.core_value_strongest"),
  field("cvWhy", "long_text", "performance_reviews.metadata.core_value_strongest_why"),
  field("team", "rating", "performance_reviews.ratings.teamwork", { levels }),
  field("teamC", "long_text", "performance_reviews.metadata.comment_teamwork"),
  field("ach", "long_text", "performance_reviews.achievements"),
  field("ok", "yes_no", "performance_reviews.metadata.confirmed_no_changes", { must_accept: true }),
];

const memberPart = {
  ratings: { teamwork: 3 },
  metadata: {
    core_value_strongest: "Commitment to excellence",
    core_value_strongest_why: "Rebuilt the release checklist.",
    comment_teamwork: "Paired with QA every week.",
    confirmed_no_changes: true,
  },
  achievements: "Cut release prep to one day.",
  improvements: null,
  comments: null,
};

describe("memberAnswersBeside", () => {
  it("puts the member's rating, its level and their comment beside a competency", () => {
    expect(memberAnswersBeside(raterForm, memberPart).team).toEqual({
      rating: 3,
      ratingLabel: "Often demonstrates",
      choice: null,
      text: "Paired with QA every week.",
    });
  });

  it("puts the member's chosen value and their reason beside a core value question", () => {
    expect(memberAnswersBeside(raterForm, memberPart).cv).toEqual({
      rating: null,
      ratingLabel: null,
      choice: "Commitment to excellence",
      text: "Rebuilt the release checklist.",
    });
  });

  it("puts the member's text beside a closing question", () => {
    expect(memberAnswersBeside(raterForm, memberPart).ach?.text).toBe("Cut release prep to one day.");
  });

  it("files a pair under its first question only, so the comment is not shown twice", () => {
    const beside = memberAnswersBeside(raterForm, memberPart);
    expect(beside.teamC).toBeUndefined();
    expect(beside.cvWhy).toBeUndefined();
  });

  it("never shows the member's confirmations", () => {
    expect(memberAnswersBeside(raterForm, memberPart).ok).toBeUndefined();
  });

  it("shows nothing for a question the member left empty", () => {
    const beside = memberAnswersBeside(raterForm, { ...memberPart, ratings: {}, metadata: {}, achievements: "  " });
    expect(beside).toEqual({});
  });

  it("shows nothing when there is no member part to read", () => {
    expect(memberAnswersBeside(raterForm, null)).toEqual({});
  });

  it("does not take a number written as text for a rating", () => {
    const beside = memberAnswersBeside(raterForm, { ...memberPart, ratings: { teamwork: "3" } as unknown as Record<string, number> });
    expect(beside.team).toEqual({ rating: null, ratingLabel: null, choice: null, text: "Paired with QA every week." });
  });
});
