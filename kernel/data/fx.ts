// USD conversion for money amounts. It has no data of its own — one rate
// lookup over HTTP — so it sits in the kernel rather than in the entity that
// happens to call it most (RS-04). Native amount_cents/currency stay the
// transaction record of truth; amount_usd_cents is a derived reporting value
// so cross-currency sums (e.g. deal value on the contacts list) are safe to add.
// USD deals short-circuit — no network call, rate is always exactly 1.

import { saigonToday } from "@/kernel/config/dates";

const FX_API = "https://api.frankfurter.dev/v1/latest";

export type FxConversion = {
  amountUsdCents: number;
  rate: number;
  asOf: string;
};

export type FxRate = { rate: number; asOf: string };

// One currency's current rate to USD. Throws when the source has no rate for
// it: the ECB reference set does not carry every currency (VND is absent), and
// a guessed rate would be a wrong figure rather than a missing one.
export async function usdRate(currency: string): Promise<FxRate> {
  const code = currency.trim().toUpperCase();
  if (code === "USD") return { rate: 1, asOf: saigonToday() };

  const res = await fetch(`${FX_API}?base=${encodeURIComponent(code)}&symbols=USD`);
  if (!res.ok) throw new Error(`FX lookup failed for ${code}: ${res.status}`);

  const data = (await res.json()) as { date?: string; rates?: Record<string, number> };
  const rate = data.rates?.USD;
  if (!rate) throw new Error(`FX lookup returned no USD rate for ${code}`);
  return { rate, asOf: data.date ?? saigonToday() };
}

export async function convertToUsdCents(amountCents: number, currency: string): Promise<FxConversion> {
  const { rate, asOf } = await usdRate(currency);
  return { amountUsdCents: Math.round(amountCents * rate), rate, asOf };
}
