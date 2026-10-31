// The cached US-dollar rates other entities read and write (A.65, ADR 0018).
// The cost side of a forecast converts through them: a cost in another
// currency must reach a dollar figure, because silently dropping it makes
// every runway longer than it is. A deal edit or an event's P&L line that has
// just looked a rate up caches it here for every money trigger that reads the
// table; ./fx-refresh.ts keeps the cached ones current overnight.
import { companyOs } from "@/kernel/data/supabase";
import type { Result } from "@/kernel/data/result";

/** Every cached rate, up to five hundred currencies. */
export async function fxRates() {
  return companyOs.from("fx_rates").select("currency, rate_to_usd").limit(500);
}

/** Caches a freshly looked-up rate for one currency (lower-case code), replacing any older one. */
export async function cacheFxRate(currency: string, rateToUsd: number): Promise<Result> {
  const { error } = await companyOs
    .from("fx_rates")
    .upsert({ currency, rate_to_usd: rateToUsd, updated_at: new Date().toISOString() }, { onConflict: "currency" });
  return error ? { ok: false, error: error.message } : { ok: true };
}
