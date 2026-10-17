import Anthropic from "@anthropic-ai/sdk";
import { waitUntil } from "@vercel/functions";
import type { MessageStream } from "@anthropic-ai/sdk/lib/MessageStream";
import { anthropic, anthropicIfConfigured, openRouter, openRouterIfConfigured } from "@/kernel/ai/client";
import { inputHashOf, recordAiCall, type AiCallErrorKind, type AiCallProvider } from "@/kernel/ai/calls";
import { attempt, failedCall, finishedCall, fitted, type CallContext, type RequestOptions } from "@/kernel/ai/call-record";
import { withFallback, type FallbackPlan } from "@/kernel/ai/fallback";
import { fallbackFor, fallbackSiteOf, hostFor, siteModelFor, type SiteFallback, type Tier } from "@/kernel/ai/models";
import { promptSite, type Prompt } from "@/kernel/ai/prompts";
import {
  AiRouteRefused,
  checkOtherProvider,
  dataClassOf,
  isClaudeModel,
  providerFieldFor,
  routeForRequest,
  type AiDataClass,
  type AiRoute,
} from "@/kernel/ai/routing";
import type { AiUsage } from "@/kernel/audit/routine-runs";
import { log } from "@/kernel/config/log";

/**
 * The model gateway, first slice (plan Part C0 step 1): every model call goes
 * through here, names its site and its data class, and leaves one ai_calls row.
 *
 * A call site declares itself once, at module scope:
 *
 *   export const MEETING_SUMMARY_CLASS: AiDataClass = "C";
 *   const AI = aiSite({ site: "meeting-summary", dataClass: MEETING_SUMMARY_CLASS, tier: "fast" });
 *
 * and then uses `AI.model` and `AI.clientIfConfigured()` exactly where it used
 * `modelFor(...)` and `anthropicIfConfigured()`: the client keeps the SDK's
 * `messages.create` / `messages.stream` shape (plan Part C2, "no call site is
 * rewritten"), so the request a site builds is the request that is sent.
 *
 * What the gateway adds to each request, and nothing else:
 *
 *  - The class check, on the model the request actually carries, every time
 *    `create` or `stream` is called. A retry or a fallback that picks another
 *    model is judged again. A refused route throws AiRouteRefused before any
 *    network call and writes no row, because no call was made.
 *  - The client: api.anthropic.com for every Claude model, OpenRouter (same
 *    SDK, another base URL) for anything else the class allows, with the
 *    class's provider preferences in OpenRouter's `provider` field, written
 *    over any host pin the request carries.
 *  - One ai_calls row per call through kernel/ai/calls.ts: tokens, latency
 *    measured here, the prompt it sent as `name@version`, a hash of the
 *    messages, and whether the output was usable. Never a body; the gateway
 *    logs none either.
 *
 * A site may have a fallback (`SITE_MODELS` in kernel/ai/models.ts, Y.67.3):
 * a second model, on its own provider's route, that answers when the first
 * does not answer in time. On `create`, the gateway aborts the first call at
 * the fallback's `afterMs`, and on that abort, a provider error after the
 * SDK's own retries, or an unusable answer (a refusal, a max_tokens cut-off,
 * no output, or text that is not JSON when the request asked for a JSON
 * schema) it sends the same request, prompt, tools and output schema
 * included, to the fallback model. The fallback is judged against the site's
 * class before the first call is made, so a fallback the class would not
 * allow refuses the call outright. Each attempt leaves its own ai_calls row;
 * the fallback's names the site as `<site>:fallback`. A fallback whose
 * provider has no key is skipped, and so is the abort, which would only turn
 * a slow answer into none. `stream` takes no fallback: a stream that has
 * started cannot be swapped for another.
 *
 * Every request names its prompt (kernel/ai/prompts.ts) in a `prompt` field,
 * which the gateway reads and strips before the request leaves, the way it
 * handles OpenRouter's `provider` pin. The type requires the field, so a call
 * that sends unversioned text does not compile, and a prompt that belongs to
 * another site is refused before any network call (Z.6.1).
 *
 * `model` is resolved through `modelFor` when the site is declared, exactly as
 * the call sites did before, so no site's model changes with this module and
 * nothing reaches OpenRouter until a site's model is moved on purpose.
 */

