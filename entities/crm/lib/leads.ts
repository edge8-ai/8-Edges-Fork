// The lead table, as other entities count it (A.63). One lead row is created per
// person the SDR works, so the rows created in a window are the window's
// top-of-funnel volume, wherever each lead sits now.
import { companyOs } from "@/kernel/data/supabase";

/** How many leads were created between two timestamps, inclusive. */
export async function leadCountBetween(from: string, to: string) {
  return companyOs.from("lead").select("id", { count: "exact", head: true }).gte("created_at", from).lte("created_at", to);
}

/** When each lead created on or after `since` was created, at most `limit`. */
export async function leadsCreatedSince(since: string, limit: number) {
  return companyOs.from("lead").select("created_at").gte("created_at", since).limit(limit);
}
