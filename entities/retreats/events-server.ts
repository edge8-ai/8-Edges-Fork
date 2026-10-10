import { randomBytes } from "crypto";
import { companyOs, rpcArgs } from "@/kernel/data/supabase";
import { selectProducts } from "@/entities/finance";
import type { EventRecord, EventTier, RegistrationStatus } from "./events";

// Server-only event helpers: queries, ticket-code generation, and the
// register_for_event RPC wrapper. NEVER import from a client component —
// shared types and pure display helpers live in lib/events.ts.

// Crockford base32 (no I, L, O, U) — unambiguous when printed or read aloud.
// 12 chars = 60 bits; 256 % 32 === 0, so byte % 32 is uniform (no modulo
// bias). Must match company_os.new_ticket_code() in the DB.
const TICKET_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function newTicketCode(len = 12): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += TICKET_ALPHABET[bytes[i] % 32];
  return out;
}

export async function getEventBySlug(slug: string): Promise<EventRecord | null> {
  const { data, error } = await companyOs
    .from("events")
    .select("*")
    .eq("slug", slug)
    .is("archived_at", null)
    .maybeSingle();
  if (error) {
    console.error("getEventBySlug failed:", error.message);
    return null;
  }
  // `events.media` is jsonb (`Json`); EventRecord names the shape the writers
  // put there, which the generated type cannot express.
  return (data as unknown as EventRecord) ?? null;
}

// Tiers for an event, cheapest first within sort order. Pass activeOnly=false
// on admin surfaces that manage inactive tiers.
export async function getEventTiers(
  eventId: string,
  { activeOnly = true }: { activeOnly?: boolean } = {}
): Promise<EventTier[]> {
  let query = selectProducts(
      "id, event_id, title, tier, description, amount_cents, amount_usd_cents, currency, capacity, sort_order, active"
    )
    .eq("event_id", eventId)
    .order("sort_order", { ascending: true })
    .order("amount_cents", { ascending: true });
  if (activeOnly) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) {
    console.error("getEventTiers failed:", error.message);
    return [];
  }
  return (data as EventTier[]) ?? [];
}

// Publicly visible upcoming events ("published" = announced, "open" =
// registration open): powers the portal's Upcoming events list. Public data
// by definition, so no actor scoping.
export async function getUpcomingPublicEvents(limit = 12): Promise<EventRecord[]> {
  const { data, error } = await companyOs
    .from("events")
    .select("*")
    .eq("visibility", "public")
    .in("status", ["published", "open"])
    .gte("starts_at", new Date().toISOString())
    .is("archived_at", null)
    .order("starts_at", { ascending: true })
    .limit(limit);
  if (error) {
    console.error("getUpcomingPublicEvents failed:", error.message);
    return [];
  }
  // Same jsonb `media` column as getEventBySlug.
  return (data as unknown as EventRecord[]) ?? [];
}

// What the team has coming up, for the team Home's "Coming up" card (TH.1.6):
// announced or open events of any visibility, because the team's own keynotes
// and retreats are private on the public site but are exactly what a teammate
// wants to see. Only the fields the card prints. A failed read returns null so
// the card hides rather than claiming nothing is planned (Rule 2).
export type TeamEvent = { id: string; title: string; type: string; startsAt: string; location: string | null };

export async function upcomingTeamEvents(limit: number): Promise<TeamEvent[] | null> {
  const { data, error } = await companyOs
    .from("events")
    .select("id, title, type, starts_at, location")
    .in("status", ["published", "open"])
    .gte("starts_at", new Date().toISOString())
    .is("archived_at", null)
    .order("starts_at", { ascending: true })
    .limit(limit);
  if (error) {
    console.error("upcomingTeamEvents failed:", error.message);
    return null;
  }
  return ((data ?? []) as { id: string; title: string; type: string; starts_at: string; location: string | null }[]).map((e) => ({
    id: e.id,
    title: e.title,
    type: e.type,
    startsAt: e.starts_at,
    location: e.location,
  }));
}

export type RegisterForEventInput = {
  eventId: string;
  personId: string;
  productId?: string | null;
  attendeeName?: string | null;
  attendeeEmail?: string | null;
  guestCount?: number;
  holdForPayment?: boolean;
  orderId?: string | null;
};

export type RegisterForEventResult = {
  registration_id: string;
  status: RegistrationStatus;
  waitlist_position: number | null;
  ticket_code: string | null;
  already_registered: boolean;
};

// Atomic seat reservation via the register_for_event RPC (SELECT FOR UPDATE
// on the event row; held seats counted as 1 + guest_count). Throws on
// business-rule rejections — message is one of: event_not_found,
// event_not_open, product_not_for_event, tier_full — or on a missing RPC
// (deploy-before-migrate); callers own their fallback/UX.
export async function registerForEvent(
  input: RegisterForEventInput
): Promise<RegisterForEventResult> {
  const { data, error } = await companyOs.rpc(
    "register_for_event",
    rpcArgs({
      p_event_id: input.eventId,
      p_person_id: input.personId,
      p_product_id: input.productId ?? null,
      p_attendee_name: input.attendeeName ?? null,
      p_attendee_email: input.attendeeEmail ?? null,
      p_guest_count: input.guestCount ?? 0,
      p_hold_for_payment: input.holdForPayment ?? false,
      p_order_id: input.orderId ?? null,
    }),
  );
  if (error) throw new Error(error.message);
  return data as RegisterForEventResult;
}
