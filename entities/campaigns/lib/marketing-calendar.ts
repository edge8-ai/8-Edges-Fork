import { companyOs, type CompanyOsInsert } from "@/kernel/data/supabase";
import { selectBrands } from "@/entities/contacts";
import { getBroadcastStats } from "@/entities/campaigns/lib/broadcasts";
import {
  type BrandOption,
  type CalendarChannel,
  type CalendarEntryRow,
  type CalendarStatus,
  type PillarOption,
} from "./marketing-calendar-shared";

const LOG = "[revenue/marketing/calendar]";

// Marketing calendar reads. The page is tiny (one team's content plan), so this
// lists every entry and the views filter client-side — no paging needed.

// The vocabulary, accents and row shapes live in the browser-safe half beside
// this file (marketing-calendar-shared.ts) so the client components can take
// them without the reads. The types are re-exported here because the server
// callers name them from this module; the values are taken from the shared
// half by everyone who still needs them.
export {
  CHANNEL_LABEL,
  type BrandOption,
  type CalendarChannel,
  type CalendarEntryRow,
  type CalendarStatus,
  type PillarOption,
} from "./marketing-calendar-shared";

type DbEntry = {
  id: string;
  title: string;
  brand_id: string | null;
  pillar_id: string | null;
  channel: string;
  status: string;
  publish_date: string | null;
  parent_id: string | null;
  broadcast_id: string | null;
  campaign_id: string | null;
  copy_md: string | null;
  asset_url: string | null;
  posted_url: string | null;
  notes: string | null;
  blog_style: string | null;
  social_style: string | null;
  image_style: string | null;
  image_type: string | null;
  seo_md: string | null;
  image_brief_md: string | null;
  image_url: string | null;
  body_html: string | null;
  sort_order: number;
  created_at: string;
  brands: { name: string } | { name: string }[] | null;
  marketing_pillars: { name: string } | { name: string }[] | null;
  email_campaigns: { status: string } | { status: string }[] | null;
  marketing_campaigns: { name: string } | { name: string }[] | null;
};

// broadcast_id is the email-send link; campaign_id is the umbrella. Both embeds
// are pinned to their FK explicitly so they stay unambiguous.
const ENTRY_SELECT =
  "id, title, brand_id, pillar_id, channel, status, publish_date, parent_id, broadcast_id, campaign_id, copy_md, asset_url, posted_url, notes, blog_style, social_style, image_style, image_type, seo_md, image_brief_md, image_url, body_html, sort_order, created_at, brands(name), marketing_pillars(name), email_campaigns!broadcast_id(status), marketing_campaigns!campaign_id(name)";

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? v[0] ?? null : v;
}

