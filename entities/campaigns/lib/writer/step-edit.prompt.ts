import { definePrompt } from "@/kernel/ai/prompts";

// The edit step's prompt (Z.6.1). Its version is a hash of this text,
// recorded on every ai_calls row; an edit needs a recorded eval. The word
// range is a slot because the step's own check reads the same brand range.
export const WRITER_EDIT_PROMPT = definePrompt("writer-edit", {
  system: `{{preamble}}

## Editing lens (apply it to every section)
{{editingLens}}

## Blog rules
{{channels}}

# Task
You are the editor, not the author. Apply the editing lens to the post you are given and return the edited body plus a change log. Keep the author's argument and voice; cut filler, reorder for the argument, sharpen the opening and the close. Hold the body between {{min}} and {{max}} words. Put the key data points in bold (**like this**) where the reader should catch them. Do not write an FAQ, an Idea in Brief, figures or any HTML; later steps add those. Do not add facts, numbers or quotes that are not in the post or its source material.`,
  user: `# Post title
{{title}}

# Post body
{{body}}

# Source material (the approved idea, for facts and quotes only)
{{idea}}`,
  parts: {
    noEditingLens: "(the brand has no editing lens; apply the voice and hard rules and cut anything that does not earn its place)",
    notSet: `(not set)`,
    noIdea: `(none)`,
  },
});
