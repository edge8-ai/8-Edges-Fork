import { learningOutput as learningOutput_idea_plan } from "./ai/idea-plan";
import { planOutput as planOutput_idea_plan } from "./ai/idea-plan";

import { describe, expect, it } from "vitest";
import { jsonSchemaFor } from "@/kernel/ai/response";
import { canonicalSchema } from "@/kernel/ai/testing/schema-equivalence";

// The json_schema each of ideas's model calls sent until A.4, kept verbatim
// so the schema derived from the Zod that replaced it can be proved equal.
//
// Transcription is the risk this whole card is about: a slip yields a schema
// that is valid but wrong, which no golden snapshot can catch, because a
// snapshot pins what the Zod emits and not that the Zod says what was there
// before. `canonicalSchema` normalises the two spelling differences it knows
// about (the nullable form, and `required` order) and nothing else.
//
// Delete a fixture when "what it used to be" stops being the question. Not
// before.

const BEFORE_0 = {
  "type": "object",
  "additionalProperties": false,
  "required": [
    "office",
    "plan_markdown"
  ],
  "properties": {
    "office": {
      "type": "string",
      "enum": [
        "revenue",
        "talent",
        "operations",
        "innovation"
      ],
      "description": "Which of the Four Outcomes this idea primarily drives, mapped to its office: increased revenue -> 'revenue'; higher-performing people (capability, performance, onboarding) -> 'talent'; cheaper operations (time, cost, error rate of a repeating process) -> 'operations'; valuable innovation (new capacity for work the team could not do before) -> 'innovation'. Pick exactly one."
    },
    "plan_markdown": {
      "type": "string",
      "description": "The full product plan in Markdown. Sections, in order: a one-line pitch; 'The problem' (sharpened restatement); 'Program type' (Packaged AI, Automated Workflow, or Agentic Workflow, with one sentence on why, and what simpler type to start with if they picked too big); 'The workflow' (numbered steps from trigger to output, marking where AI does the work and where a human stays in the loop); 'Data it needs' (what information, where it lives, what is missing); 'FAST goal' (a Frequently discussed, Ambitious, Specific, Transparent goal with a real number and the ROI in plain terms); 'First slice' (the smallest version worth building in week one); 'Open questions' (2-4 things to resolve before building). Use ## headings. No preamble before the pitch line."
    }
  }
} as const;

const BEFORE_1 = {
  "type": "object",
  "additionalProperties": false,
  "required": [
    "office",
    "summary_markdown"
  ],
  "properties": {
    "office": {
      "type": "string",
      "enum": [
        "revenue",
        "talent",
        "operations",
        "innovation"
      ],
      "description": "Which of the Four Outcomes this learning most relates to, mapped to its office: increased revenue -> 'revenue'; higher-performing people -> 'talent'; cheaper operations -> 'operations'; valuable innovation -> 'innovation'. Pick exactly one."
    },
    "summary_markdown": {
      "type": "string",
      "description": "The polished learning in Markdown, under 150 words total. Structure: a single bold takeaway line (the lesson, stated so a teammate could act on it); then '## What happened' (the story, tightened); then '## Try it yourself' (1-3 short bullets on how a teammate applies this). No preamble before the takeaway line."
    }
  }
} as const;

// The trends schema had a fixture here until W.189 (8 Oct 2026) changed what the
// call asks for on purpose: themes with kinds, sparks and repeats instead of
// sentences. Its shape is now pinned by entities/ideas/lib/themes.test.ts.


describe("ideas model schemas", () => {
  it("ai/idea-plan.ts (PLAN_SCHEMA) asks for exactly what the hand-written schema asked for", () => {
    expect(canonicalSchema(jsonSchemaFor(planOutput_idea_plan))).toEqual(canonicalSchema(BEFORE_0));
  });

  it("ai/idea-plan.ts (LEARNING_SCHEMA) asks for exactly what the hand-written schema asked for", () => {
    expect(canonicalSchema(jsonSchemaFor(learningOutput_idea_plan))).toEqual(canonicalSchema(BEFORE_1));
  });


});
