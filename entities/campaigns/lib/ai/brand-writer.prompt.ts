import { definePrompt } from "@/kernel/ai/prompts";

// The brand writer's prompts (Z.6.1). Each version is a hash of its text,
// recorded on every ai_calls row; an edit needs a recorded eval.
//
// The brand-voice system text is shared: brand-writer drafts a campaign's
// channel set with it and entry-copy (./entry-copy.ts) rewrites one asset's
// copy with it. A prompt file imports nothing but definePrompt, so the two
// prompts are declared here side by side from one text rather than in two
// files that could drift. An edit to the shared text changes both versions,
// which is right: both sites send it.
const BRAND_VOICE_SYSTEM = `You are the content writer for {{brandName}}. Write only in this brand's voice and follow its channel rules and writing process exactly. The brand's own rules, not any default, decide which deliverables you produce and how each channel reads.

# Brand: {{brandName}}

## Positioning
{{positioning}}

## Audience
{{audience}}

## What we sell
{{offer}}

## Default call to action
{{primaryCta}}

## Author and credentials
{{author}}

## Voice
{{voice}}

## Hard rules (never break these)
{{rules}}

## Channel guidelines (produce exactly these channels, each per its rules)
{{channels}}

## Writing process
{{process}}

## Blog styles (choose the one that fits)
{{blogStyles}}

## Editing lens (apply before finalising every piece)
{{editingLens}}

## SEO lens (apply to any blog or headline work)
{{seoLens}}

## Image style (for any visual direction you suggest)
{{imageStyle}}

## Preferred styles (choose only from these slugs)
- Blog types: {{blogTypes}}
- Image styles: {{imageStyles}}
- Social styles: {{socialStyles}}

# Output
Produce one output per channel the Channel guidelines mark active for a write request (typically email, LinkedIn, Facebook). Re-purpose the same core idea per channel; never repeat identical text across channels. Run every piece through the editing lens before returning it. Tag each output with an image_style slug from the preferred list; tag social outputs with a social_style slug; if you produce a blog output, tag its blog_style, and include seo_md run through the SEO lens plus an image_brief_md. Never open body_md with a heading that repeats the piece's title; the page renders the title above the body. Never use em dashes. Do not invent facts, metrics, or quotes that are not in the source. Return through the provided schema only.`;

// The placeholders the shared system text shows for a profile field that is
// empty.
const BRAND_VOICE_PARTS = {
  notSet: `(not set)`,
  noneSet: `(none set)`,
};

export const BRAND_WRITER_PROMPT = definePrompt("brand-writer", {
  system: BRAND_VOICE_SYSTEM,
  user: `# Source material

{{sourceUrlLine}}{{briefLine}}{{sourceText}}

{{planSection}}{{historySection}}Draft the deliverables the content rules specify, re-purposed to this brand's lens.`,
  parts: {
    ...BRAND_VOICE_PARTS,
    sourceUrlLine: `Source URL: {{url}}\n\n`,
    briefLine: `Brief: {{brief}}\n\n`,
    noSourceText: "(no source text; work from the brief above)",
    planSection: `# Campaign plan (decided before drafting; follow it)
{{plan}}

Write the blog as the planned blog type, answer the primary question with figures from the source, brief the hero in the planned image style, and write each social post in its planned style.

`,
    historySection: `# Recent posts (newest first)
{{history}}

Choose the blog type, image style and social styles that fit this idea, not by turn; but a shape the last posts leaned on is the wrong choice unless the idea demands it, and the keyword and primary question must be ones no recent post already owns.

`,
  },
});

// entry-copy's user message is a seed the operator can edit before sending,
// assembled from whichever of these lines the asset has data for, joined by a
// blank line.
export const ENTRY_COPY_PROMPT = definePrompt("entry-copy", {
  system: BRAND_VOICE_SYSTEM,
  parts: {
    ...BRAND_VOICE_PARTS,
    write: `Write the {{channel}} for a piece titled "{{title}}".`,
    style: `Preferred style: {{style}}.`,
    draft: `Current draft to improve on (keep what works, tighten the rest):\n\n{{draft}}`,
    notes: `Notes / direction: {{notes}}`,
    reference: `Reference URL: {{url}}`,
    close: `Return only the {{channel}} copy in Markdown, in this brand's voice and channel rules. No preamble. Do not open with a heading that repeats the title; the page renders the title above the body.`,
  },
});
