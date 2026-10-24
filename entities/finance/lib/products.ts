// The questions other entities ask of the product catalogue as a whole (A.65,
// ADR 0018). An event's ticket tiers are products too; the questions the
// events screens ask about them are in ./event-tiers.ts.
import { companyOs } from "@/kernel/data/supabase";

/** Every product's price, up to five thousand: what a subscription renews at. */
export async function productPrices() {
  return companyOs.from("products").select("id, amount_cents, amount_usd_cents, currency").limit(5000);
}

/**
 * What the given products are called: an order names what was bought by its
 * product's `title`. Products have no `name` column, and asking for one is how
 * the team assistant's client summary failed for every client with an order
 * (A.72); the literal column list here lets the generated types catch that.
 */
export async function productTitles(ids: string[]) {
  return companyOs.from("products").select("id, title").in("id", ids);
}

/** How many active products start on or after `fromIso`: a count with no rows. */
export async function countUpcomingProducts(fromIso: string) {
  return companyOs.from("products").select("*", { count: "exact", head: true }).eq("active", true).gte("date_start", fromIso);
}