// The budget and the ledger row live in ./call-record, the fallback in
// ./fallback; these are re-exported so a call site has one module to import.
export { callBudget, errorKindOf, httpErrorKind } from "@/kernel/ai/call-record";

type AiMessageStream = MessageStream;

/**
 * OpenRouter's `provider` field, which a request may carry to pin a host
 * (`order`, `only`, `allow_fallbacks`, `quantizations`). The class's guards
 * are written over it (routing.ts `providerFieldFor`), and a Claude request
 * is sent without it.
 */
export type HostPin = { provider?: Record<string, unknown>; models?: string[] };

/** The versioned prompt a request sends (Z.6.1). Stripped before the request leaves. */
export type PromptTag = { prompt: Prompt };

/** Thrown before any network call when a request names a prompt from another site. */
export class AiPromptRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiPromptRefused";
  }
}

/** The part of the SDK client a call site uses, with the gateway inside it. */
export interface AiClient {
  messages: {
    create(body: Anthropic.MessageCreateParamsNonStreaming & HostPin & PromptTag, options?: RequestOptions): Promise<Anthropic.Message>;
    stream(body: Anthropic.MessageStreamParams & HostPin & PromptTag, options?: RequestOptions): AiMessageStream;
  };
}

export type AiSiteDeclaration = {
  /** The name logAiUsage logs and ai_calls records. */
  site: string;
  /**
   * The site's data class, a typed constant beside the call site. Missing or
   * unknown is S. scripts/check-ai-routing.mjs fails a declaration without one.
   */
  dataClass: AiDataClass | undefined;
  tier: Tier;
  /**
   * The name modelFor resolves the model (and its env override) under, when it
   * differs from `site`. The writer's steps are one model, `brand-writer`,
   * under a site name per step.
   */
  modelSite?: string;
  /**
   * The maxDuration, in seconds, of the route this site's calls run in
   * (default 300, Vercel's default). Every call's timeout and retries are fitted
   * inside it (Y.39), so a hung model fails with an error the run can record
   * instead of the route being killed with no record at all.
   */
  routeSeconds?: number;
};

export type AiSite = {
  readonly site: string;
  readonly dataClass: AiDataClass;
  readonly model: string;
  /** The gateway client. Throws (from the SDK) when the provider's key is unset. */
  client(): AiClient;
  /** The gateway client, or null when the provider's key is unset. */
  clientIfConfigured(): AiClient | null;
};

export function aiSite(decl: AiSiteDeclaration): AiSite {
  const dataClass = dataClassOf(decl.dataClass);
  // A step's own model and host win over the shared site's (Y.71.1).
  const model = siteModelFor(decl.site, decl.modelSite, decl.tier);
  const host = hostFor(decl.site, process.env, model) ?? (decl.modelSite ? hostFor(decl.modelSite, process.env, model) : null);
  const fallback = fallbackFor(decl.site, model) ?? (decl.modelSite ? fallbackFor(decl.modelSite, model) : null);
  const ctx: CallContext = { site: decl.site, dataClass, routeSeconds: decl.routeSeconds, host, fallback };
  // The provider the resolved model would take. The route is still checked on
  // every call; this only decides which key "configured" means.
  const provider: AiRoute["provider"] = isClaudeModel(model) ? "anthropic" : "openrouter";
  return {
    site: decl.site,
    dataClass,
    model,
    client: () => gatewayClient(ctx, provider, provider === "anthropic" ? anthropic() : openRouter()),
    clientIfConfigured: () => {
      const base = provider === "anthropic" ? anthropicIfConfigured() : openRouterIfConfigured();
      return base ? gatewayClient(ctx, provider, base) : null;
    },
  };
}

