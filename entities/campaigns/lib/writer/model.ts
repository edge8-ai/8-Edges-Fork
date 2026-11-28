import { bannedLanguageRule } from "./checks";
import { aiSite, callBudget } from "@/kernel/ai/gateway";
import { fillPrompt, type Prompt } from "@/kernel/ai/prompts";
import type { AiDataClass } from "@/kernel/ai/routing";
import { jsonSchemaFor, readStructuredOutput } from "@/kernel/ai/response";
import type { z } from "zod/v4";

// One model call per step, one way to make it (and, through
// callCheckedWriterModel below, one named retry when the step's own checks
// refuse the answer). Every step runs at high effort
// with a structured-output schema, and reads the reply
// through readStructuredOutput so the tokens land on the routine_runs row the
// cron opened and the reply is checked against the schema it was asked for.
// The step hands over one Zod schema: this generates the json_schema from it
// and validates the reply through it, so the two cannot drift (ADR 0006).
//
// The budget is well above the copy (a 2,500-word post is about 4k tokens; on
// Fable, max_tokens also covers thinking), and the request asks for a long
// timeout because the shared client default was sized for Sonnet. The gateway
// fits it inside the step route's 300 s (Y.39): 280 s and no retry, so a hung
// call fails as an error the step's run records, not as a killed function.

// Each step is its own site with its own data class (plan Part C1): the
// personal draft reads one person's context (S), the letter's fact-gathering
// reads internal material (C), the campaign plan stays inside (B), and the
// rest is copy that gets published (A). The B and A steps share the
// `brand-writer` model, and each step's own AI_MODEL_WRITER_<STEP> moves that
// step alone (Y.71.1), so the eval's winner per step can be set one step at a
// time. The S and C steps resolve under their own names on Sonnet 5, because
// the brand writer runs on Fable, which Anthropic keeps for 30 days and the
// gateway refuses for S and C (Y.73); check:ai-routing fails either one
// pointed at Fable.
export const WRITER_PERSONAL_DRAFT_CLASS: AiDataClass = "S";
export const WRITER_LETTER_GATHER_CLASS: AiDataClass = "C";
export const WRITER_PLAN_CLASS: AiDataClass = "B";
export const WRITER_PUBLISHED_CLASS: AiDataClass = "A";

const WRITER_SITES = {
  "personal-draft": aiSite({ site: "writer-personal-draft", dataClass: WRITER_PERSONAL_DRAFT_CLASS, tier: "standard" }),
  "letter-gather": aiSite({ site: "writer-letter-gather", dataClass: WRITER_LETTER_GATHER_CLASS, tier: "standard" }),
  "letter-write": aiSite({ site: "writer-letter-write", modelSite: "brand-writer", dataClass: WRITER_PUBLISHED_CLASS, tier: "frontier" }),
  plan: aiSite({ site: "writer-plan", modelSite: "brand-writer", dataClass: WRITER_PLAN_CLASS, tier: "frontier" }),
  "series-intro": aiSite({ site: "writer-series-intro", modelSite: "brand-writer", dataClass: WRITER_PUBLISHED_CLASS, tier: "frontier" }),
  edit: aiSite({ site: "writer-edit", modelSite: "brand-writer", dataClass: WRITER_PUBLISHED_CLASS, tier: "frontier" }),
  seo: aiSite({ site: "writer-seo", modelSite: "brand-writer", dataClass: WRITER_PUBLISHED_CLASS, tier: "frontier" }),
  links: aiSite({ site: "writer-links", modelSite: "brand-writer", dataClass: WRITER_PUBLISHED_CLASS, tier: "frontier" }),
  channels: aiSite({ site: "writer-channels", modelSite: "brand-writer", dataClass: WRITER_PUBLISHED_CLASS, tier: "frontier" }),
  assemble: aiSite({ site: "writer-assemble", modelSite: "brand-writer", dataClass: WRITER_PUBLISHED_CLASS, tier: "frontier" }),
  exhibits: aiSite({ site: "writer-exhibits", modelSite: "brand-writer", dataClass: WRITER_PUBLISHED_CLASS, tier: "frontier" }),
} as const;

export type WriterStep = keyof typeof WRITER_SITES;

const MAX_TOKENS = 32_000;
const TIMEOUT_MS = 600_000;

export type ModelResult<T> = { ok: true; data: T } | { ok: false; error: string };

// Each step's schema is a module-level const, so the derived json_schema is
// derived once per step rather than once per call.
const wireSchemas = new WeakMap<object, Record<string, unknown>>();
function wireSchemaFor(schema: z.ZodType): Record<string, unknown> {
  const cached = wireSchemas.get(schema);
  if (cached) return cached;
  const derived = jsonSchemaFor(schema);
  wireSchemas.set(schema, derived);
  return derived;
}

