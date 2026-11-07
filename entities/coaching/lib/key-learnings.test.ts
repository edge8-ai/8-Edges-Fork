import { describe, expect, it } from "vitest";
import { guardLearnings, keyLearningsOutput } from "./key-learnings";
import { jsonSchemaFor } from "@/kernel/ai/response";

// The count guard after the call, and the schema the request carries: the
// structured-output API refuses array bounds, so the schema must not carry any.

describe("guardLearnings", () => {
  it("drops blanks and keeps a list of three to eight", () => {
    expect(guardLearnings([" Plan first ", "", "Ship small", "   ", "Measure it"])).toEqual({
      ok: true,
      items: ["Plan first", "Ship small", "Measure it"],
    });
  });

  it("refuses fewer than three", () => {
    expect(guardLearnings(["Plan first", "Ship small"])).toMatchObject({ ok: false, error: expect.stringContaining("2 learnings") });
  });

  it("refuses more than eight", () => {
    expect(guardLearnings(Array.from({ length: 9 }, (_, i) => `Learning ${i}`))).toMatchObject({
      ok: false,
      error: expect.stringContaining("9 learnings"),
    });
  });
});

describe("keyLearningsOutput", () => {
  it("emits a schema with no array bounds", () => {
    const schema = jsonSchemaFor(keyLearningsOutput) as { properties: { learnings: Record<string, unknown> } };
    expect(schema.properties.learnings.type).toBe("array");
    expect(schema.properties.learnings).not.toHaveProperty("minItems");
    expect(schema.properties.learnings).not.toHaveProperty("maxItems");
  });
});
