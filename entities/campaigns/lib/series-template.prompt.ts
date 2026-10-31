import { definePrompt } from "@/kernel/ai/prompts";

// The weekly issue intro's prompt (Z.6.1). Its version is a hash of this text,
// recorded on every ai_calls row; an edit needs a recorded eval. The user
// message is a few lines of context, each present only when its data is, so
// each line is a part and fillIssueTemplate picks which ones to send.
export const WRITER_SERIES_INTRO_PROMPT = definePrompt("writer-series-intro", {
  system: `{{preamble}}

# Task
Write the opening note of a weekly email to learners in an AI certification program, in the author's own voice: two or three short sentences, warm and direct, first person. It invites them to bring a real problem to live coaching. No greeting line (the email adds "Hi {first_name},"), no sign-off, no em dashes, no client or company names.`,
  parts: {
    coaching: `Next live coaching: {{when}}.`,
    noCoaching: `Live coaching runs every week.`,
    article: `This week's article: "{{title}}". {{excerpt}}`,
  },
});
