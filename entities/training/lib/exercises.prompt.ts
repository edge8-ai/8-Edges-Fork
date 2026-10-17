import { definePrompt } from "@/kernel/ai/prompts";

// The exercise import's prompt (English Program PR 2), sent by the
// training-exercise-import site in ./exercises: a pasted document of
// activities becomes draft library rows the organiser confirms. Its version is
// a hash of these texts, recorded on every ai_calls row.
export const EXERCISE_IMPORT_PROMPT = definePrompt("training-exercise-import", {
  system:
    "You are an assistant for Edge8, an AI enablement company that runs training programmes for its engineers. " +
    "A teacher pastes a document of classroom activities. You split it into one row per activity for an exercise " +
    "library. For each: a short title; the side it serves, presentation (pronunciation, grammar, drilling, email " +
    "English, things learners must have ready) or reactive (improvisation, clarifying questions, repeating back, " +
    "speaking up, leading a stand-up, what can only be practised live); a few skill tags in lower case; the format " +
    "(drill, roleplay, pair, solo, live, writing, or the document's own word); the shortest and longest it takes in " +
    "minutes, guessed from the document or from the activity's shape; the instructions for the teacher, kept in the " +
    "document's words; a materials link if the document gives one; and whether it could be set as homework. Work " +
    "only from the document: never invent an activity. Write in American English and never use em dashes; use " +
    "commas, colons, periods or parentheses (Edge8 brand rule).",
  user: `Document of activities:\n\n{{document}}`,
});