function gatewayClient(ctx: CallContext, baseProvider: AiRoute["provider"], base: Anthropic): AiClient {
  const clientFor = (provider: AiRoute["provider"]): Anthropic =>
    provider === baseProvider ? base : provider === "anthropic" ? anthropic() : openRouter();
  const clientIfConfiguredFor = (provider: AiRoute["provider"]): Anthropic | null =>
    provider === baseProvider ? base : provider === "anthropic" ? anthropicIfConfigured() : openRouterIfConfigured();

  return {
    messages: {
      async create(tagged, options) {
        const { prompt, body } = untag(ctx.site, tagged);
        const { route, sent } = prepare(ctx, body);
        const target = clientFor(route.provider);
        const fallback = fallbackPlan(ctx, body, clientIfConfiguredFor);
        if (!fallback) return attempt(ctx, prompt, route, body, target, sent, fitted(ctx, options));
        return withFallback(ctx, prompt, route, body, target, sent, options, fallback);
      },

      stream(tagged, options) {
        const { prompt, body } = untag(ctx.site, tagged);
        const { route, sent } = prepare(ctx, body);
        const target = clientFor(route.provider);
        const started = Date.now();
        const stream = target.messages.stream(sent, fitted(ctx, options));
        // The caller consumes the stream; the gateway only listens. Calling
        // finalMessage() here would race the caller for the same result. The
        // row is written under waitUntil (Y.72.5): a streamed reply ends the
        // response before the insert lands, and without it the function could
        // stop with the row unwritten (admin-chat, team-chat, program-plan,
        // publish-editor).
        let recorded = false;
        stream.on("finalMessage", (message: Anthropic.Message) => {
          if (recorded) return;
          recorded = true;
          waitUntil(recordAiCall(finishedCall(ctx, prompt, route, body, started, message)));
        });
        stream.on("error", (e: unknown) => {
          if (recorded) return;
          recorded = true;
          waitUntil(recordAiCall(failedCall(ctx, prompt, route, body, started, e)));
        });
        return stream;
      },
    },
  };
}

/**
 * The fallback for one request, judged before the first call is made, or
 * null when the site has none or its provider has no key. The request is the
 * site's own with the fallback's model, and without the first model's host
 * pin and models[] list, which name the first model's route and not this one.
 * A fallback the site's class would not allow throws AiRouteRefused here, so
 * a misconfigured fallback fails every call at once rather than only the slow
 * ones, and nothing has been sent.
 */
function fallbackPlan<B extends { model: string; messages: unknown } & HostPin>(
  ctx: CallContext,
  body: B,
  clientIfConfiguredFor: (provider: AiRoute["provider"]) => Anthropic | null,
): FallbackPlan | null {
  if (!ctx.fallback) return null;
  const { models: _models, provider: _provider, ...rest } = body;
  const fallbackBody = { ...rest, model: ctx.fallback.model };
  const fallbackCtx: CallContext = { site: fallbackSiteOf(ctx.site), dataClass: ctx.dataClass, routeSeconds: ctx.routeSeconds, host: null };
  const { route, sent } = prepare(fallbackCtx, fallbackBody);
  const client = clientIfConfiguredFor(route.provider);
  if (!client) {
    log("warn", "ai-fallback-unconfigured", { site: ctx.site, model: ctx.fallback.model, provider: route.provider });
    return null;
  }
  return {
    afterMs: ctx.fallback.afterMs,
    ctx: fallbackCtx,
    route,
    body: fallbackBody,
    sent: sent as unknown as Anthropic.MessageCreateParamsNonStreaming,
    client,
  };
}

/**
 * Refuses a prompt that does not belong to the site, before any network call,
 * logged as `ai-prompt-refused`. A prompt belongs to the site its name starts
 * with. One recorded under another site would put its version on the wrong
 * usage line, and its eval ran on the other site's cases.
 */
function checkPrompt(site: string, prompt: Prompt | undefined): Prompt {
  if (prompt && promptSite(prompt) === site) return prompt;
  const named = prompt?.name ?? "no prompt";
  log("error", "ai-prompt-refused", { site, prompt: named });
  throw new AiPromptRefused(
    `AI call refused for ${site}: the request names ${named}, and a site sends only prompts named after it (${site} or ${site}/<variant>).`,
  );
}

