import { sprintBriefOutput as sprintBriefOutput_sprint_extract } from "./sprint-extract";

import { describe, expect, it } from "vitest";
import { jsonSchemaFor } from "@/kernel/ai/response";
import { canonicalSchema } from "@/kernel/ai/testing/schema-equivalence";

// The json_schema each of crm's model calls sent until A.4, kept verbatim
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
    "goal",
    "focus_improvement",
    "going_well",
    "meeting_summary"
  ],
  "properties": {
    "goal": {
      "type": [
        "string",
        "null"
      ],
      "description": "The goal set for this client's upcoming sprint, in one or two sentences. null if no goal was discussed for this client."
    },
    "focus_improvement": {
      "type": [
        "string",
        "null"
      ],
      "description": "The number one thing the team said it is trying to improve for this client, from the retrospective part of the meeting. null if none was named."
    },
    "going_well": {
      "type": [
        "string",
        "null"
      ],
      "description": "A short summary of what is going well for this client, from the retrospective. null if not discussed."
    },
    "meeting_summary": {
      "type": [
        "string",
        "null"
      ],
      "description": "A concise summary (3 to 6 sentences) of everything else discussed about this client: decisions, risks, follow-ups. null if the client was not discussed."
    }
  }
} as const;

describe("crm model schemas", () => {
  it("sprint-extract.ts (DRAFT_SCHEMA) asks for exactly what the hand-written schema asked for", () => {
    expect(canonicalSchema(jsonSchemaFor(sprintBriefOutput_sprint_extract))).toEqual(canonicalSchema(BEFORE_0));
  });

});
