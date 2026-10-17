import { upsertFxRates } from "@/entities/finance";
import { usdRate } from "@/kernel/data/fx";

// A deal's USD value belongs to the database: the deals_derive_usd trigger
// (supabase/migrations/20260928160000, R.24) derives amount_usd_cents, fx_rate
// and fx_rate_fetched_at from company_os.fx_rates whenever the amount or the
// currency changes, for every writer, SQL included. What is left to a writer
// in the app is to make that cached rate current just before it writes an
// amount, so a deal saved on the board converts at today's rate rather than at
// whatever the last refresh left behind.
//
// Best-effort, on purpose: a failed lookup or cache write costs the rate's
// freshness and nothing else. The trigger still derives the figure from the
// cached rate, so a failure can no longer leave a USD value that belongs to an
// earlier amount, which is what the old in-app conversion did when it threw.
export async function refreshFxRate(currency: string): Promise<void> {
  const code = currency.trim().toLowerCase();
  if (!code || code === "usd") return;
  try {
    const { rate } = await usdRate(code);
    const { error } = await upsertFxRates(
      { currency: code, rate_to_usd: rate, updated_at: new Date().toISOString() },
      { onConflict: "currency" },
    );
    if (error) console.error(`[crm] caching the ${code} rate failed:`, error.message);
  } catch (err) {
    console.error(`[crm] FX lookup for ${code} failed:`, err);
  }
}
