import { sprintDraftOutput as sprintDraftOutput_sprint_draft } from "./sprint-draft";

import { describe, expect, it } from "vitest";
import { jsonSchemaFor } from "@/kernel/ai/response";
import { canonicalSchema } from "@/kernel/ai/testing/schema-equivalence";

// The json_schema each of boards's model calls sent until A.4, kept verbatim
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
    "theme",
    "goal"
  ],
  "properties": {
    "theme": {
      "type": [
        "string",
        "null"
      ],
      "description": "Two to five words in Title Case naming what the week is for, with no punctuation. null when the cards do not suggest one."
    },
    "goal": {
      "type": [
        "string",
        "null"
      ],
      "description": "One or two plain sentences saying what will be true at the end of the week, specific to the open cards. null when the cards do not suggest one."
    }
  }
} as const;

describe("boards model schemas", () => {
  it("sprint-draft.ts (SCHEMA) asks for exactly what the hand-written schema asked for", () => {
    expect(canonicalSchema(jsonSchemaFor(sprintDraftOutput_sprint_draft))).toEqual(canonicalSchema(BEFORE_0));
  });

});
