import { companyOs } from "@/kernel/data/supabase";
import { getBroadcastStats } from "@/entities/campaigns/lib/broadcasts";
import type { CalendarChannel, CalendarStatus } from "@/entities/campaigns/lib/marketing-calendar";
import type { MarketingCampaignStatus } from "./marketing-campaigns-shared";

// Reads for the campaign umbrella: a campaign is the founder's idea (goal, dates,
// pillar, SEO/GEO plan) that spawns assets across channels. Assets are
// marketing_calendar rows linked by campaign_id. The volume is small (one team's
// plan), so these list without paging.

// The status vocabulary lives in the browser-safe half beside this file
// (marketing-campaigns-shared.ts) so the campaign hub can take it without the
// reads; the type is re-exported because the server callers name it from here.
export type { MarketingCampaignStatus } from "./marketing-campaigns-shared";

// Asset statuses that count as "built" (past the drafting stage) for the
// campaign progress bar.
const BUILT_STATUSES = new Set<CalendarStatus>(["approved", "scheduled", "published"]);

// Channel display order.
const CHANNEL_ORDER: CalendarChannel[] = ["blog", "email", "linkedin", "facebook", "twitter"];

export type MarketingCampaignRow = {
  id: string;
  name: string;
  idea: string | null;
  objective: string | null;
  seoGeoMd: string | null;
  // The utm_campaign slug the site forms send back; null until named.
  utmCampaign: string | null;
  status: MarketingCampaignStatus;
  brandId: string | null;
  brandName: string | null;
  pillarId: string | null;
  pillarName: string | null;
  startsOn: string | null;
  endsOn: string | null;
  createdAt: string;
  // Writer agent run state: the step to run next (null when idle, "ready" when
  // every check passed), when it started, and the error that stopped it.
  writerStep: string | null;
  writerStartedAt: string | null;
  writerError: string | null;
  assetCount: number;
  builtCount: number;
  channels: CalendarChannel[];
};

type DbCampaign = {
  id: string;
  name: string;
  idea: string | null;
  objective: string | null;
  seo_geo_md: string | null;
  utm_campaign: string | null;
  status: string;
  brand_id: string | null;
  pillar_id: string | null;
  starts_on: string | null;
  ends_on: string | null;
  created_at: string;
  writer_step: string | null;
  writer_started_at: string | null;
  writer_error: string | null;
  brands: { name: string } | { name: string }[] | null;
  marketing_pillars: { name: string } | { name: string }[] | null;
};

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? v[0] ?? null : v;
}

const CAMPAIGN_SELECT =
  "id, name, idea, objective, seo_geo_md, utm_campaign, status, brand_id, pillar_id, starts_on, ends_on, created_at, writer_step, writer_started_at, writer_error, brands(name), marketing_pillars(name)";

type AssetAgg = { count: number; built: number; channels: Set<string> };

function aggregate(assets: { campaign_id: string | null; channel: string; status: string }[]): Map<string, AssetAgg> {
  const byCampaign = new Map<string, AssetAgg>();
  for (const a of assets) {
    if (!a.campaign_id) continue;
    // Skipped assets were abandoned, not built: excluding them from the
    // denominator keeps progress honest (otherwise a campaign with any skipped
    // asset could never reach 100%).
    if (a.status === "skipped") continue;
    const acc = byCampaign.get(a.campaign_id) ?? { count: 0, built: 0, channels: new Set<string>() };
    acc.count += 1;
    if (BUILT_STATUSES.has(a.status as CalendarStatus)) acc.built += 1;
    acc.channels.add(a.channel);
    byCampaign.set(a.campaign_id, acc);
  }
  return byCampaign;
}

function mapCampaign(c: DbCampaign, agg: AssetAgg | undefined): MarketingCampaignRow {
  const channels = agg ? CHANNEL_ORDER.filter((ch) => agg.channels.has(ch)) : [];
  return {
    id: c.id,
    name: c.name,
    idea: c.idea,
    objective: c.objective,
    seoGeoMd: c.seo_geo_md,
    utmCampaign: c.utm_campaign,
    status: c.status as MarketingCampaignStatus,
    brandId: c.brand_id,
    brandName: one(c.brands)?.name ?? null,
    pillarId: c.pillar_id,
    pillarName: one(c.marketing_pillars)?.name ?? null,
    startsOn: c.starts_on,
    endsOn: c.ends_on,
    createdAt: c.created_at,
    writerStep: c.writer_step,
    writerStartedAt: c.writer_started_at,
    writerError: c.writer_error,
    assetCount: agg?.count ?? 0,
    builtCount: agg?.built ?? 0,
    channels,
  };
}

