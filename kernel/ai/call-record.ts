import Anthropic from "@anthropic-ai/sdk";
import { anthropicTimeoutMs } from "@/kernel/ai/timeout";
import { inputHashOf, recordAiCall, type AiCallErrorKind, type AiCallProvider } from "@/kernel/ai/calls";
import type { SiteFallback } from "@/kernel/ai/models";
import type { Prompt } from "@/kernel/ai/prompts";
import type { AiDataClass, AiRoute } from "@/kernel/ai/routing";

/**
 * One model call as the gateway (kernel/ai/gateway.ts) makes it: the timeout
 * and retries it may use inside its route, the call itself, and the ai_calls
 * row it leaves whether it answers or throws. Split from the gateway so the
 * fallback (kernel/ai/fallback.ts) makes its two calls the same way.
 */

type SdkMessages = Anthropic["messages"];
export type RequestOptions = Parameters<SdkMessages["create"]>[1];

/** What the gateway knows about the site a call is made for. */
export type CallContext = { site: string; dataClass: AiDataClass; routeSeconds?: number; host?: string | null; fallback?: SiteFallback | null };

/** The caller's request options with the call's timeout and retries fitted inside its route. */
export function fitted(ctx: CallContext, options: RequestOptions | undefined): RequestOptions {
  const requested = (options as { timeout?: number } | undefined)?.timeout;
  return { ...(options ?? {}), ...callBudget(ctx.routeSeconds, requested) } as RequestOptions;
}

// Seconds kept back from the route's maxDuration for the work around the model
// call: reading inputs, writing the result and closing the run row.
const ROUTE_MARGIN_S = 20;
export const DEFAULT_ROUTE_S = 300;
const SDK_RETRIES = 2;

/**
 * The timeout and retries one call may use inside its route (Y.39). The
 * timeout is the caller's (or the client's 120 s default) capped to the route's
 * budget, and the SDK's retries are only those that still fit: a 120 s call in
 * a 300 s route keeps one retry, a writer step that asked for 600 s gets 280 s
 * and none. Exported for its test.
 */
export function callBudget(routeSeconds: number | undefined, requestedTimeoutMs: number | undefined): { timeout: number; maxRetries: number } {
  const budgetMs = Math.max(10, (routeSeconds ?? DEFAULT_ROUTE_S) - ROUTE_MARGIN_S) * 1000;
  const timeout = Math.min(requestedTimeoutMs ?? anthropicTimeoutMs(), budgetMs);
  const maxRetries = Math.max(0, Math.min(SDK_RETRIES, Math.floor(budgetMs / timeout) - 1));
  return { timeout, maxRetries };
}

/** One call, recorded: its ai_calls row is written whether it answers or throws. */
export async function attempt(
  ctx: CallContext,
  prompt: Prompt,
  route: AiRoute,
  body: { model: string; messages: unknown },
  target: Anthropic,
  sent: Anthropic.MessageCreateParamsNonStreaming,
  options: RequestOptions,
): Promise<Anthropic.Message> {
  const started = Date.now();
  let response: Anthropic.Message;
  try {
    response = await target.messages.create(sent, options);
  } catch (e) {
    await recordAiCall(failedCall(ctx, prompt, route, body, started, e));
    throw e;
  }
  await recordAiCall(finishedCall(ctx, prompt, route, body, started, response));
  return response;
}

type UsageWithCost = Anthropic.Usage & { cost?: number | null };

export function finishedCall(ctx: CallContext, prompt: Prompt, route: AiRoute, body: { model: string; messages: unknown }, started: number, response: Anthropic.Message) {
  const usage = (response.usage ?? null) as UsageWithCost | null;
  const errorKind: AiCallErrorKind | null =
    response.stop_reason === "refusal" ? "refusal" : response.stop_reason === "max_tokens" ? "max_tokens" : null;
  return {
    ...ctx,
    promptVersion: prompt.ref,
    provider: route.provider as AiCallProvider,
    model: body.model,
    usage,
    costUsd: typeof usage?.cost === "number" ? usage.cost : null,
    latencyMs: Date.now() - started,
    inputHash: inputHashOf(body.messages),
    ok: errorKind === null,
    errorKind,
  };
}

export function failedCall(ctx: CallContext, prompt: Prompt, route: AiRoute, body: { model: string; messages: unknown }, started: number, error: unknown) {
  return {
    ...ctx,
    promptVersion: prompt.ref,
    provider: route.provider as AiCallProvider,
    model: body.model,
    usage: null,
    costUsd: null,
    latencyMs: Date.now() - started,
    inputHash: inputHashOf(body.messages),
    ok: false,
    errorKind: errorKindOf(error),
  };
}

/** The error kind for a non-2xx HTTP status from a provider's own API. */
export function httpErrorKind(status: number): AiCallErrorKind {
  if (status === 429) return "rate_limit";
  if (status === 408 || status === 504) return "timeout";
  return "api_error";
}

/** The SDK's error classes, most specific first; anything else is unknown. */
export function errorKindOf(error: unknown): AiCallErrorKind {
  if (error instanceof Anthropic.APIConnectionTimeoutError) return "timeout";
  if (error instanceof Anthropic.APIConnectionError) return "connection";
  if (error instanceof Anthropic.RateLimitError) return "rate_limit";
  if (error instanceof Anthropic.APIError) return "api_error";
  return "unknown";
}