/** The request's prompt, checked against the site, and the request without it. */
function untag<B extends PromptTag>(site: string, tagged: B): { prompt: Prompt; body: Omit<B, "prompt"> } {
  const { prompt, ...body } = tagged;
  return { prompt: checkPrompt(site, prompt), body };
}

/**
 * The route for one request and the body it is sent with, or AiRouteRefused
 * before any network call. Runs on every call, retries included. The route
 * judges the model and any models[] fallback list (Y.78); the body carries
 * the request's own host pin, else the site's configured one (`AI_HOST_<SITE>`,
 * Y.79), under the class's guards, and an fp4 pin is refused.
 */
function prepare<B extends { model: string } & HostPin>(ctx: CallContext, body: B): { route: AiRoute; sent: Omit<B, "provider"> } {
  try {
    const route = routeForRequest(ctx.site, ctx.dataClass, body.model, body.models);
    return { route, sent: withProviderPrefs(body, route, ctx.host ?? null) };
  } catch (e) {
    // Greppable as `ai-route-refused`: a refusal is a configuration that would
    // have sent class-S data somewhere it must not go, or a host it must not use.
    if (e instanceof AiRouteRefused) log("error", "ai-route-refused", { site: ctx.site, class: ctx.dataClass, model: body.model, reason: e.message });
    throw e;
  }
}

/**
 * OpenRouter reads its routing preferences from the request body's `provider`
 * field. The request's own pin wins over the site's configured host, which is
 * sent as the provider order with no fallback to other hosts, as the eval ran
 * it. Both sit under the class's guards; an Anthropic route gets the body
 * without the field.
 */
function withProviderPrefs<B extends HostPin>(body: B, route: AiRoute, host: string | null): Omit<B, "provider"> {
  const { provider: requested, ...rest } = body;
  const pin = requested ?? (host ? { order: [host], allow_fallbacks: false } : undefined);
  const field = providerFieldFor(route, pin);
  return (field ? { ...rest, provider: field } : rest) as Omit<B, "provider">;
}

export type OtherProviderOutcome<T> = {
  value: T;
  usage: AiUsage | null;
  ok: boolean;
  errorKind?: AiCallErrorKind | null;
};

/**
 * A call to a provider's own HTTP API that the SDK does not speak (today only
 * Gemini, for marketing images). The class is checked first
 * (`checkOtherProvider`: B and A only), the latency is measured here, and the
 * call gets its ai_calls row like any other. `input` is hashed, never stored.
 * A throw from `run` is recorded as a failed call and rethrown.
 */
export async function otherProviderCall<T>(
  decl: {
    site: string;
    dataClass: AiDataClass | undefined;
    provider: Exclude<AiCallProvider, "anthropic" | "openrouter">;
    model: string;
    /** The prompt the call sends; its `name@version` is what ai_calls records. */
    prompt: Prompt;
    input: unknown;
  },
  run: () => Promise<OtherProviderOutcome<T>>,
): Promise<T> {
  const prompt = checkPrompt(decl.site, decl.prompt);
  let dataClass: AiDataClass;
  try {
    dataClass = checkOtherProvider(decl.site, decl.dataClass, decl.provider);
  } catch (e) {
    log("error", "ai-route-refused", { site: decl.site, class: dataClassOf(decl.dataClass), model: decl.model });
    throw e;
  }
  const base = {
    site: decl.site,
    dataClass,
    provider: decl.provider,
    model: decl.model,
    promptVersion: prompt.ref,
    inputHash: inputHashOf(decl.input),
    costUsd: null,
  };
  const started = Date.now();
  let outcome: OtherProviderOutcome<T>;
  try {
    outcome = await run();
  } catch (e) {
    await recordAiCall({ ...base, usage: null, latencyMs: Date.now() - started, ok: false, errorKind: "unknown" });
    throw e;
  }
  await recordAiCall({
    ...base,
    usage: outcome.usage,
    latencyMs: Date.now() - started,
    ok: outcome.ok,
    errorKind: outcome.ok ? null : (outcome.errorKind ?? "unknown"),
  });
  return outcome.value;
}
