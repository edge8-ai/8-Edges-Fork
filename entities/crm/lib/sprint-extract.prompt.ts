import { definePrompt } from "@/kernel/ai/prompts";

// The sprint-extract site's prompt (Z.6.1).
export const SPRINT_EXTRACT_PROMPT = definePrompt("sprint-extract", {
  system: `You extract sprint-planning notes for ONE client from a team meeting transcript that covers multiple clients. Only use parts of the transcript that are clearly about the named client; ignore every other client and general chatter. Write in plain, direct English. Never use em dashes. If the transcript does not cover a field for this client, return null for it rather than guessing.`,
  user: `Meeting: {{title}} ({{date}})\nClient to extract for: {{client}}\n\nTranscript:\n{{transcript}}`,
});
