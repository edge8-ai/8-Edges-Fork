import { familyOutput as familyOutput_family_screen } from "./family-screen";
import { REVIEW_DIMENSIONS } from "./reviews";
import { reviewSummaryOutput as reviewSummaryOutput_review_summary } from "./review-summary";

import { describe, expect, it } from "vitest";
import { jsonSchemaFor } from "@/kernel/ai/response";
import { canonicalSchema } from "@/kernel/ai/testing/schema-equivalence";

// The json_schema each of team's model calls sent until A.4, kept verbatim
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
    "overview",
    "strengths",
    "gaps",
    "rating"
  ],
  "properties": {
    "overview": {
      "type": "string",
      "description": "One tight paragraph: who the candidate is, years of experience, and their most relevant concrete accomplishments for this role family."
    },
    "strengths": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "3-5 bullets tying the candidate's real experience to the ideal profile's key criteria."
    },
    "gaps": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "1-3 bullets on the biggest gaps versus the ideal profile. Empty only for a truly exceptional match."
    },
    "rating": {
      "type": "number",
      "description": "Fit against the role-family ideal profile, 0.0 to 5.0 with one decimal. 5 = exceptional on every criterion; 3 = solid with real gaps; 1 = poor fit. Use the full scale — this stack-ranks the whole talent pool."
    }
  }
} as const;

const BEFORE_1 = {
  "type": "object",
  "additionalProperties": false,
  "required": [
    "overview",
    "strengths",
    "growth_areas",
    "dimensions"
  ],
  "properties": {
    "overview": {
      "type": "string",
      "description": "2-3 sentences: what this call was about and the overall read on the person's performance."
    },
    "strengths": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Concrete strengths the call evidenced, one per item, each grounded in something actually said or shown. Empty array if none surfaced."
    },
    "growth_areas": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Concrete areas for growth the call evidenced, one per item, grounded in the transcript. Empty array if none surfaced."
    },
    "dimensions": {
      "type": "array",
      "description": "Only the review dimensions this call actually touched. Skip dimensions the call gave no signal on. Empty array if the call touched none.",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "key",
          "signal"
        ],
        "properties": {
          "key": {
            "type": "string",
            "enum": [
              ...REVIEW_DIMENSIONS.map((d) => d.key)
            ],
            "description": "The dimension key this signal maps to."
          },
          "signal": {
            "type": "string",
            "description": "One or two sentences on what the call showed about this dimension, with a concrete example where possible."
          }
        }
      }
    }
  }
};

describe("team model schemas", () => {
  it("family-screen.ts (FAMILY_SCHEMA) asks for exactly what the hand-written schema asked for", () => {
    expect(canonicalSchema(jsonSchemaFor(familyOutput_family_screen))).toEqual(canonicalSchema(BEFORE_0));
  });

  it("review-summary.ts (SUMMARY_SCHEMA) asks for exactly what the hand-written schema asked for", () => {
    expect(canonicalSchema(jsonSchemaFor(reviewSummaryOutput_review_summary()))).toEqual(canonicalSchema(BEFORE_1));
  });

});
