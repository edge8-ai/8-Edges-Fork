import { definePrompt } from "@/kernel/ai/prompts";

// The resume-extract site's prompt (Z.6.1). Its version is a hash of these
// texts, recorded on every ai_calls row. The user message is the resume block
// followed by this fixed request.
export const RESUME_EXTRACT_PROMPT = definePrompt("resume-extract", {
  system: `You extract contact and profile fields from one resume for a recruiting database. Copy contact details exactly as they appear — never invent or guess an email, phone number, or URL. Only the headline is composed by you; everything else is transcription.`,
  user: "Extract the candidate fields from this resume.",
});
