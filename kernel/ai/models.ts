/**
 * The one place a Claude model id is spelled.
 *
 * Every call site names a *tier*, not a model, and the gateway
 * (kernel/ai/gateway.ts, `aiSite`) resolves it through `modelFor(site, tier)`;
 * no call site calls it directly (check:ai-routing). `site` is the same string the call site already
 * passes to `logAiUsage` / `readTextOutput` in kernel/ai/response.ts, so the
 * usage line, the env override, and the model choice all key off one name.
 *
 * Tiers follow the cost policy: operational AI runs on `fast` or `standard`;
 * `deep` (Opus) is reserved for work that is provably
 * too hard for Sonnet, and no per-upload or high-volume path uses it. The one
 * `deep` site is the coaching loop (`coaching-text`), which does sit on a
 * per-request path — a coach saving a transcript waits on the summary — but
 * runs single digits a month, so the tier costs a couple of dollars a month.
 *
 * That site's max_tokens budgets are measured rather than guessed, because on
 * `deep` and `frontier` thinking is on by default and is billed as output
 * against max_tokens. One real 1-1 re-summarised on 2026-09-11 spent 5407
 * output tokens of an 8000 cap, at 52 output tokens/second: so 8000 is roughly
 * 154s, inside the coaching routes' 300s maxDuration, while the 16000 first
 * tried would have been ~308s and overrun it. The check-in budget was 1500,
 * only 362 above the longest output on file, and would have truncated as soon
 * as thinking landed. Raise a budget from a measurement, not from a hunch.
 * `frontier` (Fable) is for the few sites where the output is the product,
 * such as the brand writer, and each run is one operator click, not a loop.
 *
 * Overrides, most specific first:
 *   0. For a site that shares another's model (`modelSite`, the writer's
 *      steps), its own `AI_MODEL_<SITE>` (`siteModelFor`, Y.71.1).
 *   1. `AI_MODEL_<SITE>` — the site name upper-cased, `-` → `_`
 *      (e.g. `AI_MODEL_INTERVIEW_PANELIST`). Works for every site.
 *   2. The legacy shared names in `SITE_ENV` (CHATBOT_MODEL, WRITER_CLAUDE_MODEL,
 *      ...), kept so existing Vercel config keeps working unchanged.
 *   3. The site's eval-chosen model in `SITE_MODELS`, when an eval moved it.
 *   4. The tier default.
 *
 * No path-alias imports here: lib/ai/models.test.ts runs under plain `node --test`.
 */

// `fast` and `standard` name the same model on purpose (Y.87, 8 Oct 2026):
// Haiku 4.5 retires no earlier than 15 Oct 2026 with no Haiku successor, so
// every fast site runs on Sonnet 5 until Y.67.2's eval picks a cheaper model
// per site. Keeping the tier, rather than moving each site to `standard`,
// keeps that later choice a one-line change per tier, not per site.
export const TIERS = {
  fast: "claude-sonnet-5",
  standard: "claude-sonnet-5",
  // Opus 5.5 since Y.77 (9 Oct 2026): the drop-in for the legacy Opus 5 at
  // $4/$20 against $5/$25 per million tokens (plan C5). Only the coaching
  // loop's two class S calls use this tier, at medium effort.
  deep: "claude-opus-5-5",
  frontier: "claude-fable-5-1",
} as const;

export type Tier = keyof typeof TIERS;

/**
 * Legacy env override names, by logAiUsage site. Several sites share one name
 * on purpose — that is how they were configured before the registry existed.
 */
export const SITE_ENV: Readonly<Record<string, string>> = {
  "admin-chat": "CHATBOT_MODEL",
  "team-chat": "CHATBOT_MODEL",
  "program-plan": "CHATBOT_MODEL",
  "publish-editor": "WRITER_CLAUDE_MODEL",
  "brand-writer": "WRITER_CLAUDE_MODEL",
  "campaign-seo": "WRITER_CLAUDE_MODEL",
  "entry-copy": "WRITER_CLAUDE_MODEL",
  "admin-idea-plan": "IDEAS_CLAUDE_MODEL",
  "idea-trends": "IDEAS_CLAUDE_MODEL",
  "meeting-summary": "MEETINGS_CLAUDE_MODEL",
  "review-summary": "REVIEW_CLAUDE_MODEL",
  "coaching-text": "COACHING_CLAUDE_MODEL",
  "coaching-summary": "COACHING_CLAUDE_MODEL",
  "coaching-prep": "COACHING_CLAUDE_MODEL",
  "roadmap-assist": "ROADMAP_ASSIST_MODEL",
  "interview-panelist": "INTERVIEW_CLAUDE_MODEL",
};

/**
 * A second model a site calls when its first does not answer in time (Y.67.3).
 * The gateway aborts the first at `afterMs`, or takes a provider error or an
 * unusable answer from it, and sends the same request to `model` through that
 * model's own route, judged against the site's class like any other call.
 */
export type SiteFallback = { model: string; afterMs: number };

