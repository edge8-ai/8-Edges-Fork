import { companyOs, rpcArgs } from "@/kernel/data/supabase";
import { BLOCKED_PERSONAS, isMarketingEligible } from "@/entities/campaigns/lib/broadcasts";
import { one } from "@/kernel/config/embedded";
import { NAME_COLUMNS, type NamedPerson, personName } from "@/kernel/config/people-name";

// Reads for the Revenue → Marketing hub. Two sources, both already populated:
// company_os.interactions (every email lib/email.ts has ever accepted) and
// company_os.people (the audience). Vercel traffic comes from
// lib/admin/vercel-analytics.ts, which this module deliberately does not wrap —
// the page composes the two so a slow Vercel call can't gate the CRM reads.

export type MarketingRange = "7d" | "30d" | "90d" | "all";

const RANGE_DAYS: Record<Exclude<MarketingRange, "all">, number> = { "7d": 7, "30d": 30, "90d": 90 };

export function rangeSince(range: MarketingRange): string | null {
  if (range === "all") return null;
  return new Date(Date.now() - RANGE_DAYS[range] * 24 * 60 * 60 * 1000).toISOString();
}

// ---------------------------------------------------------------- email sends

// Which side of the business an email came from.
//
// "outbound" is email a person meant to send to a customer or prospect: the
// newsletter engine, and 1:1 sales correspondence logged to the CRM.
// "transactional" is everything the system sends on its own: portal invites,
// onboarding and coaching nudges, board digests, password links.
//
// The classifier is an allowlist of outbound sources, and everything unknown
// falls to transactional. That direction is deliberate: adding a new cron must
// never make its mail silently appear in a sales and marketing view.
export type EmailAudience = "all" | "outbound" | "transactional";

// Sent by lib/marketing-email.ts. Every campaign send uses one of these.
const MARKETING_SOURCES = new Set(["marketing", "marketing_campaign", "marketing_test"]);

// Human-written correspondence captured into the CRM timeline, rather than
// anything a cron produced. These are real sales threads with prospects.
const SALES_SOURCES = new Set(["lark_mail", "inbound_email", "manual_entry"]);

export function classifyEmail(source: string): Exclude<EmailAudience, "all"> {
  return MARKETING_SOURCES.has(source) || SALES_SOURCES.has(source) ? "outbound" : "transactional";
}

export function emailKindLabel(source: string): string {
  if (MARKETING_SOURCES.has(source)) return "Marketing";
  if (SALES_SOURCES.has(source)) return "Sales";
  return "Transactional";
}

export type EmailSendRow = {
  id: string;
  subject: string | null;
  to: string;
  source: string;
  kind: Exclude<EmailAudience, "all">;
  kindLabel: string;
  occurredAt: string;
  personId: string | null;
  recipientName: string | null;
};

export type EmailActivity = {
  // Exact count of every email in the window, whatever the filter.
  total: number;
  // Per-bucket counts, from the sampled window rather than an exact count.
  counts: { all: number; outbound: number; transactional: number };
  // True when the breakdown was sampled rather than counted whole. The headline
  // total stays exact either way, so the UI can say which is which.
  breakdownTruncated?: boolean;
  bySource: { label: string; value: number }[];
  recent: EmailSendRow[];
  error?: string;
};

type InteractionRow = {
  id: string;
  subject: string | null;
  occurred_at: string;
  person_id: string | null;
  metadata: Record<string, unknown> | null;
  people: NamedPerson | null;
};

// metadata.source is set by every lib/email.ts caller (defaulting to "system").
// Unlabelled rows predate the convention rather than being a real source.
function sourceOf(meta: Record<string, unknown> | null): string {
  const raw = meta?.source;
  return typeof raw === "string" && raw.trim() ? raw : "unlabelled";
}

function recipientOf(meta: Record<string, unknown> | null): string {
  const raw = meta?.to;
  return typeof raw === "string" ? raw : "";
}

const RECENT_LIMIT = 12;
// Ceiling on the rows pulled for the source breakdown. Each campaign send logs
// one interaction per recipient, so this table grows by hundreds per newsletter
// and counting rows client-side would eventually be both slow and wrong (once it
// passes PostgREST's row cap the fetch truncates silently). The headline total
// comes from an exact count instead, and only the breakdown is sampled.
const BREAKDOWN_LIMIT = 2000;