function mapEntry(row: DbEntry): CalendarEntryRow {
  const brand = one(row.brands);
  const pillar = one(row.marketing_pillars);
  const broadcast = one(row.email_campaigns);
  const campaign = one(row.marketing_campaigns);
  return {
    id: row.id,
    title: row.title,
    brandId: row.brand_id,
    brandName: brand?.name ?? null,
    pillarId: row.pillar_id,
    pillarName: pillar?.name ?? null,
    channel: row.channel as CalendarChannel,
    status: row.status as CalendarStatus,
    publishDate: row.publish_date,
    parentId: row.parent_id,
    broadcastId: row.broadcast_id,
    broadcastStatus: broadcast?.status ?? null,
    campaignId: row.campaign_id,
    campaignName: campaign?.name ?? null,
    copyMd: row.copy_md,
    assetUrl: row.asset_url,
    postedUrl: row.posted_url,
    notes: row.notes,
    blogStyle: row.blog_style,
    socialStyle: row.social_style,
    imageStyle: row.image_style,
    imageType: row.image_type,
    seoMd: row.seo_md,
    imageBriefMd: row.image_brief_md,
    imageUrl: row.image_url,
    bodyHtml: row.body_html,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

export async function listEntries(): Promise<{ rows: CalendarEntryRow[]; error?: string }> {
  const { data, error } = await companyOs.from("marketing_content").select(ENTRY_SELECT)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return { rows: [], error: error.message };
  return { rows: ((data ?? []) as unknown as DbEntry[]).map(mapEntry) };
}

// A single calendar row (asset) with all its joined fields.
export async function getEntry(id: string): Promise<CalendarEntryRow | null> {
  const { data, error } = await companyOs.from("marketing_content").select(ENTRY_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return mapEntry(data as unknown as DbEntry);
}

// The full calendar rows for one campaign's assets, so the campaign hub can
// render the same board and month grid the global calendar uses.
export async function listEntriesByCampaign(campaignId: string): Promise<CalendarEntryRow[]> {
  const { data, error: entriesErr } = await companyOs.from("marketing_content").select(ENTRY_SELECT)
    .eq("campaign_id", campaignId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (entriesErr) console.error("[company-os/campaigns] marketing_content", entriesErr);
  return ((data ?? []) as unknown as DbEntry[]).map(mapEntry);
}

export async function listBrands(): Promise<BrandOption[]> {
  const { data, error: brandsErr } = await selectBrands("id, name, slug")
    .eq("active", true)
    .order("name", { ascending: true });
  if (brandsErr) console.error("[company-os/campaigns] brands", brandsErr);
  return (data ?? []) as BrandOption[];
}

export type PillarPerformance = {
  pillar: string;
  campaigns: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
};

// Rolls broadcast delivery stats up by pillar, counting distinct campaigns (not
// individual sends) so the "campaigns" column reflects the umbrella. A broadcast
// with no campaign counts as its own unit, so nothing is dropped. Loops one
// stats read per broadcast — fine at this volume; revisit with an aggregate RPC
// if the count grows large.
export async function getPillarPerformance(): Promise<PillarPerformance[]> {
  const { data, error: pillarPerfErr } = await companyOs.from("marketing_content").select("broadcast_id, campaign_id, marketing_pillars(name)")
    .eq("channel", "email")
    .not("broadcast_id", "is", null);
  if (pillarPerfErr) console.error("[company-os/campaigns] marketing_content", pillarPerfErr);

  const rows = (data ?? []) as unknown as {
    broadcast_id: string;
    campaign_id: string | null;
    marketing_pillars: { name: string } | { name: string }[] | null;
  }[];

  type Acc = Omit<PillarPerformance, "campaigns"> & { units: Set<string> };
  const byPillar = new Map<string, Acc>();
  for (const row of rows) {
    const stats = await getBroadcastStats(row.broadcast_id);
    if (stats.sent === 0) continue;
    const key = one(row.marketing_pillars)?.name ?? "Unassigned";
    const acc =
      byPillar.get(key) ??
      { pillar: key, sent: 0, delivered: 0, opened: 0, clicked: 0, units: new Set<string>() };
    acc.units.add(row.campaign_id ?? `broadcast:${row.broadcast_id}`);
    acc.sent += stats.sent;
    acc.delivered += stats.delivered;
    acc.opened += stats.opened;
    acc.clicked += stats.clicked;
    byPillar.set(key, acc);
  }

  return [...byPillar.values()]
    .map(({ units, ...rest }) => ({ ...rest, campaigns: units.size }))
    .sort((a, b) => b.clicked - a.clicked);
}

export async function listPillars(): Promise<PillarOption[]> {
  const { data, error: pillarsErr } = await companyOs.from("marketing_pillars").select("id, brand_id, name")
    .eq("active", true)
    .order("name", { ascending: true });
  if (pillarsErr) console.error("[company-os/campaigns] marketing_pillars", pillarsErr);
  return ((data ?? []) as { id: string; brand_id: string; name: string }[]).map((p) => ({
    id: p.id,
    brandId: p.brand_id,
    name: p.name,
  }));
}

// The single place a calendar entry mints a draft broadcast (email_campaigns row)
// and links it back via broadcast_id. Shared by createBroadcastFromEntry (the
// "Create broadcast" button) and the email branch of draftWithAI, so the row
// shape and the link step cannot drift apart. Returns the new broadcast id, or
// null if the insert produced no row.
export async function createDraftBroadcastForEntry(input: {
  entryId: string;
  name: string;
  subject: string;
  preheader?: string | null;
  bodyMd?: string | null;
  brandId: string | null;
  publishDate: string | null;
  createdBy: string;
}): Promise<string | null> {
  const row: CompanyOsInsert<"email_campaigns"> = {
    name: input.name,
    subject: input.subject,
    brand_id: input.brandId,
    // A date-only publish target becomes 09:00 UTC as a sane default; the
    // operator refines it in the broadcast editor.
    scheduled_at: input.publishDate ? `${input.publishDate}T09:00:00Z` : null,
    created_by: input.createdBy,
  };
  // `email_campaigns.preheader` and `.body_md` are NOT NULL in the generated
  // types, but both inputs are optional-and-nullable here. Runtime behaviour is
  // unchanged (a null still goes to PostgREST, and the column default or
  // constraint decides); the cast records the mismatch rather than hiding it.
  if (input.preheader !== undefined) row.preheader = input.preheader as string;
  if (input.bodyMd !== undefined) row.body_md = input.bodyMd as string;

  const { data, error } = await companyOs.from("email_campaigns").insert(row)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error(`${LOG} creating draft broadcast for ${input.entryId} failed: ${error.message}`);
    return null;
  }
  const id = (data as { id: string } | null)?.id ?? null;
  if (id) {
    const { error: linkError } = await companyOs.from("marketing_content").update({ broadcast_id: id })
      .eq("id", input.entryId);
    if (linkError) {
      console.error(
        `${LOG} linking broadcast ${id} to entry ${input.entryId} failed: ${linkError.message}`,
      );
      return null;
    }
  }
  return id;
}

// Shared bookkeeping for the AI drafting loops: a write that fails costs its
// channel, not the whole run, and the caller reports the channels that missed.
export function noteWriteFailure(
  failed: string[],
  channel: string,
  what: string,
  error: { message: string; refused?: true } | null,
): boolean {
  if (!error) return false;
  console.error(`${LOG} write to ${what} failed: ${error.message}`);
  // A refusal (a live post on a gated campaign, Y.91) says what to do instead,
  // so it travels with the channel; a database error stays in the log.
  failed.push(error.refused ? `${channel} (${error.message})` : channel);
  return true;
}

export function partialSaveMessage(failed: string[]): string {
  return `Drafted, but these did not save: ${failed.join(", ")}. Try again.`;
}
