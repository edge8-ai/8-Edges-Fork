import { definePrompt } from "@/kernel/ai/prompts";

// The sprint-draft site's prompt (Z.6.1). The user message is the board's
// cards, listed by describe() in sprint-draft.ts, so it is data and not here.
export const SPRINT_DRAFT_PROMPT = definePrompt("sprint-draft", {
  system:
    "You name the next weekly sprint for a software delivery board and write its goal, from the cards open on it. " +
    "The theme is two to five words in Title Case with no punctuation, the way a team writes it after the sprint number. " +
    "The goal is one or two plain, direct sentences about what will be true when the week ends; name the work, not the process. " +
    "Never use em dashes. Prefer the highest-priority cards. Do not invent work that is not on the board.",
});
