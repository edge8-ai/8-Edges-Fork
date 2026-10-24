import { meetingSummaryOutput as meetingSummaryOutput_meeting_summary } from "./meeting-summary";

import { describe, expect, it } from "vitest";
import { jsonSchemaFor } from "@/kernel/ai/response";
import { canonicalSchema } from "@/kernel/ai/testing/schema-equivalence";

// The json_schema each of assistant's model calls sent until A.4, kept verbatim
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
    "title",
    "summary_markdown",
    "attendees",
    "meeting_date"
  ],
  "properties": {
    "title": {
      "type": "string",
      "description": "A short, specific meeting title (max ~8 words) naming what the meeting was about. No date, no company name padding — e.g. 'Q3 roadmap and rollout plan'."
    },
    "summary_markdown": {
      "type": "string",
      "description": "A concise client-facing summary in Markdown, under ~250 words. Structure: a one-line overview sentence; then '## Key points' (3-6 bullets of what was discussed/decided); then '## Action items' (bullets as 'Owner - task', or 'None noted' if there were none). Ground everything in the transcript; do not invent decisions, numbers, or owners that were not said. Neutral, professional tone."
    },
    "attendees": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "The names of people who attended, as spoken/named in the transcript. Names only (no titles/emails). Empty array if the transcript gives no reliable way to tell who was present."
    },
    "meeting_date": {
      "type": [
        "string",
        "null"
      ],
      "description": "The calendar date the meeting took place, as YYYY-MM-DD, if it can be determined from the transcript (an explicit date, or a clearly stated day). Null if it cannot be determined — do not guess."
    }
  }
} as const;

describe("assistant model schemas", () => {
  it("meeting-summary.ts (SCHEMA) asks for exactly what the hand-written schema asked for", () => {
    expect(canonicalSchema(jsonSchemaFor(meetingSummaryOutput_meeting_summary))).toEqual(canonicalSchema(BEFORE_0));
  });

});
