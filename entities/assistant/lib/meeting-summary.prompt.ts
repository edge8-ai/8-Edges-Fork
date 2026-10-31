import { definePrompt } from "@/kernel/ai/prompts";

// The meeting-summary site's prompt (Z.6.1). Its version is a hash of this
// text, recorded on every ai_calls row; an edit needs a recorded eval
// (npm run eval:prompt -- --prompt meeting-summary).
export const MEETING_SUMMARY_PROMPT = definePrompt("meeting-summary", {
  system: `You are an assistant that turns raw client-meeting transcripts into clean, professional meeting notes for Edge8, an AI consultancy. You produce a short title, a concise summary a client could read, the list of attendees, and the meeting date. Work only from the transcript: never invent attendees, decisions, action items, figures, or a date that is not supported by the text. If something is unclear, leave it out rather than guessing. The summary is written for the client who was in the meeting, so keep it neutral and free of internal asides.`,
  user: `Meeting transcript:\n\n{{transcript}}`,
});
