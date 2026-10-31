import Anthropic from "@anthropic-ai/sdk";
import { recordAiCall, type AiCallErrorKind } from "@/kernel/ai/calls";
import {
  attempt,
  callBudget,
  DEFAULT_ROUTE_S,
  failedCall,
  finishedCall,
  fitted,
  type CallContext,
  type RequestOptions,
} from "@/kernel/ai/call-record";
import type { Prompt } from "@/kernel/ai/prompts";
import type { AiRoute } from "@/kernel/ai/routing";
import { log } from "@/kernel/config/log";

/**
 * The fallback's two calls (Y.67.3): the site's own model, aborted at the
 * fallback's `afterMs`, then the fallback model when the first gave no usable
 * answer. The gateway (kernel/ai/gateway.ts) judges the fallback's route for
 * the site's class and builds the plan before either call is made.
 */

/** The fallback request, already judged for the site's class, and the client it goes through. */
export type FallbackPlan = {
  afterMs: number;
  ctx: CallContext;
  route: AiRoute;
  body: { model: string; messages: unknown };
  sent: Anthropic.MessageCreateParamsNonStreaming;
  client: Anthropic;
};

/**
 * The first call, aborted at `afterMs`, then the fallback when the first did
 * not give a usable answer. The SDK's retries of a host error happen inside
 * the first call's window. The caller's own abort is never a reason to fall
 * back. When the fallback fails too, its error (or its unusable answer) is
 * what the site gets, so the site's usual failure path runs.
 */
export async function withFallback(
  ctx: CallContext,
  prompt: Prompt,
  route: AiRoute,
  body: { model: string; messages: unknown },
  target: Anthropic,
  sent: Anthropic.MessageCreateParamsNonStreaming,
  options: RequestOptions | undefined,
  plan: FallbackPlan,
): Promise<Anthropic.Message> {
  const callerSignal = (options as { signal?: AbortSignal | null } | undefined)?.signal ?? null;
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, plan.afterMs);
  callerSignal?.addEventListener("abort", abort, { once: true });
  const requested = (options as { timeout?: number } | undefined)?.timeout;
  const primaryOptions = {
    ...(options ?? {}),
    ...callBudget(ctx.routeSeconds, Math.min(requested ?? plan.afterMs, plan.afterMs)),
    signal: controller.signal,
  } as RequestOptions;
  const started = Date.now();
  try {
    const response = await target.messages.create(sent, primaryOptions);
    const unusable = unusableKind(response, sent);
    const row = finishedCall(ctx, prompt, route, body, started, response);
    if (!unusable) {
      await recordAiCall(row);
      return response;
    }
    await recordAiCall({ ...row, ok: false, errorKind: unusable });
    log("warn", "ai-fallback", { site: ctx.site, model: body.model, fallback: plan.body.model, reason: unusable });
  } catch (e) {
    const timedOut = controller.signal.aborted && !callerSignal?.aborted;
    const row = failedCall(ctx, prompt, route, body, started, e);
    await recordAiCall(timedOut ? { ...row, errorKind: "timeout" as const } : row);
    // Only the provider's failures hand over: the caller's abort, or a bug on
    // this side of the wire, is the site's to see.
    if (callerSignal?.aborted || !(timedOut || e instanceof Anthropic.APIError)) throw e;
    log("warn", "ai-fallback", { site: ctx.site, model: body.model, fallback: plan.body.model, reason: timedOut ? "timeout" : row.errorKind });
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", abort);
  }
  // The fallback's timeout and retries fit in what is left of the route.
  const spentS = Math.ceil((Date.now() - started) / 1000);
  const fallbackCtx: CallContext = { ...plan.ctx, routeSeconds: (ctx.routeSeconds ?? DEFAULT_ROUTE_S) - spentS };
  return attempt(fallbackCtx, prompt, plan.route, plan.body, plan.client, plan.sent, fitted(fallbackCtx, options));
}

/**
 * Why a response cannot stand as the site's answer, or null when it can: the
 * gateway's half of "schema-valid". A JSON-schema request must at least get
 * JSON back; the site's own schema check (readStructuredOutput) still runs
 * on whatever is returned.
 */
function unusableKind(response: Anthropic.Message, sent: unknown): AiCallErrorKind | null {
  if (response.stop_reason === "refusal") return "refusal";
  if (response.stop_reason === "max_tokens") return "max_tokens";
  const content = response.content ?? [];
  if (content.some((b) => b.type === "tool_use")) return null;
  const text = content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "";
  if (!text.trim()) return "unknown";
  const format = (sent as { output_config?: { format?: { type?: string } } }).output_config?.format;
  if (format?.type === "json_schema") {
    try {
      JSON.parse(text);
    } catch {
      return "unknown";
    }
  }
  return null;
}
