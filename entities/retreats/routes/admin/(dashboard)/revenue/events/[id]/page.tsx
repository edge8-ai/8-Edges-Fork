import { requirePermission } from "@/kernel/identity/access-request";
import { selectSurveys } from "@/entities/org";
import { selectSurveyResponses } from "@/entities/org";
import { SurfaceLink as Link } from "@/kernel/shell/SurfaceLink";
import Image from "next/image";
import { notFound } from "next/navigation";
import { companyOs } from "@/kernel/data/supabase";
import { selectProducts } from "@/entities/finance";
import { listAssignablePeople, listPeopleNames } from "@/entities/crm";
import { PageHead } from "@/kernel/ui/PageHead";
import { MetricCard } from "@/kernel/ui/MetricCard";
import { Tabs } from "@/kernel/ui/Tabs";
import { formatCents, formatDate, humanize } from "@/kernel/ui/format";
import { Badge, statusTone } from "@/kernel/ui/Badge";
import { eventPath, normalizeRegistrationStatus, qrPngDataUrl, type EventStatus, type EventType, type EventVisibility } from "@/entities/retreats";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { eventStatusBadge } from "../EventStatusBadge";
import { RosterTab, type RosterRegistration, type RosterTier } from "./RosterTab";
import { EventSettings, type EventSettingsData, type SettingsTier, type SurveyOption } from "./EventSettings";
import { getEventPnlLines } from "@/entities/retreats/lib/event-pnl";
import { PnlTab } from "./PnlTab";
import { getEventAgenda } from "@/entities/retreats/lib/event-agenda";
import { AgendaTab } from "./AgendaTab";
import { TeamMembersTab } from "./TeamMembersTab";
import { one } from "@/kernel/config/embedded";
import type { TripCostSlot } from "@/kernel/shell/page-slots";

// Ops console for one event: KPIs + signup/feedback QRs, the full roster
// (statuses, manual add, check-in, waitlist promote, bulk no-show, CSV
// export), a revenue ledger, and Settings — the single place everything gets
// edited (fields, survey link, tickets, media, archive). The list-page shelf
// is a read-only summary that links here.

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
  blurb: string | null;
  description: string | null;
  cover_image_url: string | null;
  media: unknown;
  archived_at: string | null;
  feedback_survey_id: string | null;
  attendee_count_override: number | null;
  registered_count_override: number | null;
  metadata: Record<string, unknown> | null;
};

type TierDbRow = {
  id: string;
  title: string | null;
  tier: string | null;
  description: string | null;
  amount_cents: number | null;
  currency: string | null;
  capacity: number | null;
  active: boolean;
};

type RegDbRow = {
  id: string;
  product_id: string | null;
  person_id: string | null;
  attendee_name: string | null;
  attendee_email: string | null;
  status: string | null;
  guest_count: number | null;
  waitlist_position: number | null;
  ticket_code: string | null;
  checked_in_at: string | null;
  created_at: string;
  people: { full_name: string | null; email: string } | { full_name: string | null; email: string }[] | null;
  products: { title: string | null; tier: string | null } | { title: string | null; tier: string | null }[] | null;
  orders:
    | { id: string; amount_usd_cents: number | null; currency: string | null; status: string | null; created_at: string; stripe_session_id: string | null }
    | { id: string; amount_usd_cents: number | null; currency: string | null; status: string | null; created_at: string; stripe_session_id: string | null }[]
    | null;
};

const COUNTED_STATUSES = new Set(["registered", "attended", "confirmed"]);

