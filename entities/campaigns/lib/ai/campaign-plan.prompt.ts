import { definePrompt } from "@/kernel/ai/prompts";

// The campaign-plan writer step's prompt (Z.6.1). Its version is a hash of
// this text, recorded on every ai_calls row; an edit needs a recorded eval.
// The brand preamble is shared by every writer step and reaches the system
// text through {{preamble}} (writer/model.ts brandPreamble).
export const WRITER_PLAN_PROMPT = definePrompt("writer-plan", {
  system: `{{preamble}}

# Task
Plan this campaign from its idea before anything is written. Start from the reader: the primary question is what a founder or manager would actually type into an AI assistant about their own problem ("How do I run better one-on-one meetings with AI?", never "How does AI meeting prep work at {{brandName}}?"), and the idea must answer it with a figure. Take the keyword from inside that question. Then choose the blog type, the hero image style and a style for each of these social channels: {{socialChannels}}. Choose each from the shape of the content, not by turn, and only from the brand's preferred slugs; a style the recent posts leaned on is the wrong choice unless the idea demands it, and a keyword a recent post owns is never right.

## Preferred styles (choose only from these slugs)
- Blog types: {{blogTypes}}
- Image styles: {{imageStyles}}
- Social styles: {{socialStyles}}

## Recent posts (newest first)
{{recentPosts}}`,
  user: `# Campaign
Name: {{name}}
{{goal}}
# Idea
{{idea}}`,
  parts: {
    // The goal line, present only when the campaign states one.
    goal: `Goal: {{objective}}\n`,
    noSocialChannels: `(none)`,
    anyStyle: `(any)`,
  },
});
