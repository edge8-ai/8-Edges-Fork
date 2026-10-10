import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod/v4";
import { recordAiUsage, type AiUsage } from "@/kernel/audit/routine-runs";
import { log } from "@/kernel/config/log";
import { zodIssuesToMessage } from "@/kernel/config/schemas";

/**
 * One place where every Anthropic response is turned into text, and the only
 * place token usage is recorded.
 *
 * Two things every call site used to get wrong on its own:
 *
 *  - `stop_reason: "max_tokens"` was never checked. On a structured-output call
 *    that leaves truncated JSON, and the bare `JSON.parse` downstream throws a
 *    SyntaxError that reads like an API outage. It is named here instead, so a
 *    too-small budget is diagnosable from the stored ai_error.
 *  - `usage` was never read anywhere, so no route could be attributed a cost
 *    and prompt-cache hits could not be confirmed. Every call logs one line.
 */

/**
 * Emit one greppable line per model call.
 *
 * `ai-usage` is the grep handle (the `msg` field) in the Vercel runtime logs; `site` is what
 * makes the bill attributable to a feature rather than to the project as a
 * whole. `cache_read` is the number to watch on the agent loops — if it stays
 * at 0 across a multi-turn conversation, a breakpoint is missing or something
 * volatile is invalidating the prefix.
 */
export function logAiUsage(site: string, model: string, usage: AiUsage | null | undefined): void {
  if (!usage) return;
  // Attribute the call to the scheduled routine that is running, if any.
  recordAiUsage(usage);
  log("info", "ai-usage", {
    site,
    model,
    in: usage.input_tokens,
    out: usage.output_tokens,
    cache_read: usage.cache_read_input_tokens ?? 0,
    cache_write: usage.cache_creation_input_tokens ?? 0,
  });
}

export type TextOutput = { ok: true; text: string } | { ok: false; error: string };

/**
 * Log usage, then pull the text block out of a response — refusing on the two
 * stop reasons that produce unusable output.
 *
 * Callers map `{ ok: false }` onto whatever their own failure contract is
 * (ai_error, null, a thrown Err); none of them should be parsing content
 * without going through here first.
 */
export function readTextOutput(
  site: string,
  model: string,
  response: Anthropic.Message,
  refusalMessage = "The model declined this request.",
): TextOutput {
  logAiUsage(site, model, response.usage);

  if (response.stop_reason === "refusal") {
    return { ok: false, error: refusalMessage };
  }
  if (response.stop_reason === "max_tokens") {
    return {
      ok: false,
      error:
        `The response hit the max_tokens cap after ${response.usage?.output_tokens ?? "?"} output ` +
        `tokens and was cut off mid-output. Raise max_tokens for this call.`,
    };
  }

  const block = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  if (!block || !block.text.trim()) return { ok: false, error: "Model returned no text output." };
  return { ok: true, text: block.text };
}

/**
 * The JSON schema sent to the model, derived from the Zod schema that will
 * validate its reply.
 *
 * One artifact, two jobs. The alternative — a hand-written `json_schema` const
 * beside a hand-written Zod "runtime mirror" of it — is what sixteen call sites
 * did before A.3, and two hand-synced artifacts are the drift ADR 0006 exists
 * to close.
 *
 * `zod/v4` is a subpath of the installed zod 3.25, not an upgrade. The emitter
 * only accepts v4 schema objects, so a model-output schema is authored with
 * `import { z } from "zod/v4"` while action inputs stay on the classic import.
 * Mixing the two versions inside one schema is what breaks; using each in its
 * own file is what the subpath is for.
 *
 * Two departures from the emitter's output, both deliberate:
 *
 *  - `$schema` is stripped. The structured-output API has no use for it, and
 *    leaving it in would make every schema differ from the hand-written one it
 *    replaces for a reason that is not about the shape.
 *  - Nothing else is rewritten. In particular `.nullable()` emits
 *    `anyOf: [{type:"X"}, {type:"null"}]` where the hand-written schemas wrote
 *    `type: ["X","null"]` — semantically identical, textually different on the
 *    wire, and confirmed against a live call before the sweep rather than
 *    assumed. If that ever regresses output quality, the fix is a rewrite here,
 *    which keeps one Zod artifact and the old wire format.
 *
 * Never pass `io: "input"`: it silently drops `additionalProperties: false`,
 * which is the part of the schema that stops the model inventing keys.
 */
export function jsonSchemaFor(schema: z.ZodType): Record<string, unknown> {
  const emitted = z.toJSONSchema(schema) as Record<string, unknown>;
  delete emitted.$schema;
  stripSafeIntegerBounds(emitted);
  assertNoRefusedBounds(emitted, "$");
  return emitted;
}

