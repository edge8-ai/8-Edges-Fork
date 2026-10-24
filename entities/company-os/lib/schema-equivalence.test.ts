import { broadcastTakeawayOutput as broadcastTakeawayOutput_broadcast_takeaway } from "./ai/broadcast-takeaway";

import { describe, expect, it } from "vitest";
import { jsonSchemaFor } from "@/kernel/ai/response";
import { canonicalSchema } from "@/kernel/ai/testing/schema-equivalence";

// The json_schema each of company-os's model calls sent until A.4, kept verbatim
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
    "takeaway"
  ],
  "properties": {
    "takeaway": {
      "type": "string",
      "description": "One sentence, at most ~25 words, naming the single most useful thing these numbers say (what worked or what underperformed). No preamble, no restating every metric."
    }
  }
} as const;

describe("company-os model schemas", () => {
  it("ai/broadcast-takeaway.ts (SCHEMA) asks for exactly what the hand-written schema asked for", () => {
    expect(canonicalSchema(jsonSchemaFor(broadcastTakeawayOutput_broadcast_takeaway))).toEqual(canonicalSchema(BEFORE_0));
  });

});
