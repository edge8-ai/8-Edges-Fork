// The question crm asks of bookings (A.69, ADR 0018). Until A.69 the door
// handed out `selectBookings(columns)` and crm's person record built the query
// itself; this makes exactly the query it made.
import { companyOs } from "@/kernel/data/supabase";

/** One person's bookings, newest first: the bookings tab of their CRM record. */
export async function bookingsOfPerson(personId: string) {
  return companyOs
    .from("bookings")
    .select("id, kind, start_date, end_date, party_size, amount_cents, amount_usd_cents, currency, status, created_at")
    .eq("person_id", personId)
    .order("created_at", { ascending: false });
}
