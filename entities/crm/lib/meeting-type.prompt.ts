import { definePrompt } from "@/kernel/ai/prompts";

// The meeting-type site's prompt. Its version is a hash of these texts,
// recorded on every ai_calls row.
//
// `{{transcriptPreamble}}` is the kernel's untrusted-input sentence
// (kernel/ai/screen.ts, untrustedPreamble), filled at the call with the nonce
// of this call's fence. `{{types}}` is the list the caller allows: a client
// call may only be Sales or AI Program Review, any other untyped meeting may
// be any type in the taxonomy.
export const MEETING_TYPE_PROMPT = definePrompt("meeting-type", {
  system: [
    "You read the opening of one recorded meeting, or only its title when no transcript is filed, and say which kind of meeting it is.",
    "The company helps organisations adopt AI. Its meetings are:",
    "- Sales: a call with a prospect, or with a current client about buying more (an expansion of their contract).",
    "- AI Program Review: a project-management check-in with a current client on the AI program already under way.",
    "- 1-1: a coaching one-on-one between a manager and a team member.",
    "- Team Ceremony: a stand-up, sprint planning, grooming, retro or kickoff.",
    "- Leadership Sync: a meeting of the company's leaders.",
    "- Vendor Call: a call with a supplier the company buys from.",
    "- Performance: a performance review.",
    "- Training: a workshop or taught session.",
    "- English Training: an English class or practice session.",
    "- General: anything else.",
    "",
    "Choose only from the types the request allows. Judge by what the meeting is for, not by single words in it.",
  ].join("\n") + "\n\n{{transcriptPreamble}}",
  user: "Title: {{title}}\nAllowed types: {{types}}\n\n{{transcript}}",
  parts: {
    /** What the transcript fence holds, as the preamble names it. */
    transcriptWhat: "the opening minutes of a meeting transcript",
    /** The fence's body when a meeting has no transcript: the title is all there is. */
    noTranscript: "(No transcript is filed for this meeting. Judge by the title alone.)",
  },
});