/**
 * Drop the `minimum`/`maximum` the emitter attaches to an integer.
 *
 * `z.number().int()` emits `minimum: -(2^53-1)` and `maximum: 2^53-1` — the
 * emitter saying "a JavaScript-safe integer", not the author asking the model
 * for a range. The hand-written schemas it replaces wrote a bare
 * `type: "integer"`, and a bound in the request is a bound the model is told
 * to respect, so it is removed for the same reason `$schema` is. A bound the
 * author did write (`.max(100)`) is never this value, survives, and is refused
 * by `assertNoRefusedBounds`.
 */
function stripSafeIntegerBounds(node: unknown): void {
  if (Array.isArray(node)) {
    node.forEach(stripSafeIntegerBounds);
    return;
  }
  if (node === null || typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  if (obj.type === "integer") {
    if (obj.minimum === -Number.MAX_SAFE_INTEGER) delete obj.minimum;
    if (obj.maximum === Number.MAX_SAFE_INTEGER) delete obj.maximum;
  }
  for (const value of Object.values(obj)) stripSafeIntegerBounds(value);
}

/** The numeric keywords the structured-output API refuses on an integer or a number. */
const REFUSED_NUMBER_BOUNDS = ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf"] as const;

/**
 * The structured-output API refuses bounds it cannot enforce while sampling.
 * On an array, `minItems` other than 0 or 1 is a 400 ("For 'array' type,
 * 'minItems' values other than 0 or 1 are not supported") and `maxItems` is
 * refused outright; that 400 was a real run, stopped at the campaigns SEO step.
 * On an integer or a number every bound is refused ("For 'integer' type,
 * property 'minimum' is not supported", checked against a live call for each
 * keyword). That one was the receipt reader's `.nonnegative()`: every receipt
 * read failed from launch until 2026-10-08, and a real claim reached its
 * checker with no reading on any of its receipts. The API's message names the
 * keyword and not the file, so the failure arrives at the wrong end of the stack.
 *
 * A derived schema is a module-level const, so throwing here fails the import
 * — the test run or the build — rather than a request in production. Counts
 * and ranges belong in a `.describe()`, where the model reads them, and in the
 * server-side check after the call, where they are enforced.
 */
function assertNoRefusedBounds(node: unknown, path: string): void {
  if (Array.isArray(node)) {
    node.forEach((child, i) => assertNoRefusedBounds(child, `${path}[${i}]`));
    return;
  }
  if (node === null || typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  if ("maxItems" in obj) {
    throw new Error(`${path}: the structured-output API refuses maxItems. Put the count in .describe() and check it after the call.`);
  }
  if ("minItems" in obj && obj.minItems !== 0 && obj.minItems !== 1) {
    throw new Error(`${path}: the structured-output API refuses minItems ${String(obj.minItems)}; only 0 and 1 are accepted.`);
  }
  if (obj.type === "integer" || obj.type === "number") {
    const bound = REFUSED_NUMBER_BOUNDS.find((key) => key in obj);
    if (bound) throw new Error(`${path}: the structured-output API refuses ${bound} on type ${String(obj.type)}. Put the range in .describe() and check it after the call.`);
  }
  for (const [key, value] of Object.entries(obj)) assertNoRefusedBounds(value, `${path}.${key}`);
}

export type StructuredOutput<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Read a structured-output response: usage, stop reason, JSON, shape.
 *
 * Structured output is a request, not a guarantee, so the reply is parsed
 * through the same Zod schema `jsonSchemaFor` derived the request's
 * `json_schema` from. Callers get a typed object or a sentence, and map the
 * sentence onto whatever their own failure contract already is — `{ok:false}`,
 * `null`, or an `ai_error` stamp. None of them should be casting.
 *
 * Delegating to `readTextOutput` rather than replacing it keeps that function's
 * 38 call sites — the streaming, tool-loop and free-text ones that have no
 * schema — untouched.
 */
export function readStructuredOutput<S extends z.ZodType>(
  site: string,
  model: string,
  response: Anthropic.Message,
  schema: S,
  refusalMessage?: string,
): StructuredOutput<z.infer<S>> {
  const out = readTextOutput(site, model, response, refusalMessage);
  if (!out.ok) return out;

  let raw: unknown;
  try {
    raw = JSON.parse(out.text);
  } catch (e) {
    return { ok: false, error: `The model returned invalid JSON: ${e instanceof Error ? e.message : String(e)}` };
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const error = zodIssuesToMessage(parsed.error.issues);
    // Greppable as `ai-schema-violation`. Retrying with the error fed back to
    // the model was costed and deferred; this line is what will say whether
    // that ticket is worth opening, so it is a log and not a silent return.
    log("warn", "ai-schema-violation", { site, model, error });
    return { ok: false, error };
  }
  return { ok: true, data: parsed.data };
}
