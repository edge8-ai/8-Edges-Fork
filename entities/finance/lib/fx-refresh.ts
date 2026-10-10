import { companyOs } from "@/kernel/data/supabase";
import { usdRate } from "@/kernel/data/fx";

// company_os.fx_rates is the cached rate every money trigger reads: orders,
// products and bookings (set_amount_usd_cents) and deals (deals_derive_usd,
// R.24). Before this refresh nothing kept it current except a deal edit in
// the app, so the AUD rate sat at its 2026-07-07 value for eleven weeks while
// SQL-written deals and every Stripe order converted at it (Y.42).
//
// Each cached currency is refreshed on its own. The ECB reference set does
// not carry every currency (VND is absent), so a currency the source cannot
// price keeps its last cached rate and is reported as skipped rather than
// failing the run every night. The run fails only when no lookup succeeds,
// which is the source itself being down.
export type FxRefresh =
  | { ok: true; refreshed: { currency: string; rate: number; asOf: string }[]; skipped: { currency: string; reason: string }[] }
  | { ok: false; error: string };

export async function refreshCachedRates(): Promise<FxRefresh> {
  const { data, error } = await companyOs.from("fx_rates").select("currency");
  if (error) return { ok: false, error: error.message };

  const refreshed: { currency: string; rate: number; asOf: string }[] = [];
  const skipped: { currency: string; reason: string }[] = [];
  for (const { currency } of data ?? []) {
    if (currency === "usd") continue;
    try {
      const { rate, asOf } = await usdRate(currency);
      const { error: writeErr } = await companyOs
        .from("fx_rates")
        .update({ rate_to_usd: rate, updated_at: new Date().toISOString() })
        .eq("currency", currency);
      if (writeErr) skipped.push({ currency, reason: writeErr.message });
      else refreshed.push({ currency, rate, asOf });
    } catch (err) {
      skipped.push({ currency, reason: err instanceof Error ? err.message : String(err) });
    }
  }

  if (refreshed.length === 0 && skipped.length > 0) {
    return { ok: false, error: `No rate refreshed: ${skipped.map((s) => `${s.currency} (${s.reason})`).join("; ")}` };
  }
  return { ok: true, refreshed, skipped };
}
