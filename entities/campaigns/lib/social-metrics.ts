import { companyOs } from "@/kernel/data/supabase";
import { readOr } from "@/kernel/data/read";
import type { SocialChannel } from "./social-import/parse";
import { listBrands } from "./marketing-calendar";
import type { BrandOption } from "./marketing-calendar-shared";
import { SOCIAL_BRAND_SLUGS } from "./social-brands";

// Read side for the imported LinkedIn and Facebook analytics: what the
// Marketing page's Social section and the monthly recap show. The figures are
// whatever the last import of each day or post said, so a range that no
// import covered reads as zero rather than as missing.

export type ChannelTotals = {
  channel: SocialChannel;
  impressions: number;
  clicks: number;
  engagements: number;
  // The latest day an import covered, so a stale channel is visible.
  lastDay: string | null;
};

export type TopPost = {
  id: string;
  channel: SocialChannel;
  body: string;
  url: string | null;
  postedOn: string | null;
  impressions: number;
  clicks: number;
  engagements: number;
  contentTitle: string | null;
};

export type SocialSummary = {
  channels: ChannelTotals[];
  daily: { day: string; impressions: number }[];
  topPosts: TopPost[];
};

const CHANNELS: SocialChannel[] = ["linkedin", "facebook"];
const LOG = "[campaigns/social-metrics]";

/** The brands whose pages the import takes, in SOCIAL_BRAND_SLUGS order. */
export async function listSocialBrands(): Promise<BrandOption[]> {
  const brands = await listBrands();
  if (!SOCIAL_BRAND_SLUGS) return brands;
  return SOCIAL_BRAND_SLUGS.flatMap((slug) => brands.filter((b) => b.slug === slug));
}

/**
 * The brand an export's page hint points at: the brand whose slug, letters and
 * digits only, appears in the hint (a page "acmeco" names the brand acme). Falls back to the
 * first brand, which the person can change before importing.
 */
export function brandForPage(hint: string | null, brands: BrandOption[]): string | null {
  const page = (hint ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const named = brands.find((b) => page && page.includes(b.slug.toLowerCase().replace(/[^a-z0-9]/g, "")));
  return (named ?? brands[0])?.id ?? null;
}

/**
 * Page-level totals per channel and the top posts published since `since`
 * (YYYY-MM-DD), up to `until` when given, for one brand or, with none, all.
 */
export async function getSocialSummary(since: string, until?: string, brandId?: string): Promise<SocialSummary> {
  let daysQuery = companyOs
    .from("social_daily_metrics")
    .select("channel, day, impressions, clicks, reactions, comments, reposts")
    .gte("day", since)
    .order("day");
  if (until) daysQuery = daysQuery.lte("day", until);
  if (brandId) daysQuery = daysQuery.eq("brand_id", brandId);
  let postsQuery = companyOs
    .from("social_post_metrics")
    .select("id, channel, body, url, posted_on, impressions, clicks, reactions, comments, reposts, marketing_content(title)")
    .eq("kind", "post")
    .gte("posted_on", since)
    .order("impressions", { ascending: false })
    .limit(5);
  if (until) postsQuery = postsQuery.lte("posted_on", until);
  if (brandId) postsQuery = postsQuery.eq("brand_id", brandId);
  const [daysRes, postsRes] = await Promise.all([daysQuery, postsQuery]);
  // The section is one of several on the Marketing page; a failed read
  // shows as no figures there rather than taking the page down.
  const days = readOr(daysRes, `${LOG} social_daily_metrics`, []);
  const posts = readOr(postsRes, `${LOG} social_post_metrics`, []);

  const channels = CHANNELS.map((channel): ChannelTotals => {
    const rows = days.filter((d) => d.channel === channel);
    return {
      channel,
      impressions: sum(rows.map((d) => d.impressions)),
      clicks: sum(rows.map((d) => d.clicks)),
      engagements: sum(rows.map((d) => d.reactions + d.comments + d.reposts)),
      lastDay: rows.at(-1)?.day ?? null,
    };
  });

  const byDay = new Map<string, number>();
  for (const d of days) byDay.set(d.day, (byDay.get(d.day) ?? 0) + d.impressions);

  return {
    channels,
    daily: [...byDay].map(([day, impressions]) => ({ day, impressions })),
    topPosts: posts.map((p) => ({
      id: p.id,
      channel: p.channel as SocialChannel,
      body: p.body,
      url: p.url,
      postedOn: p.posted_on,
      impressions: p.impressions,
      clicks: p.clicks,
      engagements: p.reactions + p.comments + p.reposts,
      contentTitle: p.marketing_content?.title ?? null,
    })),
  };
}

function sum(values: number[]): number {
  return values.reduce((n, v) => n + v, 0);
}
