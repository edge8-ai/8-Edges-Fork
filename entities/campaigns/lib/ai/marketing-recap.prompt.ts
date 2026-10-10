import { definePrompt } from "@/kernel/ai/prompts";

// The monthly marketing recap's prompt (Z.6.1). Its version is a hash of this
// text, recorded on every ai_calls row; an edit needs a recorded eval.
//
// This site sends no system prompt: its whole instruction travels as the one
// user message, as it always has, so the prompt is a user template only. The
// per-broadcast lines are built from rows in the site and reach the template
// through {{perBroadcast}}.
export const MARKETING_RECAP_PROMPT = definePrompt("marketing-recap", {
  user:
    "Below is one month of email marketing performance for Edge8. Write a short readout of how the month went, then propose 3-5 content types or topics to produce next month. Ground every suggestion in what actually earned opens and clicks this month (lean into topics that pulled, and name what to drop or change if something underperformed). Do not invent metrics that are not given.\n\n" +
    "Month total: {{broadcasts}} broadcasts, {{sent}} sent, {{openRate}} open rate, " +
    "{{clickRate}} click rate, {{unsubscribed}} unsubscribes.\n\n" +
    "Per broadcast:\n{{perBroadcast}}\n\n" +
    "Topics by total clickers across the month: {{topics}}.",
  parts: {
    noTopics: "none tagged",
  },
});
