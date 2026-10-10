import { canonicalSchema } from "@/kernel/ai/testing/schema-equivalence";
import { describe, expect, it, vi } from "vitest";

// The module reaches Supabase and the model client at import time; neither is
// what this file is about. Only the schema is.
vi.mock("@/kernel/data/supabase", () => ({ supabase: {}, companyOs: {} }));
vi.mock("@/kernel/ai/client", () => ({ anthropicIfConfigured: () => null }));
vi.mock("@/kernel/ai/models", () => ({ modelFor: () => "claude-test-model", siteModelFor: () => "claude-test-model", hostFor: () => null, fallbackFor: () => null }));
vi.mock("@/entities/org", () => ({ selectCoreValues: () => ({}) }));

const { PANELIST_SCHEMA, panelistOutput } = await import("./interview-panelist");

// The hand-written json_schema this module sent the model until A.3, kept
// verbatim so the derived one can be proved equal to it. It is deleted from
// the module, not from the record: transcription is the risk the whole card is
// about, and a schema that is valid but subtly different is exactly what a
// reviewer misses and a deep-equal does not.
//
// Delete this fixture when the derived schema has been live long enough that
// "what it used to be" stops being the question — not before.
const HAND_WRITTEN = {
  type: "object",
  additionalProperties: false,
  required: ["recommendation", "overall_score", "criteria", "verified", "still_open", "next_round_questions", "summary"],
  properties: {
    recommendation: {
      type: "string",
      enum: ["advance", "hold", "reject"],
      description: "advance = move to the next round or offer; hold = borderline, needs more signal; reject = do not proceed.",
    },
    overall_score: {
      type: "number",
      description: "Overall read of the candidate in THIS round, 1.0 to 5.0 with one decimal. 5 = outstanding, 3 = solid with gaps, 1 = poor. Use the full range.",
    },
    criteria: {
      type: "array",
      description: "One entry per criterion you were asked to score. Score only from transcript evidence.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "score", "evidence", "confidence"],
        properties: {
          name: { type: "string", description: "The criterion name, exactly as given." },
          score: {
            type: ["number", "null"],
            description: "1 to 5, or null if this round genuinely did not test this criterion. Never invent a score.",
          },
          evidence: {
            type: "string",
            description:
              "A short verbatim quote from the transcript that justifies the score, with the speaker timestamp, e.g. 'one main agent can spin up a lot of agent' (08:10). If the criterion was not tested, say so in one line.",
          },
          confidence: {
            type: "string",
            enum: ["high", "low"],
            description: "low when the supporting quote is garbled by transcription or the signal is thin.",
          },
        },
      },
    },
    verified: {
      type: "array",
      items: { type: "string" },
      description: "What this round confirmed about the candidate, each tied to evidence. Empty if nothing was confirmed.",
    },
    still_open: {
      type: "array",
      items: { type: "string" },
      description: "Claims or gaps this round did not resolve (e.g. a resume claim never probed). Empty if none.",
    },
    next_round_questions: {
      type: "array",
      items: { type: "string" },
      description: "Concrete questions the next interviewer should ask to close the open items. Empty if this was the final round.",
    },
    summary: {
      type: "string",
      description: "2-4 sentences: the overall read on the candidate from this round, in plain language.",
    },
  },
};

describe("PANELIST_SCHEMA", () => {
  it("asks the model for exactly what the hand-written schema asked for", () => {
    expect(canonicalSchema(PANELIST_SCHEMA)).toEqual(canonicalSchema(HAND_WRITTEN));
  });

  it("pins the derived JSON so a zod patch bump cannot change the request silently", () => {
    // The equivalence test above runs through a normaliser and would not see a
    // change the normaliser happens to absorb. This one compares the bytes.
    expect(PANELIST_SCHEMA).toMatchSnapshot();
  });

  it("carries no array bound the structured-output API refuses", () => {
    const seen = JSON.stringify(PANELIST_SCHEMA);
    expect(seen).not.toContain("maxItems");
    expect(seen).not.toMatch(/"minItems":\s*(?![01][,}])/);
  });
});

describe("panelistOutput", () => {
  it("rejects a reply the model got wrong before any scorecard is written", () => {
    // The pre-A.3 path cast this straight into writeScorecard.
    const bad = { recommendation: "maybe", overall_score: 4, criteria: [], verified: [], still_open: [], next_round_questions: [], summary: "s" };
    expect(panelistOutput.safeParse(bad).success).toBe(false);
  });

  it("accepts a null criterion score, which is how the model says 'not tested'", () => {
    const good = {
      recommendation: "advance",
      overall_score: 4.2,
      criteria: [{ name: "Craft", score: null, evidence: "not tested", confidence: "low" }],
      verified: [],
      still_open: [],
      next_round_questions: [],
      summary: "Solid.",
    };
    expect(panelistOutput.safeParse(good).success).toBe(true);
  });
});
