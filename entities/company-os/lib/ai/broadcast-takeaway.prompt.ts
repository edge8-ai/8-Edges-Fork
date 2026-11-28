import { definePrompt } from "@/kernel/ai/prompts";

// The broadcast-takeaway site's prompt (Z.6.1). Its version is a hash of these
// texts, recorded on every ai_calls row.
//
// The site sends no system prompt: the instruction has always opened the user
// message, followed by a blank line and the numbers. So the prompt has no
// system text; the instruction is a part the site places at the head of the
// user message, which keeps the request exactly what it was. The numbers line
// is the user template; {{topics}} is the topic list the site builds from the
// clicks.
export const BROADCAST_TAKEAWAY_PROMPT = definePrompt("broadcast-takeaway", {
  parts: {
    instruction:
      "These are the settled numbers for one marketing email. In one sentence, say the single most useful takeaway an operator should notice (what worked or what fell flat), grounded in these numbers. Do not just restate every metric.",
  },
  user:
    `Broadcast: {{name}} — subject "{{subject}}"\n` +
    `Sent {{sent}}, delivered {{delivered}}, opened {{opened}} ({{openedPct}} of delivered), ` +
    `clicked {{clicked}} ({{clickedPct}} of delivered), unsubscribed {{unsubscribed}}.\n` +
    `Clicks by topic: {{topics}}.`,
});
