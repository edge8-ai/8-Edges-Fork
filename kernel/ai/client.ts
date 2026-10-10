import Anthropic from "@anthropic-ai/sdk";

/**
 * The one place an Anthropic client is constructed.
 *
 * Nineteen call sites used to do `new Anthropic()` each on their own, so none
 * of them shared a timeout or a retry policy and a hung request rode the
 * function until Vercel killed it. The SDK client is stateless apart from
 * config, so one lazily-built instance serves the whole process.
 *
 *   timeout     ANTHROPIC_TIMEOUT_MS, default 120s. Long enough for an 8k-token
 *               structured answer on Sonnet; short enough that a stuck upstream
 *               fails before the platform timeout does.
 *   maxRetries  2 — the SDK retries 408/409/429/5xx and connection errors with
 *               backoff.
 *
 * The API key still comes from ANTHROPIC_API_KEY, read by the SDK itself.
 */

import { anthropicTimeoutMs } from "./timeout";

// The timeout lives in ./timeout so the gateway can fit calls inside their
// route (Y.39) without importing this module, which tests replace wholesale.
export { anthropicTimeoutMs, DEFAULT_TIMEOUT_MS } from "./timeout";

let instance: Anthropic | null = null;

/** The shared client. Throws (from the SDK) if ANTHROPIC_API_KEY is unset. */
export function anthropic(): Anthropic {
  if (!instance) {
    instance = new Anthropic({ timeout: anthropicTimeoutMs(), maxRetries: 2 });
  }
  return instance;
}

/**
 * For the fail-soft callers that used to write
 * `process.env.ANTHROPIC_API_KEY ? new Anthropic() : null`.
 */
export function anthropicIfConfigured(): Anthropic | null {
  return process.env.ANTHROPIC_API_KEY ? anthropic() : null;
}

/**
 * OpenRouter serves the Anthropic Messages format at /api/v1/messages, so the
 * same SDK with another base URL carries a non-Claude model with no call site
 * rewritten (plan Part C2). Only kernel/ai/gateway.ts reaches for it, and only
 * after kernel/ai/routing.ts has allowed the route: Claude never goes this way.
 */
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api";

let openRouterInstance: Anthropic | null = null;

/** The OpenRouter client. Throws if OPENROUTER_API_KEY is unset. */
export function openRouter(): Anthropic {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured.");
  if (!openRouterInstance) {
    openRouterInstance = new Anthropic({ apiKey, baseURL: OPENROUTER_BASE_URL, timeout: anthropicTimeoutMs(), maxRetries: 2 });
  }
  return openRouterInstance;
}

/** The OpenRouter client, or null without OPENROUTER_API_KEY. */
export function openRouterIfConfigured(): Anthropic | null {
  return process.env.OPENROUTER_API_KEY ? openRouter() : null;
}

/** Drop the cached instances so the next call re-reads the env. Tests only. */
export function resetAnthropicClient(): void {
  instance = null;
  openRouterInstance = null;
}
