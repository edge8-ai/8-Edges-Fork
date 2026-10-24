import { definePrompt } from "@/kernel/ai/prompts";

// The links step's prompt (Z.6.1). Its version is a hash of this text,
// recorded on every ai_calls row; an edit needs a recorded eval. The list of
// published posts is built from ledger rows in the step and reaches the user
// template through {{posts}}.
export const WRITER_LINKS_PROMPT = definePrompt("writer-links", {
  system: `{{preamble}}

# Task
Choose two to four published posts that genuinely relate to this post and, for each, a phrase already in a body paragraph to link from. Then, for each source URL the idea supplies, name the phrase where the body first mentions that source. Copy phrases exactly; never propose new wording.`,
  user: `# Post body
{{body}}

# Published posts (slug: title. keyword; the question the post answers)
{{posts}}

# Source URLs in the idea
{{sourceUrls}}`,
  parts: {
    noSourceUrls: `(none)`,
  },
});
