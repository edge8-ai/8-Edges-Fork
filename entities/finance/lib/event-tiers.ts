// An event's ticket tiers, which are rows of finance's products table with an
// event_id (A.65, ADR 0018). The retreats entity owns the event and asks these
// questions about its tiers; finance owns the rows, so it owns what a tier is:
// a product of type "event", priced in US dollars, live from the moment it is
// added.
//
// Each question makes exactly the query its caller used to build by hand
// around `selectProducts(columns)`. The public page's tier list and the admin
// event page order their tiers differently (by the admin's sort order, or by
// price), so they stay separate questions rather than one picked for both.
import { companyOs } from "@/kernel/data/supabase";

/**
 * One event's tiers in the admin's sort order, cheapest first within it. Only
 * the active ones unless `activeOnly` is false, which the admin screens that
 * manage inactive tiers pass.
 */
export async function eventTiers(eventId: string, { activeOnly = true }: { activeOnly?: boolean } = {}) {
  const query = companyOs
    .from("products")
    .select("id, event_id, title, tier, description, amount_cents, amount_usd_cents, currency, capacity, sort_order, active")
    .eq("event_id", eventId)
    .order("sort_order", { ascending: true })
    .order("amount_cents", { ascending: true });
  return activeOnly ? query.eq("active", true) : query;
}

/** One event's tiers, active or not, cheapest first, as the admin event page manages them. */
export async function eventTiersByPrice(eventId: string) {
  return companyOs
    .from("products")
    .select("id, title, tier, description, amount_cents, currency, capacity, active")
    .eq("event_id", eventId)
    .order("amount_cents", { ascending: true });
}

/** Every event's tiers, active or not, cheapest first: the events list groups them by event. */
export async function allEventTiersByPrice() {
  return companyOs
    .from("products")
    .select("id, event_id, title, tier, description, amount_cents, amount_usd_cents, currency, capacity, active")
    .not("event_id", "is", null)
    .order("amount_cents", { ascending: true });
}

/** One tier of one event, for a registration: null when it is not that event's. */
export async function eventTier(eventId: string, tierId: string) {
  return companyOs
    .from("products")
    .select("id, title, amount_cents, currency, active")
    .eq("id", tierId)
    .eq("event_id", eventId)
    .maybeSingle();
}

/** How many tiers an event has, active or not: a count with no rows. */
export async function countEventTiers(eventId: string) {
  return companyOs.from("products").select("id", { count: "exact", head: true }).eq("event_id", eventId);
}

/**
 * The product slugs that begin with `prefix`. Slugs are unique across every
 * product, so a new tier's slug is chosen against these.
 */
export async function productSlugsStartingWith(prefix: string) {
  return companyOs.from("products").select("slug").like("slug", `${prefix}%`);
}

export type NewEventTier = {
  slug: string;
  title: string;
  tier: string;
  description: string | null;
  amountCents: number;
  capacity: number | null;
  sortOrder: number;
};

/** Adds a live, US-dollar tier to an event and answers its id. */
export async function addTierToEvent(eventId: string, input: NewEventTier) {
  return companyOs
    .from("products")
    .insert({
      type: "event",
      event_id: eventId,
      slug: input.slug,
      title: input.title,
      tier: input.tier,
      description: input.description,
      amount_cents: input.amountCents,
      currency: "usd",
      capacity: input.capacity,
      sort_order: input.sortOrder,
      active: true,
    })
    .select("id")
    .single();
}

/** Turns one of an event's tiers on or off; the row is null when the tier is not that event's. */
export async function setEventTierActive(eventId: string, tierId: string, active: boolean) {
  return companyOs.from("products").update({ active }).eq("id", tierId).eq("event_id", eventId).select("id").maybeSingle();
}
