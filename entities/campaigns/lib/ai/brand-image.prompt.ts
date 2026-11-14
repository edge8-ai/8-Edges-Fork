import { definePrompt } from "@/kernel/ai/prompts";

// The brand image's prompt (Z.6.1). Its version is a hash of this text,
// recorded on every ai_calls row; an edit needs a recorded eval.
//
// Gemini's image call takes one text and no system prompt, so the prompt is a
// user template only; brand-image.ts fills it and sends it as the request's
// only part.
export const BRAND_IMAGE_PROMPT = definePrompt("brand-image", {
  user: `Create a single marketing image for a post titled "{{title}}".

Aesthetic style: {{style}}.

Brand image guidance (use only these colors and this typeface):
{{guidance}}

Image brief:
{{brief}}

Produce one high-quality image, no borders, composed for a {{aspectRatio}} frame with the subject held in the middle third so a wide crop of the top and bottom keeps it whole. Use only the brand's palette. Text is welcome where the brief asks for it: a headline, one figure with a short label, or a few short labels, set large and legible in the brand typeface and spelled exactly as the brief gives them. Keep it to a handful of words and inside the middle of the frame. Never paint hex codes, colour names, typeface names or style instructions, even if the brief or the guidance quotes them; they describe the look, they are not content to render. People: never a photorealistic or rendered human, face or hands; line-art or stick figures are fine when the brief asks for them. Do not add logos, watermarks, or stock-photo captions.`,
  parts: {
    defaultStyle: "clean editorial",
    noGuidance: "(none provided)",
    noBrief: "(none provided; work from the title and style)",
  },
});