// The step hands over its versioned prompt (Z.6.1) with the texts it rendered
// from it. The gateway records the prompt's `name@version` on the ai_calls row
// and refuses one named after another step, so a step cannot send its
// neighbour's prompt under its own site.
export async function callWriterModel<S extends z.ZodType>(input: {
  step: WriterStep;
  prompt: Prompt;
  system: string;
  user: string;
  schema: S;
  /** Asked of the gateway, which caps it inside the step's route. */
  timeoutMs?: number;
}): Promise<ModelResult<z.infer<S>>> {
  const ai = WRITER_SITES[input.step];
  const llm = ai.clientIfConfigured();
  if (!llm) return { ok: false, error: "ANTHROPIC_API_KEY is not configured." };
  try {
    const response = await llm.messages.create(
      {
        prompt: input.prompt,
        model: ai.model,
        max_tokens: MAX_TOKENS,
        system: input.system,
        output_config: { effort: "high", format: { type: "json_schema", schema: wireSchemaFor(input.schema) } },
        messages: [{ role: "user", content: input.user }],
      },
      { timeout: input.timeoutMs ?? TIMEOUT_MS },
    );
    return readStructuredOutput(
      ai.site,
      ai.model,
      response,
      input.schema,
      `The model declined the ${input.step} step.`,
    );
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** What a step's own checks make of one answer: the value it keeps, or what failed. */
type Verdict<T> =
  | { ok: true; value: T }
  // `retry: false` marks a failure no second answer can fix, such as a style
  // the campaign plan settled before this step ran.
  | { ok: false; failures: string[]; retry?: boolean };

/** A step prompt with a `retry` part: the note, with a {{failures}} slot, appended to the user message. */
type RetryPrompt = Prompt & { readonly parts: { readonly retry: string } };

/**
 * What one writer step's model calls may spend between them: the gateway's
 * budget for a call in the step's route (callBudget, Y.39). The writer sites
 * declare no routeSeconds, so the gateway's default route applies, the same
 * 300 s the step route has (run-step.ts).
 */
export function stepCallBudgetMs(): number {
  return callBudget(undefined, Number.POSITIVE_INFINITY).timeout;
}

// What a step needs once an answer passes, by default: saving it.
const AFTER_DEFAULT_MS = 10_000;

/**
 * One model call and the step's checks on its answer, with one retry inside
 * the step that names every failed check (Y.96).
 *
 * Without it, a step whose answer failed a check returned the error and kept
 * nothing, and the agent driver sent the identical request five minutes later
 * with no word of what failed. In October that threw away 20 USD of answers,
 * the same unsupported chart figure four times in a row. The SEO step already
 * retried this way and lost no run, so the retry note is SEO's: the unchanged
 * request, then the failures as a list.
 *
 * The retry gets what is left of the step's call budget after the first call
 * and after `afterMs`, kept back for what the step does next (saving, images,
 * or a later model call). It runs only when the gateway would grant that
 * timeout no SDK retry of its own: the gateway counts a call's retries from the
 * start of the route, so a call short enough to be granted one, started this
 * late, could outlive the route, and has too little time to hold a slow answer
 * anyway. Then the failure stands and the driver's next tick retries, as before.
 */
export async function callCheckedWriterModel<S extends z.ZodType, T>(input: {
  step: WriterStep;
  prompt: RetryPrompt;
  system: string;
  user: string;
  schema: S;
  check: (data: z.infer<S>) => Verdict<T> | Promise<Verdict<T>>;
  /** Prefixed to the failures in the step's error ("Edit: ..."); omit when each failure names its own place. */
  label?: string;
  /** Time the step needs after an answer passes, kept out of the retry's budget. */
  afterMs?: number;
}): Promise<ModelResult<T>> {
  const started = Date.now();
  const { check, label, afterMs = AFTER_DEFAULT_MS, ...call } = input;
  const failed = (failures: string[]): ModelResult<T> => ({
    ok: false,
    error: label ? `${label}: ${failures.join(" ")}` : failures.join(" "),
  });

  const first = await callWriterModel(call);
  if (!first.ok) return first;
  const verdict = await check(first.data);
  if (verdict.ok) return { ok: true, data: verdict.value };
  if (verdict.retry === false) return failed(verdict.failures);

  const timeoutMs = stepCallBudgetMs() - (Date.now() - started) - afterMs;
  if (timeoutMs <= 0 || callBudget(undefined, timeoutMs).maxRetries > 0) return failed(verdict.failures);

  const note = fillPrompt(call.prompt.parts.retry, { failures: verdict.failures.map((f) => `- ${f}`).join("\n") });
  const second = await callWriterModel({ ...call, user: call.user + note, timeoutMs });
  if (!second.ok) return second;
  const again = await check(second.data);
  return again.ok ? { ok: true, data: again.value } : failed(again.failures);
}

// The brand facts every step's system prompt opens with. Each step appends the
// lens it applies; nothing about the copy is decided here. It stays a function
// here rather than in a prompt file because every step's prompt shares it and
// it is mostly the brand profile's own fields; each step's prompt takes it
// through a {{preamble}} slot. The house rules at its end are authored text,
// so an edit to them does not change any step's prompt version. A step whose
// output the banned-language check reads passes the campaign brief, so the
// rule the model sees excepts the same terms the check will (see checks.ts).
export function brandPreamble(p: {
  brandName: string;
  positioning: string | null;
  audience: string | null;
  offer: string | null;
  primaryCta: string | null;
  authorMd: string | null;
  voiceMd: string | null;
  rulesMd: string | null;
}, brief?: string | null): string {
  const s = (v: string | null) => v ?? "(not set)";
  return `# Brand: ${p.brandName}

## Positioning
${s(p.positioning)}

## Audience
${s(p.audience)}

## What we sell
${s(p.offer)}

## Default call to action
${s(p.primaryCta)}

## Author and credentials
${s(p.authorMd)}

## Voice
${s(p.voiceMd)}

## Hard rules (never break these)
${s(p.rulesMd)}

## House rules (hold for every brand)
- Write the brand name exactly as given above. Never all caps.
- Never use an em dash anywhere. Use a comma, colon, period or parentheses.
- ${bannedLanguageRule(brief)}
- Do not invent facts, numbers, quotes or sources. Everything factual comes from the source material.
- Return through the provided schema only.`;
}