export async function getEmailActivity(
  range: MarketingRange,
  audience: EmailAudience = "all",
): Promise<EmailActivity> {
  const since = rangeSince(range);

  const countQuery = companyOs
    .from("interactions")
    .select("id", { count: "exact", head: true })
    .eq("kind", "email");
  if (since) countQuery.gte("occurred_at", since);

  let rowQuery = companyOs
    .from("interactions")
    .select(`id, subject, occurred_at, person_id, metadata, people:people!person_id(${NAME_COLUMNS})`)
    .eq("kind", "email")
    .order("occurred_at", { ascending: false })
    .limit(BREAKDOWN_LIMIT);
  if (since) rowQuery = rowQuery.gte("occurred_at", since);

  const emptyCounts = { all: 0, outbound: 0, transactional: 0 };

  const [{ count, error: countError }, { data, error }] = await Promise.all([countQuery, rowQuery]);
  const readError = countError ?? error;
  if (readError) return { total: 0, counts: emptyCounts, bySource: [], recent: [], error: readError.message };

  const rows = (data ?? []) as unknown as InteractionRow[];

  // Classify once, then derive the bucket counts, the breakdown, and the recent
  // list from the same pass so the number in the tab always matches the list.
  const classified = rows.map((row) => {
    const source = sourceOf(row.metadata);
    const person = one(row.people);
    return {
      id: row.id,
      subject: row.subject,
      to: recipientOf(row.metadata),
      source,
      kind: classifyEmail(source),
      kindLabel: emailKindLabel(source),
      occurredAt: row.occurred_at,
      personId: row.person_id,
      recipientName: personName(person, null),
    } satisfies EmailSendRow;
  });

  const bucketCounts = { ...emptyCounts, all: classified.length };
  for (const row of classified) bucketCounts[row.kind] += 1;

  const selected = audience === "all" ? classified : classified.filter((row) => row.kind === audience);

  const counts = new Map<string, number>();
  for (const row of selected) {
    counts.set(row.source, (counts.get(row.source) ?? 0) + 1);
  }

  const recent = selected.slice(0, RECENT_LIMIT);

  return {
    total: count ?? rows.length,
    counts: bucketCounts,
    breakdownTruncated: rows.length >= BREAKDOWN_LIMIT,
    bySource: [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value })),
    recent,
  };
}

// ------------------------------------------------------------- deliverability

// Delivery feedback from Resend webhooks (company_os.email_events). Rates are
// expressed against DELIVERED rather than sent, which is the convention every
// ESP reports on and the only denominator that makes an open rate meaningful.

export type Deliverability = {
  hasData: boolean;
  sent: number;
  delivered: number;
  bounced: number;
  complained: number;
  opened: number;
  clicked: number;
  deliveryRate: number | null;
  bounceRate: number | null;
  complaintRate: number | null;
  openRate: number | null;
  clickRate: number | null;
  problems: { recipient: string; eventType: string; occurredAt: string; personId: string | null }[];
  error?: string;
};

type EventRow = {
  event_type: string;
  recipient: string;
  occurred_at: string;
  person_id: string | null;
  resend_email_id: string;
};

const PROBLEM_LIMIT = 15;
// The problem list is a worklist, not a count: the headline numbers come from
// the SQL aggregate, so scanning a bounded recent window here is safe.
const PROBLEM_SCAN_LIMIT = 500;

function rate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return (numerator / denominator) * 100;
}

export async function getDeliverability(range: MarketingRange): Promise<Deliverability> {
  const since = rangeSince(range);
  let query = companyOs.from("email_events").select("event_type, recipient, occurred_at, person_id, resend_email_id")
    .in("event_type", ["bounced", "complained"])
    .order("occurred_at", { ascending: false });
  if (since) query = query.gte("occurred_at", since);

  const empty: Deliverability = {
    hasData: false,
    sent: 0,
    delivered: 0,
    bounced: 0,
    complained: 0,
    opened: 0,
    clicked: 0,
    deliveryRate: null,
    bounceRate: null,
    complaintRate: null,
    openRate: null,
    clickRate: null,
    problems: [],
  };

  // Totals come from a SQL aggregate that counts DISTINCT emails (one email
  // fires 'opened' every time it is reopened, so counting rows would push the
  // rate past 100%). Doing it in SQL also sidesteps PostgREST's row cap, which
  // would otherwise start understating bounces after about two campaigns.
  const [{ data: agg, error: aggError }, { data, error }] = await Promise.all([
    companyOs.rpc("email_delivery_stats", rpcArgs({ p_since: since, p_campaign_id: null })),
    query.limit(PROBLEM_SCAN_LIMIT),
  ]);

  if (aggError) return { ...empty, error: aggError.message };
  if (error) return { ...empty, error: error.message };

  const byType = new Map(
    ((agg ?? []) as { event_type: string; unique_emails: number }[]).map((e) => [
      e.event_type,
      Number(e.unique_emails),
    ]),
  );

  const sent = byType.get("sent") ?? 0;
  const delivered = byType.get("delivered") ?? 0;
  const bounced = byType.get("bounced") ?? 0;
  const complained = byType.get("complained") ?? 0;
  const opened = byType.get("opened") ?? 0;
  const clicked = byType.get("clicked") ?? 0;

  if (sent + delivered + bounced + complained + opened + clicked === 0) return empty;

  const rows = (data ?? []) as EventRow[];

  // Denominator for delivery/bounce is everything Resend attempted; for
  // engagement it's what actually landed.
  const attempted = sent > 0 ? sent : delivered + bounced;

  const problems = rows
    .slice(0, PROBLEM_LIMIT)
    .map((r) => ({
      recipient: r.recipient,
      eventType: r.event_type,
      occurredAt: r.occurred_at,
      personId: r.person_id,
    }));

  return {
    hasData: true,
    sent,
    delivered,
    bounced,
    complained,
    opened,
    clicked,
    deliveryRate: rate(delivered, attempted),
    bounceRate: rate(bounced, attempted),
    complaintRate: rate(complained, attempted),
    openRate: rate(opened, delivered),
    clickRate: rate(clicked, delivered),
    problems,
  };
}

