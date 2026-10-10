import { coachingSummaryOutput as coachingSummaryOutput_prompts } from "./prompts";

import { describe, expect, it } from "vitest";
import { jsonSchemaFor } from "@/kernel/ai/response";
import { canonicalSchema } from "@/kernel/ai/testing/schema-equivalence";

// The json_schema each of coaching's model calls sent until A.4, kept verbatim
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
    "summary_markdown",
    "shared_summary_markdown",
    "commitments",
    "mode_split_estimate"
  ],
  "properties": {
    "summary_markdown": {
      "type": "string",
      "description": "The PRIVATE summary for the coach's eyes only. Markdown with ## sections in order: 'Meeting summary' (3-5 paragraphs of substance, decisions, concerns, energy and tone); 'Goal progress' (what the transcript shows about each FAST goal: moved, stalled, or blocked, with the evidence); 'Commitments' (each commitment, its owner, timeline, and any company-goal connection); 'Emotional and personal notes' (anything personal or emotionally significant, handled with care, this informs future prep, it is not a report; omit the section if nothing came up); 'Connections' (links to previous meetings, FAST goals, company goals, and company context)."
    },
    "mode_split_estimate": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "coach",
        "mentor",
        "direct"
      ],
      "description": "Estimate of how the leader's talk time split across the three modes, as integer percentages summing to 100. coach = asking questions and drawing the person out; mentor = teaching from experience; direct = giving instructions or answers. Judge from who talks, who proposes, and who decides in the transcript.",
      "properties": {
        "coach": {
          "type": "integer"
        },
        "mentor": {
          "type": "integer"
        },
        "direct": {
          "type": "integer"
        }
      }
    },
    "shared_summary_markdown": {
      "type": "string",
      "description": "The recap SHARED WITH THE TEAM MEMBER. Markdown with ## sections: 'What we covered' (the discussion, decisions, and wins, honest but constructive, written TO the team member in second person); 'Commitments' (the same commitments, phrased as what each side agreed to). NO private coaching observations, NO emotional read-outs, NO assessments of the person, only what both people in the room already know was said."
    },
    "commitments": {
      "type": "array",
      "description": "Every specific commitment made in the meeting by either side. Empty array if none were made.",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "title",
          "owner"
        ],
        "properties": {
          "title": {
            "type": "string",
            "description": "The commitment, one sentence, concrete."
          },
          "owner": {
            "type": "string",
            "enum": [
              "coach",
              "member"
            ],
            "description": "'member' if the team member owns it, 'coach' if the leader does."
          },
          "due_on": {
            "type": "string",
            "description": "YYYY-MM-DD deadline if one was stated; omit otherwise."
          }
        }
      }
    }
  }
} as const;

// K.12 deliberately rewrote the field descriptions (the language rule, the
// one-quote-per-claim rule, first-person commitments), so the descriptions are
// no longer "what it used to be" and comparing them would only pin the newest
// wording. The shape is still the A.4 question: a transcription slip that drops
// a field, a type or a required key is what this fixture exists to catch.
function withoutDescriptions(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(withoutDescriptions);
  if (node && typeof node === "object") {
    return Object.fromEntries(
      Object.entries(node as Record<string, unknown>)
        .filter(([k]) => k !== "description")
        .map(([k, v]) => [k, withoutDescriptions(v)]),
    );
  }
  return node;
}

describe("coaching model schemas", () => {
  it("prompts.ts (SUMMARY_SCHEMA) asks for the same shape the hand-written schema asked for", () => {
    expect(withoutDescriptions(canonicalSchema(jsonSchemaFor(coachingSummaryOutput_prompts)))).toEqual(
      withoutDescriptions(canonicalSchema(BEFORE_0)),
    );
  });
});
