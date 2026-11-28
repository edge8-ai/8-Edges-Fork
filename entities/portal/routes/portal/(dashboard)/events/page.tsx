import { requirePortalPermission } from "@/kernel/identity/access-request";
import { getMyEvents, type PortalEventRegistration } from "@/entities/portal/lib/events";
import { getUpcomingPublicEvents } from "@/entities/retreats";
import { formatEventDates, eventPath, type EventRecord } from "@/entities/retreats";
import { PageHead } from "@/kernel/ui/PageHead";
import { Badge, statusTone } from "@/kernel/ui/Badge";
import { formatDate, humanize } from "@/kernel/ui/format";
import { internalPath } from "@/kernel/ui/url";

// My Events: self-scoped by construction (event_registrations.person_id =
// actor.personId, enforced in entities/portal/lib/events.ts). No company scoping
// needed — this is the one module that follows the person, not the account.
// The "Open for registration" list is public events only (same rows the
// public /events/[slug] pages serve), so it needs no actor scoping.
function dateRange(startsAt: string | null, endsAt: string | null): string {
  if (!startsAt) return "—";
  const start = formatDate(startsAt);
  if (!endsAt || endsAt === startsAt) return start;
  return `${start} → ${formatDate(endsAt)}`;
}

function EventCard({ reg }: { reg: PortalEventRegistration }) {
  return (
    <div className="admin-card admin-section-card" key={reg.id}>
      <div className="u-row-top u-between u-wrap">
        <div>
          <h2 className="admin-card-title u-mb-1">{reg.eventTitle || "Event"}</h2>
          <div className="admin-cell-muted">
            {dateRange(reg.startsAt, reg.endsAt)}
            {reg.location ? ` · ${reg.location}` : ""}
            {reg.tierTitle ? ` · ${reg.tierTitle}` : ""}
          </div>
        </div>
        <Badge tone={statusTone(reg.status)}>{humanize(reg.status)}</Badge>
      </div>
    </div>
  );
}

function PublicEventCard({ event }: { event: EventRecord }) {
  return (
    <div className="admin-card admin-section-card">
      <div className="u-row-top u-between u-wrap">
        <div>
          <h2 className="admin-card-title u-mb-1">{event.title}</h2>
          <div className="admin-cell-muted">
            {formatEventDates(event.starts_at, event.ends_at, event.timezone)}
            {event.location ? ` · ${event.location}` : ""}
          </div>
          {event.blurb && (
            <p className="admin-page-sub u-m-0 u-mt-2">{event.blurb}</p>
          )}
        </div>
        <a className="admin-btn admin-btn--sm" href={internalPath(event.landing_path) ?? eventPath(event.slug)}>
          View &amp; register
        </a>
      </div>
    </div>
  );
}

export default async function PortalEventsPage() {
  const actor = await requirePortalPermission("surface.portal");
  const [registrations, publicEvents] = await Promise.all([
    getMyEvents(actor),
    getUpcomingPublicEvents(),
  ]);

  const today = new Date().toISOString();
  const upcoming = registrations.filter((r) => r.startsAt && r.startsAt >= today);
  const past = registrations.filter((r) => !r.startsAt || r.startsAt < today);

  // Don't advertise an event this person is already registered for.
  const registeredEventIds = new Set(registrations.map((r) => r.eventId).filter(Boolean));
  const openEvents = publicEvents.filter((e) => !registeredEventIds.has(e.id));

  return (
    <>
      <PageHead eyebrow="Client Portal" title="My Events" sub="Your registrations, plus what's coming up at Edge8." />

      <div className="admin-card admin-section-card">
        <h2 className="admin-card-title">Upcoming ({upcoming.length})</h2>
      </div>
      {upcoming.length === 0 ? (
        <div className="admin-card admin-section-card">
          <div className="admin-empty">Nothing upcoming.</div>
        </div>
      ) : (
        upcoming.map((r) => <EventCard reg={r} key={r.id} />)
      )}

      <div className="admin-card admin-section-card">
        <h2 className="admin-card-title">Open for registration ({openEvents.length})</h2>
      </div>
      {openEvents.length === 0 ? (
        <div className="admin-card admin-section-card">
          <div className="admin-empty">No public events are open right now. New retreats and workshops land here first.</div>
        </div>
      ) : (
        openEvents.map((e) => <PublicEventCard event={e} key={e.id} />)
      )}

      <div className="admin-card admin-section-card">
        <h2 className="admin-card-title">Past ({past.length})</h2>
      </div>
      {past.length === 0 ? (
        <div className="admin-card admin-section-card">
          <div className="admin-empty">No past events.</div>
        </div>
      ) : (
        past.map((r) => <EventCard reg={r} key={r.id} />)
      )}
    </>
  );
}
