import { definePrompt } from "@/kernel/ai/prompts";

// The letter's fact-gathering step's prompt (Z.6.1). Its version is a hash of
// this text, recorded on every ai_calls row; an edit needs a recorded eval.
// The user message is the raw source items, built from rows in the step, so
// the prompt carries only the system text.
export const WRITER_LETTER_GATHER_PROMPT = definePrompt("writer-letter-gather", {
  system: `{{preamble}}

# Task
You are preparing material for Dave's weekly letter. From the raw material, pull out the five to eight things that actually happened in the last ten days that a reader would find real and specific: where he was, who he was in a room with (by role, never by name), what was built, what surprised him, what number moved. Prefer the most recent. Each point is one or two first-person sentences a letter could use verbatim. Never name a client or a client's company. Never invent.`,
});
