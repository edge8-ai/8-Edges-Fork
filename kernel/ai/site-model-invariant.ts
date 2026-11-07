import baseline from "@/scripts/ai-routing-baseline.json";
import { companyOs } from "@/kernel/data/supabase";
import type { Invariant } from "@/kernel/audit/invariants";
import { fallbackSiteOf, siteModelFor, type Tier } from "./models";

// Z.15.5: each site's model in ai_calls equals what modelFor resolves for it
// today. The code's choice is scripts/ai-routing-baseline.json (check:ai-routing
// keeps it in step with the tree); a Vercel override (AI_MODEL_<SITE>) moves it,
// and modelFor reads the same environment this check runs in. A stray override
// left behind after a migration, or a site calling a model the registry never
// named, shows here as a model the site was not meant to use (plan G5).

// A site on another provider (brand-image on Gemini) has no tier or model key:
// its model is not the registry's to choose, so it is not checked here.
type SiteEntry = { tier?: Tier; modelKey?: string; fallback?: { model: string } };
type Baseline = { files: Record<string, Record<string, SiteEntry>> };

/** The model or models each declared site should be calling now. */
export function expectedModels(env: Record<string, string | undefined> = process.env): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const sites of Object.values((baseline as unknown as Baseline).files)) {
    for (const [site, entry] of Object.entries(sites)) {
      if (!entry.modelKey || !entry.tier) continue;
      const models = out.get(site) ?? new Set<string>();
      models.add(siteModelFor(site, entry.modelKey, entry.tier, env));
      out.set(site, models);
      // A fallback's row names `<site>:fallback` (Y.67.3), on the model the code declares for it.
      if (entry.fallback) out.set(fallbackSiteOf(site), new Set([entry.fallback.model]));
    }
  }
  return out;
}

/** Sites the registry declares on another provider, whose model it does not choose. */
function otherProviderSites(): Set<string> {
  const out = new Set<string>();
  for (const sites of Object.values((baseline as unknown as Baseline).files)) {
    for (const [site, entry] of Object.entries(sites)) if (!entry.modelKey || !entry.tier) out.add(site);
  }
  return out;
}

/**
 * Z.15.4: every AI call that answered carries a cost (Y.76). A null cost on a
 * successful call is a model missing from the price table in kernel/ai/prices.ts,
 * and the spend it stands for is invisible until someone adds it.
 */
export function callsCarryACost(): Invariant {
  return {
    id: "Z.15.4",
    name: "every AI call that answered carries a cost",
    check: async (now) => {
      const since = new Date(now.getTime() - 86_400_000).toISOString();
      const { data, error } = await companyOs
        .from("ai_calls")
        .select("site, model")
        .eq("ok", true)
        .is("cost_usd", null)
        .gte("created_at", since)
        .limit(500);
      if (error) throw new Error(`ai_calls: ${error.message}`);
      const rows = data ?? [];
      if (rows.length === 0) return { ok: true, detail: "every answered AI call in the last day has a cost" };
      const models = [...new Set(rows.map((r) => `${r.model} (${r.site})`))].join(", ");
      return { ok: false, detail: `${rows.length} answered call(s) with no cost; add their model to kernel/ai/prices.ts: ${models}` };
    },
  };
}

export function siteModelsMatch(): Invariant {
  return {
    id: "Z.15.5",
    name: "each AI site called the model the registry names",
    check: async (now) => {
      const since = new Date(now.getTime() - 86_400_000).toISOString();
      const { data, error } = await companyOs.from("ai_calls").select("site, model").gte("created_at", since).limit(20000);
      if (error) throw new Error(`ai_calls: ${error.message}`);
      const expected = expectedModels();
      const unchecked = otherProviderSites();
      const wrong = new Map<string, Set<string>>();
      for (const row of data ?? []) {
        if (unchecked.has(row.site)) continue;
        const want = expected.get(row.site);
        // A site the registry does not declare is outside the gateway's rules;
        // it is as wrong as a model the registry never named.
        if (want && want.has(row.model)) continue;
        const seen = wrong.get(row.site) ?? new Set<string>();
        seen.add(row.model);
        wrong.set(row.site, seen);
      }
      const calls = (data ?? []).length;
      if (wrong.size === 0) return { ok: true, detail: `${calls} AI calls in the last day, each on its site's model` };
      const named = [...wrong]
        .map(([site, models]) => {
          const want = expected.get(site);
          return `${site} called ${[...models].join("/")}${want ? `, expected ${[...want].join("/")}` : " (not a declared site)"}`;
        })
        .join("; ");
      return { ok: false, detail: named };
    },
  };
}
