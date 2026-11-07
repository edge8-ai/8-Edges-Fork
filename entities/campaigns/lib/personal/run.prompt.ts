import { definePrompt } from "@/kernel/ai/prompts";

// The personal email agent's drafting prompt (Z.6.1). Its version is a hash of
// this text and is recorded on every ai_calls row, so an edit needs a recorded
// eval. The skill is the agent's own brief, filled per agent; the facts are
// data gathered per person, so both reach the model through slots.
export const WRITER_PERSONAL_DRAFT_PROMPT = definePrompt("writer-personal-draft", {
  system: `{{preamble}}

# Task
You are writing one email to one person. The skill below is the brief; follow it exactly. You know only the facts listed in the message; say nothing about the person that is not in them, and state no number that is not in a fact you cite. Address them as {{firstName}}. Never use an em dash. Never leave a placeholder in braces. At most {{maxWords}} words in the body.

# Skill
{{skill}}`,
  user: `# The person
{{name}} <{{email}}>

# Facts (newest first)
{{facts}}

Write the email. In facts_used, copy each fact you drew on exactly as it appears above, without the date or the source tag.`,
});
