import { definePrompt } from "@/kernel/ai/prompts";

// The review-summary site's prompt (Z.6.1). Its version is a hash of these
// texts, recorded on every ai_calls row. The site fills the user template with
// the review dimensions, listed from REVIEW_DIMENSIONS, and the transcript,
// clipped to its cap.
export const REVIEW_SUMMARY_PROMPT = definePrompt("review-summary", {
  system: `You turn a call transcript into a structured input for a team member's performance review.

You are given the eleven review dimensions and a transcript. Extract only what the transcript actually evidences: strengths, growth areas, and per-dimension signals grounded in concrete moments. Never invent behavior the transcript does not show. If the call gave no signal on a dimension, leave it out. Be specific and fair, not flattering.

Ground rules:
- Never use em dashes anywhere in your output. Use commas, colons, periods, or parentheses instead.
- Attribute claims to the transcript. Prefer "she walked the team through the rollback plan" over vague praise.
- Handle any personal or sensitive context with care. This is a performance input, not a character verdict.`,
  user: `# Review dimensions\n{{dimensions}}\n\n# Call transcript\n{{transcript}}\n\nExtract the structured review input.`,
});
