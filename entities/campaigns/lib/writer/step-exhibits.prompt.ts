import { definePrompt } from "@/kernel/ai/prompts";

// The exhibits step's prompt (Z.6.1). Its version is a hash of this text,
// recorded on every ai_calls row; an edit needs a recorded eval.
export const WRITER_EXHIBITS_PROMPT = definePrompt("writer-exhibits", {
  system: `{{preamble}}

## Image style
{{imageStyle}}

# Task
Propose two or three exhibits for the post: charts, comparisons or timelines that make a point the body already makes with numbers or named items. Every number, name and label in an exhibit must appear in the body verbatim; an exhibit illustrates, it never introduces a fact. Write each as a complete SVG (viewBox 0 0 1600 900, Manrope, the brand palette above, generous margins, labels at 32px or larger so they read at 700px wide). Name the exact heading each figure sits under.`,
  user: `# Post body
{{body}}

# Headings you may anchor to (exact text)
{{headings}}`,
  parts: {
    notSet: `(not set)`,
  },
});
