import type Anthropic from "@anthropic-ai/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod/v4";
import { fakeJsonMessage, fakeMessage } from "./testing/fake-message";

// `recordAiUsage` reaches Supabase through the routine-run store and `log`
// reaches next/headers; neither is what this file is about, so both are
// replaced. The spies double as the assertion that usage is recorded on every
// path, refusals included — the whole point of funnelling responses through
// one reader is that no call escapes the meter.
const recordAiUsage = vi.fn();
const log = vi.fn();
vi.mock("@/kernel/audit/routine-runs", () => ({ recordAiUsage: (u: unknown) => recordAiUsage(u) }));
vi.mock("@/kernel/config/log", () => ({ log: (...a: unknown[]) => log(...a) }));

const { logAiUsage, readTextOutput, readStructuredOutput, jsonSchemaFor } = await import("./response");

const USAGE = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 2 };

function response(over: Partial<Anthropic.Message> = {}): Anthropic.Message {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-x",
    content: [{ type: "text", text: "hello", citations: null }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: USAGE,
    ...over,
  } as Anthropic.Message;
}

beforeEach(() => {
  recordAiUsage.mockClear();
  log.mockClear();
});

describe("readTextOutput", () => {
  it("returns the first text block on a normal completion", () => {
    expect(readTextOutput("site", "claude-x", response())).toEqual({ ok: true, text: "hello" });
  });

  it("returns the first text block even when a tool_use precedes it", () => {
    const r = response({
      content: [
        { type: "tool_use", id: "tu_1", name: "search", input: {} },
        { type: "text", text: "answer", citations: null },
      ] as Anthropic.Message["content"],
    });
    expect(readTextOutput("site", "claude-x", r)).toEqual({ ok: true, text: "answer" });
  });

  it("refuses on stop_reason refusal, with the caller's message", () => {
    const r = response({ stop_reason: "refusal" });
    expect(readTextOutput("site", "claude-x", r)).toEqual({
      ok: false,
      error: "The model declined this request.",
    });
    expect(readTextOutput("site", "claude-x", r, "Nope.")).toEqual({ ok: false, error: "Nope." });
  });

  it("names max_tokens rather than letting a downstream JSON.parse throw", () => {
    // Truncated JSON downstream reads like an API outage; the cap is the real
    // cause, so it has to be in the stored error.
    const out = readTextOutput("site", "claude-x", response({ stop_reason: "max_tokens" }));
    expect(out.ok).toBe(false);
    expect(out.ok === false && out.error).toContain("max_tokens");
    expect(out.ok === false && out.error).toContain("5 output");
  });

  it("says `?` for the token count when a truncated response carries no usage", () => {
    const r = response({ stop_reason: "max_tokens", usage: undefined as never });
    const out = readTextOutput("site", "claude-x", r);
    expect(out.ok === false && out.error).toContain("after ? output");
  });

  it("refuses when the response carries no text block at all", () => {
    const r = response({
      content: [{ type: "tool_use", id: "tu_1", name: "search", input: {} }] as Anthropic.Message["content"],
    });
    expect(readTextOutput("site", "claude-x", r)).toEqual({
      ok: false,
      error: "Model returned no text output.",
    });
  });

  it("refuses on an empty content array", () => {
    const out = readTextOutput("site", "claude-x", response({ content: [] }));
    expect(out).toEqual({ ok: false, error: "Model returned no text output." });
  });

  it("refuses a text block that is only whitespace", () => {
    const r = response({
      content: [{ type: "text", text: "  \n\t ", citations: null }] as Anthropic.Message["content"],
    });
    expect(readTextOutput("site", "claude-x", r)).toEqual({
      ok: false,
      error: "Model returned no text output.",
    });
  });

  it("returns text untrimmed once it has any non-whitespace", () => {
    const r = response({
      content: [{ type: "text", text: "  padded  ", citations: null }] as Anthropic.Message["content"],
    });
    expect(readTextOutput("site", "claude-x", r)).toEqual({ ok: true, text: "  padded  " });
  });

  it("records and logs usage on every path, refusals included", () => {
    readTextOutput("site", "claude-x", response({ stop_reason: "refusal" }));
    expect(recordAiUsage).toHaveBeenCalledWith(USAGE);
    expect(log).toHaveBeenCalledWith("info", "ai-usage", expect.objectContaining({
      site: "site",
      model: "claude-x",
      in: 10,
      out: 5,
      cache_read: 2,
      cache_write: 0,
    }));
  });
});

