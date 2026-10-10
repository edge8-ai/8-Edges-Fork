import { companyOs, companyOsUntyped, rpcArgs } from "@/kernel/data/supabase";
import { parseBroadcastBlocks, type BroadcastBlocks } from "./marketing-email-blocks"; // browser door: reached from a client component via marketing-calendar.ts
import { hardFailureReason, suppressedAddresses } from "./delivery-history";
import { brandMemberIds } from "./brand-audience";
import type { SendWindow } from "./send-window";
import { NAME_COLUMNS, type NamedPerson, personName } from "@/kernel/config/people-name";

// Broadcast (email send) reads and audience resolution. The table is still
// company_os.email_campaigns; "broadcast" is the product name for one send.
// The single most important function here is resolveAudience(). Every path that
// sends mail goes through it, and it is the only place that decides who is
// allowed to receive marketing email.

export type BroadcastStatus = "draft" | "approved" | "sending" | "sent" | "cancelled" | "missed";

export type BroadcastSegment = { personas?: string[]; sendWindow?: SendWindow };

export type BroadcastRow = {
  id: string;
  name: string;
  subject: string;
  preheader: string | null;
  bodyMd: string;
  blocks: BroadcastBlocks;
  status: BroadcastStatus;
  segment: BroadcastSegment;
  fromEmail: string | null;
  replyTo: string | null;
  batchSize: number;
  brandId: string | null;
  brandName: string | null;
  // A saved audience replaces segment.personas when set; a series id marks an
  // issue the series cron opened (lib/series.ts).
  audienceId: string | null;
  seriesId: string | null;
  scheduledAt: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  sentAt: string | null;
  createdBy: string | null;
  createdAt: string;
};

type DbBroadcast = {
  id: string;
  name: string;
  subject: string;
  preheader: string | null;
  body_md: string;
  blocks: unknown;
  status: string;
  segment: BroadcastSegment | null;
  from_email: string | null;
  reply_to: string | null;
  batch_size: number;
  brand_id: string | null;
  audience_id: string | null;
  series_id: string | null;
  scheduled_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  sent_at: string | null;
  created_by: string | null;
  created_at: string;
  brands: { name: string } | { name: string }[] | null;
};

const CAMPAIGN_SELECT =
  "id, name, subject, preheader, body_md, blocks, status, segment, from_email, reply_to, batch_size, brand_id, audience_id, series_id, scheduled_at, approved_at, approved_by, sent_at, created_by, created_at, brands(name)";

