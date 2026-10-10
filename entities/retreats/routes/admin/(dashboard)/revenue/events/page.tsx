import { requirePermission } from "@/kernel/identity/access-request";
import { companyOs } from "@/kernel/data/supabase";
import { selectProducts } from "@/entities/finance";
import { PageHead } from "@/kernel/ui/PageHead";
import { MetricCard } from "@/kernel/ui/MetricCard";
import { formatCents } from "@/kernel/ui/format";
import { normalizeRegistrationStatus, type EventStatus, type EventType, type EventVisibility } from "@/entities/retreats";
import { EventsTable } from "./EventsTable";
import { NewEventButton } from "./NewEventButton";
import type { EventAttendee, EventRow, EventTierRow } from "./EventManage";
import { one } from "@/kernel/config/embedded";

export const metadata = {
  title: "Events",
  description: "Retreats, workshops, and other events — schedule, tiers, and registrations.",
};

// Revenue office: Events. Replaces the cohort-aggregated Public Retreats page
// now that company_os.events is a first-class row (PR 1). The catalogue is
// small, so rows load once and the client table owns search, filter, paging,
// and the manage shelf — rows + shelf must be one client tree for the row
// click to reliably open (a server-rendered preview injecting a client shelf
// never opens).

type EventDbRow = {
  id: string;
  slug: string;
  type: EventType;
  status: EventStatus;
  visibility: EventVisibility;
  title: string;
  location: string | null;
  starts_at: string | null;
  ends_at: string | null;
  capacity: number | null;
  landing_path: string | null;
  notes: string | null;
  archived_at: string | null;
  attendee_count_override: number | null;
  registered_count_override: number | null;
};

type TierDbRow = {
  id: string;
  event_id: string | null;
  title: string | null;
  tier: string | null;
  description: string | null;
  amount_cents: number | null;
  amount_usd_cents: number | null;
  currency: string | null;
  capacity: number | null;
  active: boolean;
};

type RegDbRow = {
  event_id: string | null;
  status: string | null;
  attendee_name: string | null;
  attendee_email: string | null;
  person_id: string | null;
  guest_count: number | null;
  checked_in_at: string | null;
  people: { full_name: string | null; email: string } | { full_name: string | null; email: string }[] | null;
  products: { tier: string | null } | { tier: string | null }[] | null;
  orders: { amount_usd_cents: number | null } | { amount_usd_cents: number | null }[] | null;
};

// Seats that represent a real (or held) attendee — mirrors the seat-holding
// set the register_for_event RPC counts against capacity. Used for the
// "Registered" count and revenue; excludes cancelled/no_show/refunded/waitlisted.
const COUNTED_STATUSES = new Set(["registered", "attended", "confirmed"]);

