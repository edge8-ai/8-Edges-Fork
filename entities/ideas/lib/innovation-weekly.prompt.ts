import { definePrompt } from "@/kernel/ai/prompts";

// The Monday Innovation report's prompt (the Lark notifications plan,
// 2026-11-18). Its version is a hash of this text, recorded on every ai_calls
// row; an edit needs a recorded eval. No system prompt: the instruction and the
// themes travel as the one user message.
export const INNOVATION_WEEKLY_PROMPT = definePrompt("innovation-weekly", {
  user:
    "Below are the themes in the ideas Edge8's team shared recently, one per line: title, how many ideas, how many different people raised them, the newest idea's date, and what they have in common. " +
    "Pick one theme to double down on and one runner-up, each with one sentence on why. " +
    "Prefer a theme that different people raised recently, that a client would pay for or that makes our data safer, and that is small enough to start this week. " +
    "Use plain English, no jargon, no em dashes. Name the theme exactly as given.\n\n" +
    "Edge8 sells one question: if you knew everything about your company, what would you do differently? Data first, then workflows, then change.\n\n" +
    "Themes:\n{{themes}}",
});
