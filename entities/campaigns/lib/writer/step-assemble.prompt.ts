import { definePrompt } from "@/kernel/ai/prompts";

// The assemble step's prompt (Z.6.1): the Idea in Brief and the pull quotes.
// Its version is a hash of this text, recorded on every ai_calls row; an edit
// needs a recorded eval.
export const WRITER_ASSEMBLE_PROMPT = definePrompt("writer-assemble", {
  system: `{{preamble}}

# Task
Two things for the post you are given. First, the Idea in Brief: the problem, the insight and the way forward, each one or two plain sentences in the brand voice, no Markdown. Second, one to three pull quotes: sentences copied verbatim from the source material in the idea (a named person, publication or document), each placed under the heading where the post discusses it. A quote is verbatim or it is wrong; do not paraphrase and do not quote the post itself.`,
  user: `# Post body
{{body}}

# Source material (quote only from here)
{{idea}}`,
  parts: {
    noIdea: `(none)`,
  },
});
