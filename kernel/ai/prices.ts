import type { AiUsage } from "@/kernel/audit/routine-runs";

/**
 * What a model call costs, from a versioned price table (Y.76, plan C7).
 *
 * Every ai_calls row gets a cost_usd. OpenRouter reports a call's cost in its
 * usage; Anthropic and Gemini do not, so until this table every row in
 * production read null and no feature could be priced or a model change
 * measured. The prices are list prices in USD per million tokens, read on the
 * date below from https://openrouter.ai/api/v1/models, which carries each
 * lab's own list price (Anthropic's for Claude). A provider-reported cost is
 * kept where one arrives, and this table is the cross-check (calls.ts).
 *
 * When a price changes, change the row and the date together: a cost is only
 * as true as the day its prices were read.
 */

export const PRICES_READ_ON = "2026-10-09";

export type ModelPrice = {
  /** Uncached input, USD per million tokens. */
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
};

// Keyed by the model id as the request spells it: the Anthropic API's own
// spelling for Claude, OpenRouter's slug for everything routed there, and
// Gemini's own id for the image call.
const PRICES: Readonly<Record<string, ModelPrice>> = {
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25, cacheWrite: 12.5 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
  "gemini-2.5-flash-image": { input: 0.3, output: 2.5, cacheRead: 0.03, cacheWrite: 0.0833 },
  "deepseek/deepseek-v4.1-flash": { input: 0.0283, output: 1, cacheRead: 0.01, cacheWrite: 0 },
  "deepseek/deepseek-v4-pro-0813": { input: 0.66, output: 1.98, cacheRead: 0.022, cacheWrite: 0 },
  "z-ai/glm-5.3": { input: 0.085, output: 4.2, cacheRead: 0.048, cacheWrite: 0 },
  "z-ai/glm-5.3-flash": { input: 0.15, output: 0.5, cacheRead: 0.03, cacheWrite: 0 },
  "moonshotai/kimi-k3": { input: 0.62, output: 12.3, cacheRead: 0.43, cacheWrite: 0 },
  "xiaomi/mimo-v2.6-flash": { input: 0.14, output: 0.28, cacheRead: 0.0028, cacheWrite: 0 },
  "xiaomi/mimo-v2.6-pro": { input: 0.435, output: 0.87, cacheRead: 0.0036, cacheWrite: 0 },
  "qwen/qwen3.8-max-0902": { input: 2, output: 6, cacheRead: 0.25, cacheWrite: 2.5 },
  "openai/gpt-6-sol": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "openai/gpt-6-luna": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
};

export function priceFor(model: string): ModelPrice | null {
  return PRICES[model.trim()] ?? null;
}

/**
 * The cost of one call in USD, to the micro-dollar the column keeps, or null
 * when the call has no usage (it failed before a response) or the model is not
 * in the table. Anthropic's input_tokens excludes the cached tokens, which are
 * counted and priced separately.
 */
export function costOf(model: string, usage: AiUsage | null | undefined): number | null {
  if (!usage) return null;
  const price = priceFor(model);
  if (!price) return null;
  const usd =
    (usage.input_tokens ?? 0) * price.input +
    (usage.output_tokens ?? 0) * price.output +
    (usage.cache_read_input_tokens ?? 0) * price.cacheRead +
    (usage.cache_creation_input_tokens ?? 0) * price.cacheWrite;
  return Math.round(usd) / 1_000_000;
}