// -------------------------------------------------------------------- audience

export type AudienceBreakdown = {
  total: number;
  contactable: number;
  eligible: number;
  doNotContact: number;
  teamMembers: number;
  subscribed: number;
  unsubscribed: number;
  neverAsked: number;
  byPersona: { label: string; value: number }[];
  error?: string;
};

type PersonRow = {
  persona: string | null;
  do_not_contact: boolean;
  is_team_member: boolean;
  marketing_consent: string;
};

const PERSONA_LABELS: Record<string, string> = {
  job_seeker: "Job seeker",
  prospect: "Prospect",
  client: "Client",
  employee: "Employee",
  vendor: "Vendor",
  student: "Student",
};

export function personaLabel(persona: string | null): string {
  if (!persona) return "Unset";
  return PERSONA_LABELS[persona] ?? persona;
}

export async function getAudienceBreakdown(): Promise<AudienceBreakdown> {
  const { data, error } = await companyOs
    .from("people")
    .select("persona, do_not_contact, is_team_member, marketing_consent")
    .is("archived_at", null);

  if (error) {
    return {
      total: 0,
      contactable: 0,
      eligible: 0,
      doNotContact: 0,
      teamMembers: 0,
      subscribed: 0,
      unsubscribed: 0,
      neverAsked: 0,
      byPersona: [],
      error: error.message,
    };
  }

  const rows = (data ?? []) as PersonRow[];
  const counts = new Map<string, number>();
  let eligible = 0;
  let doNotContact = 0;
  let teamMembers = 0;
  let subscribed = 0;
  let unsubscribed = 0;
  let neverAsked = 0;

  for (const row of rows) {
    const key = personaLabel(row.persona);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (row.do_not_contact) doNotContact += 1;
    if (row.is_team_member) teamMembers += 1;
    if (row.marketing_consent === "subscribed") subscribed += 1;
    else if (row.marketing_consent === "unsubscribed") unsubscribed += 1;
    else neverAsked += 1;
    if (isMarketingEligible(row)) eligible += 1;
  }

  return {
    total: rows.length,
    contactable: rows.length - doNotContact,
    eligible,
    doNotContact,
    teamMembers,
    subscribed,
    unsubscribed,
    neverAsked,
    byPersona: [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value })),
  };
}

// -------------------------------------------------------------- recent contacts

export type RecentContact = {
  id: string;
  name: string;
  persona: string | null;
  source: string | null;
  createdAt: string;
};

export type RecentContacts = {
  rows: RecentContact[];
  error?: string;
};

// The newest people to enter the CRM, so the hub shows who marketing just picked
// up. Job seekers are excluded, matching the audience breakdown's BLOCKED_PERSONAS:
// this is the marketing hub, not the full contact list.
export async function getRecentContacts(limit = 5): Promise<RecentContacts> {
  // persona.is.null kept explicitly: a bare NOT IN drops null-persona rows,
  // and most fresh inbound contacts have no persona set yet.
  const blocked = [...BLOCKED_PERSONAS].join(",");
  const { data, error } = await companyOs
    .from("people")
    .select(`id, ${NAME_COLUMNS}, persona, source, created_at`)
    .is("archived_at", null)
    .or(`persona.is.null,persona.not.in.(${blocked})`)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return { rows: [], error: error.message };

  const rows = (data ?? []).map((r) => ({
    id: r.id as string,
    name: personName(r as NamedPerson, "Unknown"),
    persona: r.persona as string | null,
    source: r.source as string | null,
    createdAt: r.created_at as string,
  }));

  return { rows };
}