/** A site an eval moved off its tier's model: the model, the host the eval ran it on, and its fallback. */
export type SiteChoice = { model: string; host?: string; fallback?: SiteFallback };

/**
 * Sites whose code default is not their tier's model, because an eval picked
 * another one for them. Each names the OpenRouter host the eval ran on, since
 * the same model's quality moves with its host, and may name a fallback that
 * bounds how long a person waits on it. An `AI_MODEL_<SITE>` override still
 * wins over the entry, and the entry's host applies only while the site is on
 * the entry's model, because a host pinned for one model may not serve another.
 */
export const SITE_MODELS: Readonly<Record<string, SiteChoice>> = {
  // Y.67.3 (10 Oct 2026): Qwen won 11 of 12 pairwise against Sonnet 5 on
  // roadmap-assist at about a twelfth of the cost, on the host the eval used.
  // Its p50 is 8.1 s and its worst 20 s, against Sonnet's 1.8 s, and 2 of 12
  // calls needed a host retry; the site answers a client live, so Sonnet 5
  // takes over at 12 s, past Qwen's p50 and well short of its worst case.
  "roadmap-assist": {
    model: "qwen/qwen3.8-flash",
    host: "alibaba",
    fallback: { model: "claude-sonnet-5", afterMs: 12_000 },
  },
};

/**
 * The site an ai_calls row names when the fallback answered for `site`: the
 * row says it was a fallback without a column for it, and a fallback rate is
 * one group-by away.
 */
export function fallbackSiteOf(site: string): string {
  return `${site}:fallback`;
}

/** `AI_MODEL_<SITE>` for a logAiUsage site name. */
export function envNameFor(site: string): string {
  return `AI_MODEL_${site.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
}

type Env = Record<string, string | undefined>;

function nonBlank(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Resolve the model for one call site. `env` is injectable for tests; every
 * production caller uses the default `process.env`.
 */
export function modelFor(site: string, tier: Tier, env: Env = process.env): string {
  const specific = nonBlank(env[envNameFor(site)]);
  if (specific) return specific;
  const legacy = SITE_ENV[site];
  const shared = legacy ? nonBlank(env[legacy]) : undefined;
  if (shared) return shared;
  return SITE_MODELS[site]?.model ?? TIERS[tier];
}

/**
 * The model for a site that shares another site's model (`modelSite`), as
 * the writer's steps share `brand-writer` (Y.71.1). The site's own
 * `AI_MODEL_<SITE>` wins, so setting one step's model moves that step and no
 * other; without it the shared name resolves as `modelFor` does. A site with
 * no `modelSite` is exactly `modelFor(site, tier)`. The gateway, the
 * check:ai-routing gate and the Z.15.5 invariant all resolve through this.
 */
export function siteModelFor(site: string, modelSite: string | null | undefined, tier: Tier, env: Env = process.env): string {
  if (modelSite && modelSite !== site) {
    const own = nonBlank(env[envNameFor(site)]);
    if (own) return own;
  }
  return modelFor(modelSite ?? site, tier, env);
}

/** The env names that can move a site's model, most specific first. */
export function siteOverrideNames(site: string, modelSite: string | null | undefined): string[] {
  const key = modelSite ?? site;
  const names = key !== site ? [envNameFor(site)] : [];
  names.push(envNameFor(key));
  const legacy = SITE_ENV[key];
  if (legacy) names.push(legacy);
  return names;
}

/** `AI_HOST_<SITE>`: the OpenRouter endpoint a site is pinned to, beside its `AI_MODEL_<SITE>`. */
export function hostEnvNameFor(site: string): string {
  return `AI_HOST_${site.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
}

/**
 * The OpenRouter host configured for one site (Y.79), such as "xiaomi/fp8", or
 * null for none. The same model is served at fp4, fp8 and bf16 and its quality
 * moves with it, so a site moved onto an open model by its eval names the host
 * the eval ran on. The gateway sends it as OpenRouter's provider order, under
 * the class's guards, and refuses an fp4 host; on a Claude model it is unused,
 * because Claude has one host. Keyed by the same name as the model override.
 *
 * `AI_HOST_<SITE>` wins. Without it, the site's `SITE_MODELS` host applies
 * when `model` (the model the site resolved) is the entry's own, so an
 * override onto another model does not inherit a pin made for this one.
 */
export function hostFor(site: string, env: Env = process.env, model?: string): string | null {
  const configured = nonBlank(env[hostEnvNameFor(site)]);
  if (configured) return configured;
  const choice = SITE_MODELS[site];
  return choice?.host && model?.trim() === choice.model ? choice.host : null;
}

/**
 * The fallback a site declares in `SITE_MODELS`, or null for none (Y.67.3).
 * It belongs to the site, not to its model: it bounds how long a person waits
 * on the site whichever model an override puts it on, except when that model
 * is the fallback itself, where there is nothing to fall back to.
 */
export function fallbackFor(site: string, model: string): SiteFallback | null {
  const fallback = SITE_MODELS[site]?.fallback;
  return fallback && fallback.model !== model.trim() ? fallback : null;
}
