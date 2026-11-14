import { z } from "zod/v4";
import { jsonSchemaFor } from "@/kernel/ai/response";
// The coaching summary JSON schema. Its descriptions instruct the model as
// much as the prompts do, so editing one changes model output: treat it as a
// behaviour change, not a copy edit. The prompts themselves moved to
// ./ai.prompt (Z.6.1), where each one carries a version.

export const coachingSummaryOutput = z.object({
  summary_markdown: z.string().describe("The PRIVATE summary for the coach's eyes only, written in English. Markdown with ## sections in order: 'Meeting summary' (3-5 paragraphs of substance, decisions, concerns, energy and tone); 'Goal progress' (what the transcript shows about each FAST goal: moved, stalled, or blocked, and after EVERY such claim one short verbatim quote from the transcript, under 20 words, in quotation marks, in the language it was spoken); 'Commitments' (each commitment, its owner, timeline, and any company-goal connection, each phrased as a first-person promise); 'Emotional and personal notes' (anything personal or emotionally significant, handled with care, each observation carrying one short verbatim quote in quotation marks as its evidence, this informs future prep, it is not a report; omit the section if nothing came up); 'Connections' (links to previous meetings, FAST goals, company goals, and company context)."),
  mode_split_estimate: z.object({
    coach: z.number().int(),
    mentor: z.number().int(),
    direct: z.number().int(),
  }).describe("Estimate of how the leader's talk time split across the three modes, as integer percentages summing to 100. coach = asking questions and drawing the person out; mentor = teaching from experience; direct = giving instructions or answers. Judge from who talks, who proposes, and who decides in the transcript."),
  shared_summary_markdown: z.string().describe("The recap SHARED WITH THE TEAM MEMBER, written in the language named by the 'Recap language' line of the user message. Markdown with ## sections: 'What we covered' (the discussion, decisions, and wins, honest but constructive, written TO the team member in second person); 'Commitments' (the same commitments, each phrased as a first-person promise in the voice of whoever owns it, so the member recognises their own words). NO private coaching observations, NO emotional read-outs, NO assessments of the person, only what both people in the room already know was said."),
  commitments: z.array(z.object({
    title: z.string().describe("The commitment, one sentence, concrete, phrased as a first-person promise in the voice of its owner ('I will ...' for the coach's own, the member's name plus 'will ...' where naming them reads more naturally), in the same language as the shared recap."),
    owner: z.enum(["coach", "member"]).describe("'member' if the team member owns it, 'coach' if the leader does."),
    due_on: z.string().describe("YYYY-MM-DD deadline if one was stated; omit otherwise.").optional(),
  })).describe("Every specific commitment made in the meeting by either side. Empty array if none were made."),
});

export const SUMMARY_SCHEMA = jsonSchemaFor(coachingSummaryOutput);
