import { definePrompt } from "@/kernel/ai/prompts";

// The channels step's prompt (Z.6.1). Its version is a hash of this text,
// recorded on every ai_calls row; an edit needs a recorded eval. The style
// instruction depends on whether the campaign plan named a style per channel,
// so both versions are parts and the step picks one.
export const WRITER_CHANNELS_PROMPT = definePrompt("writer-channels", {
  system: `{{preamble}}

## Channel guidelines
{{channels}}

## Preferred styles (choose only from these slugs)
- Image styles: {{imageStyles}}
- Social styles: {{socialStyles}}

# Task
The blog post below is final; it goes live at the URL given. Write the {{wanted}} deliverable(s) from it, each per its channel rules, re-purposing the same core idea without repeating text across channels. Where a channel's rules call for a link, link to the live post. Give each deliverable its own image brief, following the image style, not the blog hero's brief. {{styleTask}}

# Recent posts (newest first)
{{recentPosts}}`,
  user: `# Live post
{{liveUrl}}

# Title
{{title}}

# Body
{{body}}`,
  parts: {
    planned: `Write each of these posts in its planned social style, so the copy is that style and not only labelled with it:\n{{planned}}\nChoose the image style for each, and the social style of any channel not listed; a style the recent posts leaned on for that channel is the wrong choice unless the post demands it.`,
    unplanned: "Choose each channel's social style and image style for this post; a style the recent posts leaned on for that channel is the wrong choice unless the post demands it.",
    notSet: `(not set)`,
    noneSet: `(none set)`,
    notLive: `(not yet live)`,
  },
});
