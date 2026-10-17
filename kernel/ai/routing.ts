/**
 * Where a model call may go, decided by the data class the call site declares.
 *
 * The rule (plan Part C1): sensitive work stays on the official Anthropic API,
 * and everything else may run on whatever passes its eval. The class lives in
 * code beside each call site, never in a table or an env var, so a
 * configuration change can move a model but can never move a sensitive call.
 *
 *   S  sensitive: ATS, people, the read-everything chat agents, money.
 *      api.anthropic.com only, on a model Anthropic keeps nothing of.
 *   C  confidential: internal business content. Claude goes direct; any other
 *      model only through OpenRouter with data collection denied, so no host
 *      trains on it. Zero retention is not required (decided 28 Sep 2026: it
 *      is for class S alone).
 *   B  internal output (digests, ideas, sprint drafts).
 *   A  public output (published copy, images).
 *      B and A route the same way; the split records who can see the output.
 *
 * Fable is the one Claude model S and C may not use. Anthropic keeps its
 * prompts and outputs for 30 days (a Covered Model), which Edge8's
 * zero-retention agreement does not cover.
 *
 * Fail closed, in three ways: an undeclared or unknown class is S; Claude,
 * whatever the class, always goes to api.anthropic.com, because through
 * OpenRouter a Claude request can be load-balanced onto Bedrock or Vertex and
 * lose structured output; and the check runs on every attempt (the gateway
 * calls routeFor per request, retries included), not once per process.
 *
 * No path-alias imports and no SDK imports here: scripts/check-ai-routing.mjs
 * imports this file under plain node, so the build check and the runtime
 * check are one function.
 */

export const AI_DATA_CLASSES = ["S", "C", "B", "A"] as const;

export type AiDataClass = (typeof AI_DATA_CLASSES)[number];

export type AiRoute = {
  provider: "anthropic" | "openrouter";
  /** OpenRouter's `provider` request field; null on the Anthropic API. */
  providerPrefs: Record<string, unknown> | null;
};

/** Thrown before any network call when a route would break its class. */
export class AiRouteRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiRouteRefused";
  }
}

/** The declared class, or S for anything missing or unrecognised. */
export function dataClassOf(value: unknown): AiDataClass {
  return typeof value === "string" && (AI_DATA_CLASSES as readonly string[]).includes(value)
    ? (value as AiDataClass)
    : "S";
}

/**
 * A Claude model in the Anthropic API's own spelling. OpenRouter's slug
 * (`anthropic/claude-haiku-4.5`) is deliberately not one: it names the
 * OpenRouter route, which Claude never takes.
 */
export function isClaudeModel(model: string): boolean {
  return /^claude-/.test(model.trim());
}

/** A Claude model Anthropic retains for 30 days: every Fable release. */
function isRetainedClaudeModel(model: string): boolean {
  return /^claude-fable-/.test(model.trim());
}

/**
 * The route for one call, or AiRouteRefused. `dataClass` is `unknown` on
 * purpose: whatever reaches the gateway is judged here, so a missing constant
 * cannot widen what a call may do.
 */
export function routeFor(site: string, dataClass: unknown, model: string): AiRoute {
  const cls = dataClassOf(dataClass);
  const id = model.trim();
  if (!id) throw new AiRouteRefused(`AI route refused for ${site} (class ${cls}): no model is configured.`);
  if (isClaudeModel(id)) {
    if ((cls === "S" || cls === "C") && isRetainedClaudeModel(id)) {
      throw new AiRouteRefused(
        `AI route refused for ${site} (class ${cls}): ${id} is kept by Anthropic for 30 days, ` +
          `and class ${cls} runs only on a Claude model that keeps nothing (Sonnet, Opus or Haiku).`,
      );
    }
    return { provider: "anthropic", providerPrefs: null };
  }
  if (/claude/i.test(id)) {
    throw new AiRouteRefused(
      `AI route refused for ${site} (class ${cls}): ${id} is a Claude model spelled for another host; ` +
        `Claude goes to api.anthropic.com only, spelled claude-….`,
    );
  }
  if (cls === "S") {
    throw new AiRouteRefused(
      `AI route refused for ${site} (class S): ${id} is not a Claude model, and class S runs on the official Anthropic API only.`,
    );
  }
  if (cls === "C") {
    return { provider: "openrouter", providerPrefs: { data_collection: "deny", require_parameters: true } };
  }
  return { provider: "openrouter", providerPrefs: { require_parameters: true } };
}