export default async function EventDetailPage(props: { params: Promise<{ id: string }>; tripCostPanel?: TripCostSlot }) {
  await requirePermission("retreats.events");
  const TripCost = props.tripCostPanel ?? null; // A trip's paid claims under the P&L, from a page slot whose provider retreats never names (RB.12).
  const params = await props.params;
  const [eventRes, tiersRes, regsRes, surveysRes, talksRes, eventTalksRes, pnlLines, roster, agendaBlocks, cloneSourcesRes] = await Promise.all([
    companyOs
      .from("events")
      .select(
        "id, slug, type, status, visibility, title, location, starts_at, ends_at, capacity, landing_path, notes, blurb, description, cover_image_url, media, archived_at, feedback_survey_id, attendee_count_override, registered_count_override, metadata"
      )
      .eq("id", params.id)
      .maybeSingle(),
    selectProducts("id, title, tier, description, amount_cents, currency, capacity, active")
      .eq("event_id", params.id)
      .order("amount_cents", { ascending: true }),
    companyOs
      .from("event_registrations")
      .select(
        "id, product_id, person_id, attendee_name, attendee_email, status, guest_count, waitlist_position, ticket_code, checked_in_at, created_at, people(full_name, email), products(title, tier), orders(id, amount_usd_cents, currency, status, created_at, stripe_session_id)"
      )
      .eq("event_id", params.id)
      .order("created_at", { ascending: true }),
    selectSurveys("id, name")
      .is("archived_at", null)
      .eq("status", "published")
      .order("name", { ascending: true }),
    companyOs.from("talks").select("id, title").eq("active", true).order("sort_order", { ascending: true }),
    companyOs.from("event_talks").select("talk_id").eq("event_id", params.id),
    getEventPnlLines(params.id),
    listAssignablePeople(),
    getEventAgenda(params.id),
    companyOs
      .from("events")
      .select("id, title")
      .is("archived_at", null)
      .neq("id", params.id)
      .order("starts_at", { ascending: false, nullsFirst: false })
      .limit(50),
  ]);

  const cloneSources = ((cloneSourcesRes.data ?? []) as { id: string; title: string }[]).map((e) => ({
    id: e.id,
    title: e.title,
  }));

  const rosterIds = new Set(roster.map((p) => p.id));
  const alreadyOnEvent = [
    ...pnlLines.map((l) => l.personId),
    ...agendaBlocks.flatMap((b) => b.staff.map((s) => s.personId)),
  ].filter((id): id is string => Boolean(id) && !rosterIds.has(id as string));
  const departedNames = await listPeopleNames(alreadyOnEvent);
  const pnlPeople = [...roster, ...Array.from(departedNames, ([id, name]) => ({ id, name }))];

  const event = eventRes.data as EventDbRow | null;
  if (!event) notFound();

  const tiers = (tiersRes.data ?? []) as TierDbRow[];
  const regRows = (regsRes.data ?? []) as unknown as RegDbRow[];

  const registrations: RosterRegistration[] = regRows.map((r) => {
    const p = one(r.people);
    const prod = one(r.products);
    const order = one(r.orders);
    return {
      id: r.id,
      productId: r.product_id,
      personId: r.person_id,
      name: r.attendee_name || p?.full_name || null,
      email: r.attendee_email || p?.email || null,
      tierTitle: prod?.title ?? null,
      tierLabel: prod?.tier ?? null,
      status: normalizeRegistrationStatus(r.status ?? "registered"),
      guestCount: r.guest_count ?? 0,
      waitlistPosition: r.waitlist_position,
      ticketCode: r.ticket_code,
      checkedInAt: r.checked_in_at,
      createdAt: r.created_at,
      order: order
        ? {
            id: order.id,
            amountUsdCents: order.amount_usd_cents,
            currency: order.currency,
            status: order.status,
            createdAt: order.created_at,
            stripeSessionId: order.stripe_session_id,
          }
        : null,
    };
  });

  const rosterTiers: RosterTier[] = tiers.map((t) => ({
    id: t.id,
    title: t.title ?? "(untitled tier)",
    tier: t.tier,
    amountCents: t.amount_cents ?? 0,
    currency: t.currency ?? "usd",
  }));

  const registeredSeats = registrations
    .filter((r) => COUNTED_STATUSES.has(r.status))
    .reduce((s, r) => s + 1 + r.guestCount, 0);
  // Manual overrides win over the derived count: client keynotes/workshops have
  // no signups, so the admin enters the headcount by hand.
  const usingManualCount = event.registered_count_override != null || event.attendee_count_override != null;
  const effectiveRegistered = event.registered_count_override ?? event.attendee_count_override ?? registeredSeats;
  const pendingCount = registrations.filter((r) => r.status === "pending_payment").length;
  const waitlistedCount = registrations.filter((r) => r.status === "waitlisted").length;
  const checkedInCount = registrations.filter((r) => !!r.checkedInAt).length;
  const collectedUsdCents = registrations
    .filter((r) => COUNTED_STATUSES.has(r.status))
    .reduce((s, r) => s + (r.order?.amountUsdCents ?? 0), 0);
  const pendingUsdCents = registrations
    .filter((r) => r.status === "pending_payment")
    .reduce((s, r) => s + (r.order?.amountUsdCents ?? 0), 0);

  const origin = await getSiteOrigin();
  const signupUrl = `${origin}${eventPath(event.slug)}`;
  const signupQr = await qrPngDataUrl(signupUrl);

  let feedbackQr: { url: string; png: string } | null = null;
  if (event.feedback_survey_id) {
    const { data: survey, error: surveyError } = await selectSurveys("slug").eq("id", event.feedback_survey_id).maybeSingle();
    if (surveyError) console.error("[revenue/events] feedback survey load failed:", surveyError.message);
    if (survey?.slug) {
      const url = `${origin}/surveys/${survey.slug}?cohort=${event.slug}`;
      feedbackQr = { url, png: await qrPngDataUrl(url) };
    }
  }

  // My Retreat access code (from the event metadata) and the guest hub link.
  const accessCode = typeof event.metadata?.access_code === "string" ? (event.metadata.access_code as string) : null;
  const myRetreatUrl = `${origin}/my-retreat/${event.slug}`;

  // Feedback results: survey responses stamped with this event's cohort_slug,
  // tallied per survey.
  const { data: fbRows, error: fbError } = await selectSurveyResponses("submitted_at, surveys(id, slug, name)").eq("cohort_slug", event.slug);
  if (fbError) console.error("[revenue/events] feedback rows load failed:", fbError.message);
  const fbBySurvey = new Map<string, { id: string; name: string; slug: string; count: number; last: string | null }>();
  for (const r of (fbRows ?? []) as { submitted_at: string | null; surveys: { id: string; slug: string; name: string } | { id: string; slug: string; name: string }[] | null }[]) {
    const s = one(r.surveys);
    if (!s) continue;
    const cur = fbBySurvey.get(s.id) ?? { id: s.id, name: s.name, slug: s.slug, count: 0, last: null };
    cur.count += 1;
    if (r.submitted_at && (!cur.last || r.submitted_at > cur.last)) cur.last = r.submitted_at;
    fbBySurvey.set(s.id, cur);
  }
  const feedback = Array.from(fbBySurvey.values()).sort((a, b) => b.count - a.count);
  const feedbackTotal = feedback.reduce((s, f) => s + f.count, 0);

  const overview = (
    <>
      <div className="admin-kpi-grid u-mb-5">
        <MetricCard
          label="Registered"
          value={event.capacity ? `${effectiveRegistered} / ${event.capacity}` : String(effectiveRegistered)}
          sub={usingManualCount ? "manual count" : waitlistedCount ? `${waitlistedCount} waitlisted` : "seats incl. guests"}
        />
        <MetricCard label="Paid / Pending" value={formatCents(collectedUsdCents, "usd")} sub={pendingCount ? `${formatCents(pendingUsdCents, "usd")} pending (${pendingCount})` : "no pending orders"} />
        <MetricCard label="Checked in" value={checkedInCount} sub={`of ${effectiveRegistered || 0} registered`} />
        <MetricCard label="Revenue" value={formatCents(collectedUsdCents, "usd")} sub="USD · registered+" />
      </div>

      {(accessCode || feedback.length > 0) && (
        <div className="u-grid-auto-md u-mb-5">
          {accessCode && (
            <div className="admin-card admin-section-card">
              <div className="admin-card-title">My Retreat access</div>
              <div className="u-stack u-mt-3">
                <div>
                  <div className="admin-cell-muted u-sm">Access code</div>
                  <code className="admin-cell-mono u-h-20">{accessCode}</code>
                </div>
                <div>
                  <div className="admin-cell-muted u-sm">Guest link</div>
                  <a className="admin-cell-mono u-break-all" href={myRetreatUrl} target="_blank" rel="noopener noreferrer">
                    {origin}/my-retreat
                  </a>
                </div>
                <div className="admin-cell-muted u-sm">
                  Guests enter the code, then their email, to open their itinerary and surveys.
                </div>
              </div>
            </div>
          )}
          <div className="admin-card admin-section-card">
            <div className="admin-card-title">Feedback ({feedbackTotal})</div>
            {feedback.length === 0 ? (
              <div className="admin-empty u-mt-3">No survey responses yet for this event.</div>
            ) : (
              <div className="u-stack u-mt-3">
                {feedback.map((f) => (
                  <div key={f.id} className="u-row u-gap-3 u-between">
                    <Link href={`/admin/operations/surveys/${f.id}`} className="u-strong">
                      {f.name}
                    </Link>
                    <span className="admin-cell-muted u-sm u-nowrap">
                      {f.count} {f.count === 1 ? "response" : "responses"}
                      {f.last ? ` · last ${formatDate(f.last)}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className={feedbackQr ? "u-grid-2 u-gap-5" : undefined}>
        <QrBlock title="Signup link" url={signupUrl} png={signupQr} downloadName={`${event.slug}-signup-qr.png`} />
        {feedbackQr && <QrBlock title="Feedback survey" url={feedbackQr.url} png={feedbackQr.png} downloadName={`${event.slug}-feedback-qr.png`} />}
      </div>
    </>
  );

  const revenue = (
    <div className="admin-table-wrap">
      <div className="admin-table-scroll">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Attendee</th>
              <th>Tier</th>
              <th>Order status</th>
              <th className="u-right">Amount</th>
              <th>Placed</th>
            </tr>
          </thead>
          <tbody>
            {registrations.filter((r) => r.order).length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <div className="admin-empty">No orders for this event.</div>
                </td>
              </tr>
            ) : (
              registrations
                .flatMap((r) => (r.order ? [{ ...r, order: r.order }] : []))
                .map((r) => (
                  <tr key={r.id}>
                    <td className="admin-cell-strong">{r.name || r.email || "—"}</td>
                    <td>{r.tierTitle || "—"}</td>
                    <td>
                      <Badge tone={statusTone(r.order.status)}>{humanize(r.order.status)}</Badge>
                    </td>
                    <td className="admin-cell-mono u-right">
                      {formatCents(r.order.amountUsdCents, r.order.currency ?? "usd")}
                    </td>
                    <td>{formatDate(r.order.createdAt)}</td>
                  </tr>
                ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const surveys: SurveyOption[] = ((surveysRes.data ?? []) as { id: string; name: string }[]).map((x) => ({
    id: x.id,
    name: x.name,
  }));

  const settingsTiers: SettingsTier[] = tiers.map((t) => ({
    id: t.id,
    title: t.title ?? "(untitled tier)",
    description: t.description,
    amountCents: t.amount_cents ?? 0,
    currency: t.currency ?? "usd",
    capacity: t.capacity,
    active: t.active,
  }));

  const settingsData: EventSettingsData = {
    id: event.id,
    slug: event.slug,
    title: event.title,
    type: event.type,
    status: event.status,
    visibility: event.visibility,
    location: event.location,
    startsAt: event.starts_at,
    endsAt: event.ends_at,
    capacity: event.capacity,
    landingPath: event.landing_path,
    notes: event.notes,
    blurb: event.blurb,
    description: event.description,
    coverImageUrl: event.cover_image_url,
    media: Array.isArray(event.media) ? (event.media as EventSettingsData["media"]) : [],
    feedbackSurveyId: event.feedback_survey_id,
    archivedAt: event.archived_at,
    totalRegistrations: registrations.length,
    attendeeCountOverride: event.attendee_count_override,
    registeredCountOverride: event.registered_count_override,
  };

  const talkOptions = ((talksRes.data ?? []) as { id: string; title: string }[]).map((t) => ({
    id: t.id,
    title: t.title,
  }));
  const selectedTalkIds = ((eventTalksRes.data ?? []) as { talk_id: string }[]).map((t) => t.talk_id);

  return (
    <>
      <PageHead
        eyebrow={<Link href="/admin/revenue/events">← Events</Link>}
        title={event.title}
        sub={`${humanize(event.type)} · ${event.location ?? "location TBD"}`}
        action={eventStatusBadge(event.status, event.archived_at)}
      />

      <Tabs
        tabs={[
          { key: "overview", label: "Overview", content: overview },
          { key: "roster", label: "Attendees", count: registrations.length, content: <RosterTab eventId={event.id} eventSlug={event.slug} tiers={rosterTiers} registrations={registrations} /> },
          { key: "revenue", label: "Revenue", content: revenue },
          {
            key: "pnl",
            label: "P&L",
            content: (
              <>
                <PnlTab eventId={event.id} lines={pnlLines} autoRevenueUsdCents={collectedUsdCents} people={pnlPeople} />
                {TripCost && <TripCost eventId={event.id} />}
              </>
            ),
          },
          {
            key: "agenda",
            label: "Agenda",
            count: agendaBlocks.length,
            content: <AgendaTab eventId={event.id} blocks={agendaBlocks} people={pnlPeople} cloneSources={cloneSources} />,
          },
          {
            key: "team",
            label: "Team Members",
            content: <TeamMembersTab blocks={agendaBlocks} />,
          },
          { key: "settings", label: "Settings", content: <EventSettings event={settingsData} tiers={settingsTiers} surveys={surveys} talks={talkOptions} selectedTalkIds={selectedTalkIds} /> },
        ]}
      />
    </>
  );
}

function QrBlock({ title, url, png, downloadName }: { title: string; url: string; png: string; downloadName: string }) {
  return (
    <div>
      <div className="admin-cell-muted u-mb-2 u-label">
        {title}
      </div>
      <div className="u-row-top u-gap-3">
        <Image src={png} alt={`QR code for ${url}`} width={120} height={120} className="admin-box" />
        <div className="u-stack u-min-0">
          <code className="admin-cell-mono u-break-all">
            {url}
          </code>
          <a className="admin-btn" href={png} download={downloadName}>
            Download PNG
          </a>
        </div>
      </div>
    </div>
  );
}
