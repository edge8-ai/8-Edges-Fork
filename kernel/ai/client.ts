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
 * The key: ANTHROPIC_PRIMARY_API_KEY when it is set, with ANTHROPIC_API_KEY as
 * the fallback once the primary runs out of credit (./key-fallback); otherwise
 * ANTHROPIC_API_KEY alone. Either variable is enough to call Claude.
 */

import { anthropicTimeoutMs } from "./timeout";
import { keyFallbackMiddleware } from "./key-fallback";

// The timeout lives in ./timeout so the gateway can fit calls inside their
// route (Y.39) without importing this module, which tests replace wholesale.
export { anthropicTimeoutMs, DEFAULT_TIMEOUT_MS } from "./timeout";

let instance: Anthropic | null = null;

/**
 * A key from the env, with an empty or blank one read as unset. Callers read
 * `process.env.X` literally so scripts/gen-deployment.mjs lists the variable.
 */
function envKey(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

/** Whether either Anthropic key is set, so a Claude call can be made. */
export function anthropicConfigured(): boolean {
  return Boolean(envKey(process.env.ANTHROPIC_PRIMARY_API_KEY) ?? envKey(process.env.ANTHROPIC_API_KEY));
}

/** The shared client. Throws (from the SDK) if neither Anthropic key is set. */
export function anthropic(): Anthropic {
  if (!instance) {
    const primary = envKey(process.env.ANTHROPIC_PRIMARY_API_KEY);
    const fallback = envKey(process.env.ANTHROPIC_API_KEY);
    instance = new Anthropic({
      // Undefined lets the SDK read ANTHROPIC_API_KEY itself, as before.
      apiKey: primary,
      timeout: anthropicTimeoutMs(),
      maxRetries: 2,
      middleware: primary && fallback && fallback !== primary ? [keyFallbackMiddleware(fallback)] : [],
    });
  }
  return instance;
}

/**
 * For the fail-soft callers that used to write
 * `process.env.ANTHROPIC_API_KEY ? new Anthropic() : null`.
 */
export function anthropicIfConfigured(): Anthropic | null {
  return anthropicConfigured() ? anthropic() : null;
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
