import { companyOs } from "@/kernel/data/supabase";
import type { TablesInsert } from "@/kernel/data/supabase/database.types";
import { GREETING_COLUMNS } from "@/kernel/config/people-name";

// The writes other entities make to events and registrations (A.70, ADR 0018).
// Until A.70 the door handed out `insertEvents(row)`,
// `insertEventRegistrations(rows)` and `updateEventRegistrations(patch)`, and
// billing's Stripe fulfilment and reimbursements' trip chained their own
// filters and selects onto them. Each command here makes the exact write its
// caller made: the same payload, filters and returned columns.
// entities/retreats/lib/event-lookups.test.ts pins each one.

/** Adds an event and resolves to its `{ data: { id }, error }` (reimbursements adds a trip as a draft, internal event). */
export function addEvent(row: TablesInsert<{ schema: "company_os" }, "events">) {
  return companyOs.from("events").insert(row).select("id").single();
}

/** Inserts the registrations a paid order fulfils (billing's Infinite Leverage seats). Resolves to `{ error }`. */
export function recordPaidRegistrations(rows: TablesInsert<{ schema: "company_os" }, "event_registrations">[]) {
  return companyOs.from("event_registrations").insert(rows);
}

/**
 * Marks a registration that was waiting on payment as registered, and resolves
 * to the row with what its ticket email needs, or null when it was not waiting
 * (a redelivered webhook). Billing's paid checkout.
 */
export function confirmPaidRegistration(registrationId: string) {
  return companyOs
    .from("event_registrations")
    .update({ status: "registered" })
    .eq("id", registrationId)
    .eq("status", "pending_payment")
    .select(`id, ticket_code, attendee_email, confirmation_sent_at, people(${GREETING_COLUMNS}), events(title, location, starts_at, ends_at, timezone)`)
    .maybeSingle();
}

/** Stamps a registration's ticket email as sent now. Resolves to `{ error }`. */
export function stampTicketEmailSent(registrationId: string) {
  return companyOs.from("event_registrations").update({ confirmation_sent_at: new Date().toISOString() }).eq("id", registrationId);
}

/**
 * Releases a seat held for a checkout that failed: a registration still
 * waiting on payment becomes cancelled now, and nothing else changes. Resolves
 * to `{ error }`.
 */
export function releaseHeldRegistration(registrationId: string) {
  return companyOs
    .from("event_registrations")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", registrationId)
    .eq("status", "pending_payment");
}
