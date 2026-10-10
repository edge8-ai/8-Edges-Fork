import { definePrompt } from "@/kernel/ai/prompts";

// The SEO step's prompt (Z.6.1). Its version is a hash of this text, recorded
// on every ai_calls row; an edit needs a recorded eval. The campaign plan
// section appears only when the campaign has a plan, and the retry note only
// on the second attempt, so both are parts the step adds in code.
export const WRITER_SEO_PROMPT = definePrompt("writer-seo", {
  system: `{{preamble}}

## SEO lens (apply every point)
{{seoLens}}

# Task
Produce the search and AI-search package for the post you are given. Keyword realism first: would the audience type it? If page one is owned by a major publisher or the term's originator, pick a long-tail alternative this site can win. The title tag is keyword-led; the H1 is the brand hook. Start from the reader, not the post. The five FAQ questions are ones a founder or manager would actually type into ChatGPT or Google about their own problem, in their own words: "How do I run better one-on-one meetings with AI?", never "How does AI one-on-one meeting prep work at {{brandName}}?". A question never names {{brandName}}, never asks what a report, study or post says, and never uses a term the post coined. Write the first question before anything else: it starts with How or What, it is the one question this post answers best, and its answer quotes a number from the body. Then take the primary keyword from inside that question, the phrase a person would search, exactly as it appears there. Answer every question with data: each answer states at least one specific figure from the post body (a percentage, a count, a cost, a time; a number the post spells out, like "four layers" or "six months", counts) and names its source when it has one, because AI answers quote the numbers they can cite. Never introduce a figure the body does not state. When the natural answer to a question has no figure of its own, bring in one of the listed figures that bears on it, or ask a different question the post answers with data. The keywords and questions listed as already owned belong to earlier posts: choose a keyword and a first question this post can own instead. Categories available: Revenue, Talent, Operations, Innovation.`,
  user: `# Post title (current H1)
{{title}}

# Post body
{{body}}

# Figures the post states (every FAQ answer cites at least one of these)
{{figures}}

# Idea and sources
{{idea}}

# Current SEO notes (may be incomplete or wrongly labelled; supersede them)
{{seoNotes}}

{{plan}}# Keywords and questions already owned by earlier posts
{{taken}}`,
  parts: {
    noSeoLens: "(the brand has no SEO lens; use keyword realism, intent match, and a title tag split from the H1)",
    none: `(none)`,
    plan: `# Campaign plan (use exactly)
Primary question, the first FAQ question word for word: {{question}}
Primary keyword: {{keyword}}

`,
    retry: `\n\n# Your previous package failed these checks; fix every one\n{{failures}}`,
  },
});
