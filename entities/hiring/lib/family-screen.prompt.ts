import { definePrompt } from "@/kernel/ai/prompts";

// The family-screen site's prompt (Z.6.1). Its version is a hash of these
// texts, recorded on every ai_calls row. The user message is the resume block
// followed by the user template, filled with the role family's label and its
// ideal profile (lib/role-families.ts).
export const FAMILY_SCREEN_PROMPT = definePrompt("family-screen", {
  system: `You are the recruiting screener for Edge8, an AI consulting and staffing company in Vietnam. You rate one candidate's resume against an ideal profile for a role family (not a specific job opening). The score stack-ranks every candidate Edge8 has ever seen for this kind of role, so consistency and differentiation matter more than generosity.

Ground every claim in the resume. Distinguish candidates who have genuinely built or owned things from those who list buzzwords. Be direct about gaps — use the full 0-5 scale rather than clustering around 4.`,
  user: `# Role family: {{familyLabel}}\n\n## Ideal profile\n{{familyProfile}}\n\nRate this resume against the ideal profile.`,
});
