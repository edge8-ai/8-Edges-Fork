import { definePrompt } from "@/kernel/ai/prompts";

// The campaign SEO/GEO strategist's prompt (Z.6.1). Its version is a hash of
// this text, recorded on every ai_calls row; an edit needs a recorded eval.
// The goal line and the blog-copy section depend on what the campaign has, so
// they are parts the site picks between.
export const CAMPAIGN_SEO_PROMPT = definePrompt("campaign-seo", {
  system: `You are the search and generative-engine strategist for {{brandName}}. Produce a plan that is specific, honest, and immediately usable by a writer.

## Brand positioning
{{positioning}}

## Audience
{{audience}}

## What we sell
{{offer}}

## SEO lens (follow this)
{{seoLens}}

Never use em dashes. Do not invent facts, metrics, or quotes. Return through the provided schema only.`,
  user: `# Campaign
Name: {{name}}
{{goalLine}}Idea: {{idea}}

{{blogSection}}

Write the Search / FAQ / GEO plan for this campaign.`,
  parts: {
    notSet: `(not set)`,
    noSeoLens: "(none set; apply sound SEO fundamentals)",
    goalLine: `Goal: {{objective}}\n`,
    noIdea: "(no idea text)",
    blogCopy: `# Blog copy (source for keywords and facts)\n\n{{copy}}`,
    noBlogCopy: "# No blog copy yet\n\nWork from the idea; flag where real data should be gathered.",
  },
});