describe("logAiUsage", () => {
  it("does nothing at all when there is no usage to report", () => {
    logAiUsage("site", "claude-x", null);
    logAiUsage("site", "claude-x", undefined);
    expect(recordAiUsage).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it("defaults the two cache counters to 0 rather than logging null", () => {
    logAiUsage("site", "claude-x", { input_tokens: 1, output_tokens: 2 });
    expect(log).toHaveBeenCalledWith("info", "ai-usage", expect.objectContaining({
      cache_read: 0,
      cache_write: 0,
    }));
  });
});

// One schema exercising the shapes the sixteen converted sites actually use:
// an enum, a nullable number, an object inside an array, and a plain string
// array. No array bounds — the structured-output API 400s on those.
const reply = z.object({
  verdict: z.enum(["yes", "no"]).describe("The call."),
  score: z.number().nullable(),
  notes: z.array(z.string()),
  parts: z.array(z.object({ name: z.string(), weight: z.number() })),
});

const VALID = { verdict: "yes", score: null, notes: ["a"], parts: [{ name: "x", weight: 1 }] };

/** Walk a JSON schema by key, so a test can name a nested node without casting to any. */
function at(schema: unknown, ...path: string[]): Record<string, unknown> {
  let node = schema as Record<string, unknown>;
  for (const key of path) node = node[key] as Record<string, unknown>;
  return node;
}

describe("jsonSchemaFor", () => {
  it("strips $schema, which the structured-output API has no use for", () => {
    expect(jsonSchemaFor(reply)).not.toHaveProperty("$schema");
  });

  it("emits additionalProperties: false at every object level", () => {
    // This is the key that stops the model inventing fields, and it is what
    // `io: "input"` silently drops — hence the rule never to pass it.
    const schema = jsonSchemaFor(reply);
    expect(schema.additionalProperties).toBe(false);
    expect(at(schema, "properties", "parts", "items").additionalProperties).toBe(false);
  });

  it("keeps a nullable field required and carries .describe() to the model", () => {
    // `required` is about presence, not nullness: a schema that let the model
    // omit `score` would be a different request from the hand-written one.
    const schema = jsonSchemaFor(reply);
    expect(schema.required).toContain("score");
    expect(at(schema, "properties", "verdict").description).toBe("The call.");
  });

  it("throws on an array bound the structured-output API refuses", () => {
    // The API answers this with a 400 naming the keyword and not the file. A
    // derived schema is a module-level const, so the import is where it fails.
    expect(() => jsonSchemaFor(z.object({ tags: z.array(z.string()).min(3) }))).toThrow(/minItems 3/);
    expect(() => jsonSchemaFor(z.object({ tags: z.array(z.string()).max(5) }))).toThrow(/maxItems/);
    expect(() => jsonSchemaFor(z.object({ tags: z.array(z.string()).min(1) }))).not.toThrow();
  });

  it("throws on a numeric bound the structured-output API refuses", () => {
    // The receipt reader's `.nonnegative()` was this 400 on every read.
    expect(() => jsonSchemaFor(z.object({ amount: z.number().int().nonnegative().nullable() }))).toThrow(/minimum on type integer/);
    expect(() => jsonSchemaFor(z.object({ score: z.number().max(5) }))).toThrow(/maximum on type number/);
    expect(() => jsonSchemaFor(z.object({ score: z.number().positive() }))).toThrow(/exclusiveMinimum/);
  });

  it("drops the safe-integer range a bare .int() emits, which nobody asked for", () => {
    const schema = jsonSchemaFor(z.object({ count: z.number().int() }));
    expect(at(schema, "properties", "count")).toEqual({ type: "integer" });
  });
});

describe("readStructuredOutput", () => {
  it("returns typed data when the reply matches the schema", () => {
    const out = readStructuredOutput("site", "claude-x", fakeJsonMessage(VALID), reply);
    expect(out).toEqual({ ok: true, data: VALID });
  });

  it("returns the site's failure contract when the shape is wrong", () => {
    // The whole point: structured output is a request, not a guarantee. Before
    // this, a wrong shape was cast and written to the database unchecked.
    const bad = { ...VALID, verdict: "maybe" };
    const out = readStructuredOutput("site", "claude-x", fakeJsonMessage(bad), reply);
    expect(out.ok).toBe(false);
    expect(out.ok === false && out.error).toContain("verdict");
  });

  it("names the missing field rather than dumping the ZodError", () => {
    const out = readStructuredOutput("site", "claude-x", fakeJsonMessage({ verdict: "yes" }), reply);
    expect(out.ok === false && out.error).toContain("score");
    expect(out.ok === false && out.error).toContain("notes");
  });

  it("logs a schema violation so the deferred retry ticket is decidable", () => {
    readStructuredOutput("site", "claude-x", fakeJsonMessage({}), reply);
    expect(log).toHaveBeenCalledWith("warn", "ai-schema-violation", expect.objectContaining({
      site: "site",
      model: "claude-x",
    }));
  });

  it("reports unparseable text as invalid JSON, not as a schema failure", () => {
    const out = readStructuredOutput("site", "claude-x", fakeMessage({ text: "not json" }), reply);
    expect(out.ok === false && out.error).toContain("invalid JSON");
  });

  it("passes the caller's refusal message straight through readTextOutput", () => {
    const r = fakeMessage({ stopReason: "refusal" });
    const out = readStructuredOutput("site", "claude-x", r, reply, "No scoring today.");
    expect(out).toEqual({ ok: false, error: "No scoring today." });
  });

  it("still meters a response whose shape is wrong", () => {
    // Usage is billed whatever the shape was, so the meter must not be behind
    // the validation gate.
    readStructuredOutput("site", "claude-x", fakeJsonMessage({}), reply);
    expect(recordAiUsage).toHaveBeenCalled();
  });
});
