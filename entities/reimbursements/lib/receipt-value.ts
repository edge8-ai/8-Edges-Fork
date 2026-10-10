// The VND value a receipt reading fills in (RB.10), split from
// receipt-reading.ts for the file-size cap. It asks the same rate lookup the
// owner's form does, for the receipt's owner, so the owner's own manual rate
// never values it (A.34).
import { itemValue, type ItemValueColumns } from "./claim-rules";
import type { ItemFields, Prefill } from "./receipt-reading";
import { rateFor } from "./vnd-rates";

/**
 * The VND value of a receipt abroad whose amount, currency or date the reading
 * just filled in (RB.10): at the bank's selling rate on its date, the same
 * lookup the owner's form uses, or rate pending when no bank has one or it
 * has no date yet. Nothing for a dong receipt (prefillFor values it), for one
 * valued at what the card charged, which always wins, or when the reading
 * filled in nothing the value depends on.
 */
export async function valueAbroad(prefill: Prefill, after: ItemFields, chargedVnd: number | null, owner: string): Promise<Partial<ItemValueColumns>> {
  const touched = "amount_cents" in prefill || "currency" in prefill || "bought_on" in prefill;
  if (!touched || after.currency === "vnd" || chargedVnd !== null || !(Number(after.amount_cents) > 0)) return {};
  const rate = after.bought_on ? await rateFor(after.currency, after.bought_on, { owner }) : null;
  return itemValue({ amount: Number(after.amount_cents), currency: after.currency, chargedVnd: null, rate });
}
