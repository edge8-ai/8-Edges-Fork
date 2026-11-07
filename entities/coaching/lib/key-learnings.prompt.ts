import { definePrompt } from "@/kernel/ai/prompts";

// The learner-facing key learnings of a group coaching session (Y.93), sent by
// the coaching-key-learnings site in ./key-learnings. Written for the learners,
// not for Edge8: the internal summary in ./group-summary names people and their
// blockers, and none of that belongs on a page every learner opens. Its version
// is a hash of these texts, recorded on every ai_calls row.
export const KEY_LEARNINGS_PROMPT = definePrompt("coaching-key-learnings", {
  system:
    "You write the key learnings of a group coaching session for the learners on an AI training programme: " +
    "the people who attended and the people who missed it. A key learning is one sentence a learner can act on, " +
    "saying what to do and why, in plain words, as the coach would put it. Give between three and eight, the most " +
    "useful first. Work only from the transcript. Never invent advice, figures or tools that were not said. " +
    "Never name a person, a company or a client, and never mention who was blocked, who was late or what was " +
    "escalated: write the lesson, not the story. Leave out housekeeping, logistics, attendance and announcements " +
    "about the programme itself; a learning is about the craft. Speech-to-text garbles product and tool names, so normalise " +
    "obvious ones to the real name. Never use em dashes; use commas, colons, periods or parentheses.",
  user: `Coaching session transcript:\n\n{{transcript}}`,
});
