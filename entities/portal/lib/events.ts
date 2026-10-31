// Client-visible event registrations ("My Events"). Unlike team.ts/time-off.ts/
// invoices.ts, this scope is a plain single-column filter (person_id = actor's
// own id) with no cross-client fan-out and no forbidden columns, so it goes
// through the generic entities/portal/lib/data.ts allowlist rather than a bespoke
// reviewed helper.

import type { PortalActor } from "@/kernel/identity/portal-auth";
import { portalRead } from "@/entities/portal/lib/data";
import { one, type Embedded } from "@/kernel/config/embedded";

export type PortalEventRegistration = {
  id: string;
  eventId: string | null;
  status: string;
  eventTitle: string | null;
  eventType: string | null;
  location: string | null;
  startsAt: string | null;
  endsAt: string | null;
  tierTitle: string | null;
};

type Row = {
  id: string;
  event_id: string | null;
  status: string;
  events: Embedded<{ title: string | null; type: string | null; location: string | null; starts_at: string | null; ends_at: string | null }>;
  products: Embedded<{ title: string | null }>;
};

export async function getMyEvents(actor: PortalActor): Promise<PortalEventRegistration[]> {
  const { data, error: eventRegistrationsError } = await portalRead(
    actor,
    "event_registrations",
    "id, event_id, status, events(title, type, location, starts_at, ends_at), products(title)",
  ).order("id", { ascending: false });
  if (eventRegistrationsError) console.error("[portal] event_registrations read failed:", eventRegistrationsError.message);

  return ((data ?? []) as unknown as Row[]).map((r) => {
    const event = one(r.events);
    const product = one(r.products);
    return {
      id: r.id,
      eventId: r.event_id,
      status: r.status,
      eventTitle: event?.title ?? null,
      eventType: event?.type ?? null,
      location: event?.location ?? null,
      startsAt: event?.starts_at ?? null,
      endsAt: event?.ends_at ?? null,
      tierTitle: product?.title ?? null,
    };
  });
}