function mapBroadcast(row: DbBroadcast): BroadcastRow {
  return {
    id: row.id,
    name: row.name,
    subject: row.subject,
    preheader: row.preheader,
    bodyMd: row.body_md,
    blocks: parseBroadcastBlocks(row.blocks),
    status: row.status as BroadcastStatus,
    segment: row.segment ?? {},
    fromEmail: row.from_email,
    replyTo: row.reply_to,
    batchSize: row.batch_size,
    brandId: row.brand_id,
    brandName: (Array.isArray(row.brands) ? row.brands[0] : row.brands)?.name ?? null,
    audienceId: row.audience_id,
    seriesId: row.series_id,
    scheduledAt: row.scheduled_at,
    approvedAt: row.approved_at,
    approvedBy: row.approved_by,
    sentAt: row.sent_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export async function listBroadcasts(): Promise<{ rows: BroadcastRow[]; error?: string }> {
  // Deleted broadcasts are archived, never removed: they keep their
  // recipients and events, and leave the list and the calendar.
  const { data, error } = await companyOs.from("email_campaigns").select(CAMPAIGN_SELECT).is("archived_at", null).order("created_at", { ascending: false });
  if (error) return { rows: [], error: error.message };
  return { rows: ((data ?? []) as DbBroadcast[]).map(mapBroadcast) };
}

export async function getBroadcast(id: string): Promise<BroadcastRow | null> {
  const { data, error } = await companyOs.from("email_campaigns").select(CAMPAIGN_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return mapBroadcast(data as DbBroadcast);
}

// ------------------------------------------------------------------- audience

export type AudienceMember = { personId: string; email: string; name: string | null };

// Personas that never receive marketing email regardless of consent state.
// Enforced here rather than by remembering to filter at each call site. Exported
// so the marketing hub's audience breakdown counts against the exact same list
// the sender uses, and the two cannot drift apart. Job seekers are the only
// structurally excluded persona: prospects, clients, and employees all belong on
// the newsletter once they carry consent (the internal team included).
export const BLOCKED_PERSONAS = new Set(["job_seeker"]);

// The consent/suppression gate every marketing recipient must pass. This is the
// single source of truth: the sender (passesSuppression, below) and the hub's
// audience breakdown (lib/admin/marketing.ts) both call it, so the number shown
// and the number reached are computed identically. Team members are no longer
// suppressed structurally; consent alone decides, same as any other contact.
export function isMarketingEligible(row: {
  marketing_consent: string;
  do_not_contact: boolean;
  persona: string | null;
}): boolean {
  if (row.marketing_consent !== "subscribed") return false;
  if (row.do_not_contact) return false;
  if (row.persona && BLOCKED_PERSONAS.has(row.persona)) return false;
  return true;
}

type CandidateRow = {
  id: string;
  email: string;
  display_name: string | null;
  full_name: string | null;
  preferred_name: string | null;
  persona: string | null;
  do_not_contact: boolean;
  is_team_member: boolean;
  marketing_consent: string;
};

// The four gates every recipient passes, in order of how badly it would go if
// we got them wrong: consent, the CRM-wide contact ban, internal staff, and the
// personas that were never a marketing audience in the first place. Delegates to
// isMarketingEligible so the hub and the sender share one definition.
function passesSuppression(row: CandidateRow): boolean {
  return isMarketingEligible(row);
}

// Paged explicitly. PostgREST caps an unbounded select at its row limit and
// truncates silently, which here would quietly shrink the audience with no
// error shown, so the size of the list would depend on how big the CRM had
// grown. Paging until a short page arrives is the only way to know it is whole.
const AUDIENCE_PAGE = 500;

export async function resolveAudience(
  segment: BroadcastSegment,
  brandId?: string | null,
  // A saved audience's matched people (lib/audiences.ts). When given, only these
  // are candidates; the consent and suppression gates below still apply.
  onlyIds?: string[],
): Promise<{ members: AudienceMember[]; error?: string }> {
  const personas = (segment.personas ?? []).filter((p) => !BLOCKED_PERSONAS.has(p));
  const members: AudienceMember[] = [];

  // The same delivery-history rule the send gate applies, so the built list and
  // its count match who is actually mailed.
  const suppressed = await suppressedAddresses();
  if (suppressed.error) return { members: [], error: suppressed.error };

  // Guest-brand scoping. null = home brand (or no brand): no restriction.
  let restrictIds: string[] | null = null;
  if (brandId) {
    const { ids, error } = await brandMemberIds(brandId);
    if (error) return { members: [], error };
    if (ids !== null) {
      // Guest brand. Empty membership must yield nobody, not the house list.
      if (ids.length === 0) return { members: [] };
      restrictIds = ids;
    }
  }
  if (onlyIds) {
    const only = new Set(onlyIds);
    restrictIds = restrictIds ? restrictIds.filter((id) => only.has(id)) : onlyIds;
    if (restrictIds.length === 0) return { members: [] };
  }

  // A guest brand's candidate set is its membership; page over those ids so the
  // same consent/suppression gates still apply. The home brand pages the whole
  // subscribed list as before.
  const idChunks: (string[] | null)[] = restrictIds
    ? chunk(restrictIds, AUDIENCE_PAGE)
    : [null];

  for (const idChunk of idChunks) {
    for (let offset = 0; ; offset += AUDIENCE_PAGE) {
      let query = companyOs
        .from("people")
        .select(`id, ${NAME_COLUMNS}, persona, do_not_contact, is_team_member, marketing_consent`)
        .is("archived_at", null)
        .eq("marketing_consent", "subscribed")
        .order("id", { ascending: true })
        .range(offset, offset + AUDIENCE_PAGE - 1);

      if (personas.length > 0) query = query.in("persona", personas);
      if (idChunk) query = query.in("id", idChunk);

      const { data, error } = await query;
      if (error) return { members: [], error: error.message };

      const page = (data ?? []) as CandidateRow[];
      for (const row of page) {
        if (!passesSuppression(row)) continue;
        if (suppressed.addresses.has(row.email.toLowerCase())) continue;
        members.push({
          personId: row.id,
          email: row.email,
          name: personName(row, null),
        });
      }

      // A restricted chunk is at most AUDIENCE_PAGE ids, so one page drains it.
      if (page.length < AUDIENCE_PAGE) break;
    }
  }

  return { members };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Re-check one person at send time. The audience is resolved when recipients are
// built, which can be hours or days before the last batch goes out; somebody can
// unsubscribe in between.
//
// The three outcomes are deliberately distinct. A failed lookup is NOT a
// suppression: treating it as one would permanently mark the recipient
// "skipped" over a transient database timeout and they would never be mailed.
// The caller leaves those pending so the next tick retries.
export type SendGate =
  | { verdict: "send" }
  | { verdict: "suppress"; reason: string }
  | { verdict: "error"; message: string };

export async function checkSendGate(personId: string, email: string): Promise<SendGate> {
  const { data, error } = await companyOs
    .from("people")
    .select(`id, ${NAME_COLUMNS}, persona, do_not_contact, is_team_member, marketing_consent, archived_at`)
    .eq("id", personId)
    .maybeSingle();

  if (error) return { verdict: "error", message: error.message };
  if (!data) return { verdict: "suppress", reason: "person no longer exists" };

  const row = data as CandidateRow & { archived_at: string | null };
  if (row.archived_at) return { verdict: "suppress", reason: "contact archived" };
  if (row.marketing_consent === "unsubscribed") return { verdict: "suppress", reason: "unsubscribed" };
  if (row.marketing_consent !== "subscribed") return { verdict: "suppress", reason: "no marketing consent" };
  if (row.do_not_contact) return { verdict: "suppress", reason: "do not contact" };
  if (row.persona && BLOCKED_PERSONAS.has(row.persona)) {
    return { verdict: "suppress", reason: `persona ${row.persona}` };
  }

  const failure = await hardFailureReason(email);
  if (failure.verdict === "error" || failure.verdict === "suppress") return failure;

  return { verdict: "send" };
}

// -------------------------------------------------------------------- results

export type BroadcastStats = {
  total: number;
  pending: number;
  sent: number;
  skipped: number;
  failed: number;
  delivered: number;
  bounced: number;
  opened: number;
  clicked: number;
};

export async function getBroadcastStats(broadcastId: string): Promise<BroadcastStats> {
  const empty: BroadcastStats = {
    total: 0,
    pending: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    delivered: 0,
    bounced: 0,
    opened: 0,
    clicked: 0,
  };

  // Both aggregate in SQL. Counting fetched rows in JS was silently capped by
  // PostgREST: one 185-person broadcast emits roughly five events per email, so
  // two broadcasts would have taken this past the cap and understated bounces.
  const [{ data: recips }, { data: events }] = await Promise.all([
    companyOs.rpc("campaign_recipient_stats", { p_campaign_id: broadcastId }),
    companyOs.rpc("email_delivery_stats", rpcArgs({ p_since: null, p_campaign_id: broadcastId })),
  ]);

  const stats = { ...empty };
  for (const row of (recips ?? []) as { status: string; n: number }[]) {
    const n = Number(row.n);
    stats.total += n;
    // 'claimed' is a row the sender has taken but not yet finished. It reads as
    // pending to an operator: it has not gone out.
    if (row.status === "pending" || row.status === "claimed") stats.pending += n;
    else if (row.status === "sent") stats.sent += n;
    else if (row.status === "skipped") stats.skipped += n;
    else if (row.status === "failed") stats.failed += n;
  }

  const byType = new Map(
    ((events ?? []) as { event_type: string; unique_emails: number }[]).map((e) => [
      e.event_type,
      Number(e.unique_emails),
    ]),
  );
  stats.delivered = byType.get("delivered") ?? 0;
  stats.bounced = byType.get("bounced") ?? 0;
  stats.opened = byType.get("opened") ?? 0;
  stats.clicked = byType.get("clicked") ?? 0;
  return stats;
}

export type RecipientRow = {
  id: string;
  email: string;
  name: string | null;
  personId: string;
  status: string;
  skipReason: string | null;
  error: string | null;
  sentAt: string | null;
};

export async function listRecipients(broadcastId: string, limit = 200): Promise<RecipientRow[]> {
  const { data, error: recipientsErr } = await companyOs.from("email_campaign_recipients").select(`id, email, person_id, status, skip_reason, error, sent_at, people:people!person_id(${NAME_COLUMNS})`)
    .eq("campaign_id", broadcastId)
    .order("status", { ascending: true })
    .limit(limit);
  if (recipientsErr) console.error("[company-os/campaigns] email_campaign_recipients", recipientsErr);

  type Row = {
    id: string;
    email: string;
    person_id: string;
    status: string;
    skip_reason: string | null;
    error: string | null;
    sent_at: string | null;
    people: NamedPerson | null;
  };

  return ((data ?? []) as unknown as Row[]).map((row) => {
    const person = Array.isArray(row.people) ? row.people[0] ?? null : row.people;
    return {
      id: row.id,
      email: row.email,
      name: personName(person, null),
      personId: row.person_id,
      status: row.status,
      skipReason: row.skip_reason,
      error: row.error,
      sentAt: row.sent_at,
    };
  });
}