export async function listCampaigns(): Promise<{ rows: MarketingCampaignRow[]; error?: string }> {
  // Archived is the soft delete: the row stays for its assets and report, the
  // list does not show it.
  const { data, error } = await companyOs.from("marketing_campaigns").select(CAMPAIGN_SELECT)
    .neq("status", "archived")
    .order("created_at", { ascending: false });
  if (error) return { rows: [], error: error.message };

  const { data: assetData, error: listAssetsErr } = await companyOs.from("marketing_content").select("campaign_id, channel, status")
    .not("campaign_id", "is", null);
  if (listAssetsErr) console.error("[company-os/campaigns] marketing_content", listAssetsErr);
  const agg = aggregate((assetData ?? []) as { campaign_id: string | null; channel: string; status: string }[]);

  const rows = ((data ?? []) as DbCampaign[]).map((c) => mapCampaign(c, agg.get(c.id)));
  return { rows };
}

export async function getCampaign(id: string): Promise<MarketingCampaignRow | null> {
  const { data, error } = await companyOs.from("marketing_campaigns").select(CAMPAIGN_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;

  const { data: assetData, error: assetsErr } = await companyOs.from("marketing_content").select("campaign_id, channel, status")
    .eq("campaign_id", id);
  if (assetsErr) console.error("[company-os/campaigns] marketing_content", assetsErr);
  const agg = aggregate((assetData ?? []) as { campaign_id: string | null; channel: string; status: string }[]);
  return mapCampaign(data as DbCampaign, agg.get(id));
}

export type CampaignOption = { id: string; name: string };

// Light list for the calendar's campaign filter.
export async function listCampaignOptions(): Promise<CampaignOption[]> {
  const { data, error: optionsErr } = await companyOs.from("marketing_campaigns").select("id, name")
    .neq("status", "archived")
    .order("created_at", { ascending: false });
  if (optionsErr) console.error("[company-os/campaigns] marketing_campaigns", optionsErr);
  return (data ?? []) as CampaignOption[];
}

// ---------------------------------------------------------------- report

export type CampaignReportBroadcast = {
  id: string;
  title: string;
  status: string | null;
  sent: number;
  delivered: number;
  openRate: number | null;
};

export type CampaignReport = {
  assetsLive: number;
  assetsTotal: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  broadcasts: CampaignReportBroadcast[];
  content: { channel: CalendarChannel; published: number; total: number }[];
};

// One rolled-up read across a campaign's channels: email delivery stats summed
// from each linked broadcast, plus content published/total per channel. Loops
// one stats read per broadcast, fine at this volume.
export async function getCampaignReport(campaignId: string): Promise<CampaignReport> {
  const { data, error: reportErr } = await companyOs.from("marketing_content").select("id, title, channel, status, broadcast_id, email_campaigns!broadcast_id(status)")
    .eq("campaign_id", campaignId);
  if (reportErr) console.error("[company-os/campaigns] marketing_content", reportErr);

  type Row = {
    id: string;
    title: string;
    channel: string;
    status: string;
    broadcast_id: string | null;
    email_campaigns: { status: string } | { status: string }[] | null;
  };
  const rows = (data ?? []) as unknown as Row[];

  let assetsLive = 0;
  let sent = 0;
  let delivered = 0;
  let opened = 0;
  let clicked = 0;
  const broadcasts: CampaignReportBroadcast[] = [];
  const contentMap = new Map<CalendarChannel, { published: number; total: number }>();

  for (const r of rows) {
    const ch = r.channel as CalendarChannel;
    const cm = contentMap.get(ch) ?? { published: 0, total: 0 };
    cm.total += 1;
    if (r.status === "published") {
      cm.published += 1;
      assetsLive += 1;
    }
    contentMap.set(ch, cm);

    if (r.channel === "email" && r.broadcast_id) {
      const s = await getBroadcastStats(r.broadcast_id);
      sent += s.sent;
      delivered += s.delivered;
      opened += s.opened;
      clicked += s.clicked;
      broadcasts.push({
        id: r.broadcast_id,
        title: r.title,
        status: one(r.email_campaigns)?.status ?? null,
        sent: s.sent,
        delivered: s.delivered,
        openRate: s.delivered > 0 ? Math.round((s.opened / s.delivered) * 100) : null,
      });
    }
  }

  const content = CHANNEL_ORDER.filter((ch) => contentMap.has(ch)).map((ch) => ({
    channel: ch,
    ...contentMap.get(ch)!,
  }));

  return { assetsLive, assetsTotal: rows.length, sent, delivered, opened, clicked, broadcasts, content };
}

// ---------------------------------------------------------------- utm

// The slug a campaign is known by in a link: lowercase, hyphens, nothing else.
export function utmSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// The campaign id for a utm_campaign value, or null when none matches. Read
// at intake by the site's contact route, so it is a door export; a miss is
// not an error, the inquiry is simply unattributed.
export async function campaignIdForUtm(slug: string): Promise<string | null> {
  const key = utmSlug(slug);
  if (!key) return null;
  const { data, error } = await companyOs.from("marketing_campaigns").select("id").eq("utm_campaign", key).maybeSingle();
  if (error) {
    console.error("[campaigns] utm lookup", error);
    return null;
  }
  return (data as { id: string } | null)?.id ?? null;
}