/**
 * The models[] fallback list a request may carry, judged entry by entry (Y.78).
 * OpenRouter reads a top-level `models` list and falls back along it on its own
 * servers, so an entry the gateway never saw could put Claude on OpenRouter,
 * Fable on a class C call, or an open model on a class S one. Each entry must
 * pass `routeFor` for the same class and take the same provider as the primary
 * model; a Claude request carries no list at all, because api.anthropic.com is
 * its one route and does not read the field. Returns the primary model's route.
 */
export function routeForRequest(site: string, dataClass: unknown, model: string, fallbacks: unknown): AiRoute {
  const route = routeFor(site, dataClass, model);
  if (fallbacks === undefined || fallbacks === null) return route;
  const cls = dataClassOf(dataClass);
  if (route.provider === "anthropic") {
    throw new AiRouteRefused(
      `AI route refused for ${site} (class ${cls}): a Claude request carries no models[] fallback list; api.anthropic.com is its only route.`,
    );
  }
  if (!Array.isArray(fallbacks) || !fallbacks.every((m) => typeof m === "string")) {
    throw new AiRouteRefused(`AI route refused for ${site} (class ${cls}): models[] must be a list of model ids.`);
  }
  for (const m of fallbacks as string[]) {
    if (routeFor(site, dataClass, m).provider !== route.provider) {
      throw new AiRouteRefused(
        `AI route refused for ${site} (class ${cls}): the fallback ${m.trim()} does not route like ${model.trim()}, and OpenRouter would switch to it unchecked.`,
      );
    }
  }
  return route;
}

/**
 * An OpenRouter endpoint served at fp4. The same model loses quality at fp4,
 * so neither an eval run nor a live route may pin one (plan C2). The one rule
 * for both: the eval harness's config check and `providerFieldFor` call it.
 */
export function isFp4Host(host: string): boolean {
  return /fp4/i.test(host);
}

/** The first fp4 name in a pin's `order`, `only` or `quantizations`, or null. */
function fp4In(pin: Record<string, unknown>): string | null {
  for (const field of ["order", "only", "quantizations"]) {
    const list = pin[field];
    if (!Array.isArray(list)) continue;
    const hit = list.find((v) => typeof v === "string" && isFp4Host(v));
    if (hit) return hit as string;
  }
  return null;
}

/**
 * The `provider` field a request is sent with, or null for none.
 *
 * A request may carry OpenRouter's `provider` field to pin a host (`order`,
 * `only`, `allow_fallbacks`, `quantizations`): the same model is served at
 * fp4, fp8 and bf16, and its quality moves with it, so an eval run or a live
 * route has to be able to name one. Those keys pass through, except that a pin
 * naming fp4 anywhere is refused (Y.79). The route's own preferences are
 * written last, so a request can narrow where a call goes but never relax its
 * class: `data_collection: "allow"` on a class C request is overwritten with
 * "deny". An Anthropic route sends no `provider` field, because
 * api.anthropic.com does not know it.
 */
export function providerFieldFor(route: AiRoute, requested: unknown): Record<string, unknown> | null {
  if (!route.providerPrefs) return null;
  const pinned =
    requested !== null && typeof requested === "object" && !Array.isArray(requested)
      ? (requested as Record<string, unknown>)
      : {};
  const fp4 = fp4In(pinned);
  if (fp4) throw new AiRouteRefused(`AI route refused: the host pin names ${fp4}, an fp4 endpoint; pin fp8, bf16 or the lab's own.`);
  return { ...pinned, ...route.providerPrefs };
}

/**
 * A call to a provider's own API that is neither Anthropic nor OpenRouter
 * (today only Gemini, for marketing images). No zero-retention promise covers
 * it, so it carries public or internal output only: classes B and A. Anything
 * else throws AiRouteRefused.
 */
export function checkOtherProvider(site: string, dataClass: unknown, provider: string): AiDataClass {
  const cls = dataClassOf(dataClass);
  if (cls === "B" || cls === "A") return cls;
  throw new AiRouteRefused(
    `AI route refused for ${site} (class ${cls}): ${provider} has no zero-retention route, so it carries classes B and A only.`,
  );
}
