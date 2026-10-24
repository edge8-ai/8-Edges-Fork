// What a claim item was spent on: the plan's nine categories (section 10),
// in the order the form lists them. Code rather than a table (design §1.1): the
// check constraint on reimbursement_claim_items.category and its `Valid
// values:` comment mirror this list, so widening it is this constant plus a
// migration that widens the check, never a reference table nobody maintains.
// Client-safe: the claim form renders its select from it.
export const CLAIM_CATEGORIES = [
  "transport",
  "flights",
  "accommodation",
  "meals_travel",
  "client_entertainment",
  "software",
  "equipment",
  "training_events",
  "other",
] as const;

export type ClaimCategory = (typeof CLAIM_CATEGORIES)[number];

export const CLAIM_CATEGORY_LABEL: Record<ClaimCategory, string> = {
  transport: "Transport (Grab, Be, taxi, own driver)",
  flights: "Flights",
  accommodation: "Accommodation",
  meals_travel: "Meals",
  client_entertainment: "Client entertainment",
  software: "Software & subscriptions",
  equipment: "Equipment",
  training_events: "Training & events",
  other: "Other (explain)",
};

export function isClaimCategory(value: string): value is ClaimCategory {
  return (CLAIM_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Whether an item of this category may go without any document (RB.15, Mai,
 * 2026-10-09). Rides are booked in an app (Grab, Be) or with the person's own
 * driver, who is paid another way, so a red invoice for one was never
 * realistic: transport takes a red invoice or a receipt when there is one and
 * asks for nothing when there is not. The screens do not advertise it (RB.16,
 * Mai): a ride still brings its invoice where it can; it is only not blocked.
 */
export function documentOptional(category: string): boolean {
  return category === "transport";
}
