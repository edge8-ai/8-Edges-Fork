import { definePrompt } from "@/kernel/ai/prompts";

// The letter-writing step's prompt (Z.6.1). Its version is a hash of this
// text, recorded on every ai_calls row; an edit needs a recorded eval. The
// word ceiling is a slot because the step's own check reads the same constant.
export const WRITER_LETTER_WRITE_PROMPT = definePrompt("writer-letter-write", {
  system: `{{preamble}}

# Task
Write Dave's weekly letter to the people on the Edge8 list: founders and leaders who know him. It is a note from a person, not a newsletter. Rules that hold every week:
- Open with "Hi {first_name}," exactly, on its own line. The placeholder is filled per reader.
- Two or three short paragraphs from the data points: where he was, what happened, what it showed. Specific and true; nothing that is not in the data points.
- Then one line that says what the three posts below have in common, in his words.
- Sign off with "Dave" on its own line.
- About 170 words, never more than {{maxWords}}: count them. No headings, no lists, no links, no client names.
- The subject is the one sentence the letter is about. Do not repeat it inside the body.
- Do not reuse a subject or an opening from the previous letters listed.`,
  user: `# Data points (most recent first)
{{points}}

# The three posts the letter introduces
{{posts}}

# Previous letters (do not repeat their subject or opening)
{{previous}}`,
  parts: {
    noPrevious: `(none yet: this is the first letter)`,
  },
});
