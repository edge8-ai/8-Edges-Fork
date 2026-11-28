import { formSteps } from "../form-steps";
import { answerPath, storedAnswer, type StoredAnswers } from "../review-answer-path";
import type { SurveyFieldRow } from "../surveys-schema";

// The member's own answer, shown read-only beside each question of the client
// manager's form (CR.2.2, story 38). Both forms of a framework map their
// fields onto the same keys, so the member's answer to a question is found by
// the key the rater's question maps onto, whatever either is worded.
//
// A screen that pairs two questions (a rating and its comment, a value and its
// reason) shows one panel, filed under the screen's first question. A
// question that needs a tick, such as the confirmations at the end, shows
// nothing: what the member agreed to is not an answer about their work.
//
// Pure: the caller has already asked the rules module whether this viewer may
// see the member's part at all, and passes null when they may not.

/** What the member answered to one screen of the rater's form. */
export type AnswerBeside = {
  rating: number | null;
  /** The level the rating stands for, as the form words it. */
  ratingLabel: string | null;
  choice: string | null;
  text: string | null;
};

/** The parts of a member's review row the forms write to. */
export type MemberAnswers = StoredAnswers;

const valueAt = (member: MemberAnswers, mapsTo: string | undefined): unknown => storedAnswer(member, answerPath(mapsTo));

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/** The member's answer beside each screen of the rater's form, keyed by the screen's first field. */
export function memberAnswersBeside(raterFields: readonly SurveyFieldRow[], member: MemberAnswers | null): Record<string, AnswerBeside> {
  if (!member) return {};
  const beside: Record<string, AnswerBeside> = {};
  for (const [first, companion] of formSteps(raterFields)) {
    if (first.type === "yes_no") continue;
    const primary = valueAt(member, first.config?.maps_to);
    const rating = first.type === "rating" && typeof primary === "number" && Number.isFinite(primary) ? primary : null;
    const answer: AnswerBeside = {
      rating,
      ratingLabel: rating === null ? null : (first.config?.levels?.[String(rating)] ?? null),
      choice: first.type === "single_choice" ? text(primary) : null,
      text: companion ? text(valueAt(member, companion.config?.maps_to)) : first.type === "long_text" ? text(primary) : null,
    };
    if (answer.rating !== null || answer.choice !== null || answer.text !== null) beside[first.id] = answer;
  }
  return beside;
}