export default async function EventsPage() {
  await requirePermission("retreats.events");
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

  const year = now.getUTCFullYear();

  const [eventsRes, tiersRes, regsRes, monthRevenueRes, attendeesRes] = await Promise.all([
    companyOs
      .from("events")
      .select("id, slug, type, status, visibility, title, location, starts_at, ends_at, capacity, landing_path, notes, archived_at, attendee_count_override, registered_count_override")
      .order("starts_at", { ascending: false, nullsFirst: false }),
    selectProducts("id, event_id, title, tier, description, amount_cents, amount_usd_cents, currency, capacity, active")
      .not("event_id", "is", null)
      .order("amount_cents", { ascending: true }),
    companyOs
      .from("event_registrations")
      .select(
        "event_id, status, attendee_name, attendee_email, person_id, guest_count, checked_in_at, people(full_name, email), products(tier), orders(amount_usd_cents)"
      )
      .not("event_id", "is", null),
    companyOs
      .from("event_registrations")
      .select("orders!inner(amount_usd_cents, created_at)")
      .not("event_id", "is", null)
      .in("status", ["registered", "attended", "confirmed"])
      .gte("orders.created_at", monthStart),
    companyOs.rpc("workshop_attendees_total", { p_year: year }),
  ]);

  const yearAttendees = typeof attendeesRes.data === "number" ? attendeesRes.data : null;

  const error = eventsRes.error?.message ?? tiersRes.error?.message ?? regsRes.error?.message ?? null;

  const revenueThisMonth = ((monthRevenueRes.data ?? []) as { orders: { amount_usd_cents: number | null } | { amount_usd_cents: number | null }[] | null }[]).reduce(
    (s, r) => s + (one(r.orders)?.amount_usd_cents ?? 0),
    0
  );

  const tiersByEvent = new Map<string, EventTierRow[]>();
  for (const t of (tiersRes.data ?? []) as TierDbRow[]) {
    if (!t.event_id) continue;
    const list = tiersByEvent.get(t.event_id) ?? [];
    list.push({
      id: t.id,
      title: t.title ?? "(untitled tier)",
      tier: t.tier,
      description: t.description,
      amountCents: t.amount_cents ?? 0,
      currency: t.currency ?? "usd",
      capacity: t.capacity,
      active: t.active,
    });
    tiersByEvent.set(t.event_id, list);
  }

  const attendeesByEvent = new Map<string, EventAttendee[]>();
  const countsByEvent = new Map<string, { registered: number; total: number; collectedUsdCents: number }>();
  for (const r of (regsRes.data ?? []) as RegDbRow[]) {
    if (!r.event_id) continue;
    const status = normalizeRegistrationStatus(r.status ?? "registered");
    const p = one(r.people);
    const prod = one(r.products);
    const order = one(r.orders);

    const list = attendeesByEvent.get(r.event_id) ?? [];
    list.push({
      name: r.attendee_name || p?.full_name || null,
      email: r.attendee_email || p?.email || null,
      tier: prod?.tier ?? null,
      status,
      personId: r.person_id,
      guestCount: r.guest_count ?? 0,
      checkedInAt: r.checked_in_at,
    });
    attendeesByEvent.set(r.event_id, list);

    const counts = countsByEvent.get(r.event_id) ?? { registered: 0, total: 0, collectedUsdCents: 0 };
    counts.total += 1;
    if (COUNTED_STATUSES.has(status)) {
      counts.registered += 1 + (r.guest_count ?? 0);
      counts.collectedUsdCents += order?.amount_usd_cents ?? 0;
    }
    countsByEvent.set(r.event_id, counts);
  }

  const rows: EventRow[] = ((eventsRes.data ?? []) as EventDbRow[]).map((e) => {
    const tiers = tiersByEvent.get(e.id) ?? [];
    const activeTiers = tiers.filter((t) => t.active);
    const fromCents = activeTiers.length > 0 ? Math.min(...activeTiers.map((t) => t.amountCents)) : 0;
    const counts = countsByEvent.get(e.id) ?? { registered: 0, total: 0, collectedUsdCents: 0 };
    return {
      id: e.id,
      slug: e.slug,
      type: e.type,
      status: e.status,
      visibility: e.visibility,
      title: e.title,
      location: e.location,
      startsAt: e.starts_at,
      endsAt: e.ends_at,
      capacity: e.capacity,
      landingPath: e.landing_path,
      notes: e.notes,
      archivedAt: e.archived_at,
      tiers,
      attendees: attendeesByEvent.get(e.id) ?? [],
      effectiveAttendees: e.attendee_count_override ?? counts.registered,
      registeredCount: e.registered_count_override ?? counts.registered,
      totalCount: counts.total,
      fromUsdCents: fromCents,
      collectedUsdCents: counts.collectedUsdCents,
    };
  });

  const activeRows = rows.filter((r) => !r.archivedAt);
  const openEvents = activeRows.filter((r) => r.status === "open").length;
  const totalRegistered = activeRows.reduce((s, r) => s + r.registeredCount, 0);
  const totalCollected = activeRows.reduce((s, r) => s + r.collectedUsdCents, 0);

  return (
    <>
      <PageHead
        eyebrow="Revenue"
        title="Events"
        sub={`${activeRows.length.toLocaleString()} ${activeRows.length === 1 ? "event" : "events"}`}
        action={<NewEventButton />}
      />
      {error && (
        <div className="admin-alert admin-alert--err u-mb-4">
          {error}
        </div>
      )}

      <div className="admin-kpi-grid u-mb-5">
        <MetricCard label="Total Collected" value={formatCents(totalCollected, "usd")} sub="USD · registered+" />
        <MetricCard label="Revenue this Month" value={formatCents(revenueThisMonth, "usd")} sub="USD · registered+" />
        <MetricCard label="Open events" value={openEvents} sub={`of ${activeRows.length} scheduled`} />
        <MetricCard label="Registered" value={totalRegistered} sub="seats incl. guests" />
        <MetricCard
          label={`${year} Attendees`}
          value={yearAttendees ?? "—"}
          sub="of 1,000 goal · feeds home page"
        />
      </div>

      <EventsTable rows={rows} />
    </>
  );
}
