import { companyOs } from "@/kernel/data/supabase";
import { parseSeoMd } from "./seo";
import { parseFaqSection } from "./writer/markup";
import type { LedgerRow, LedgerSocial } from "./campaign-ledger-shared";

export type { LedgerRow } from "./campaign-ledger-shared";

// The ledger is read off the assets, not the campaigns: a campaign's keyword,
// question and blog type live on its blog row and each social style on that
// channel's row. Campaigns without assets have made no choices and do not
// appear. The keyword is the published column when the publish gate has
// normalised it, else the one the SEO step wrote into seo_md; the primary
// question is the first FAQ question, the one an AI answer extracts.

type DbRow = {
  campaign_id: string;
  channel: string;
  status: string;
  title: string | null;
  slug: string | null;
  posted_url: string | null;
  publish_date: string | null;
  primary_keyword: string | null;
  seo_md: string | null;
  blog_style: string | null;
  image_style: string | null;
  social_style: string | null;
  marketing_campaigns: Embedded<{ name: string; status: string; starts_on: string | null; brand_id: string | null; brands: Embedded<{ name: string }> }>;
};
type Embedded<T> = T | T[] | null;
const one = <T,>(v: Embedded<T>): T | null => (Array.isArray(v) ? v[0] ?? null : v);

const LEDGER_SELECT =
  "campaign_id, channel, status, title, slug, posted_url, publish_date, primary_keyword, seo_md, blog_style, image_style, social_style, marketing_campaigns!campaign_id(name, status, starts_on, brand_id, brands(name))";

export async function listCampaignLedger(opts: { brandId?: string | null } = {}): Promise<{ rows: LedgerRow[]; error?: string }> {
  let q = companyOs.from("marketing_content").select(LEDGER_SELECT).not("campaign_id", "is", null).neq("status", "skipped");
  if (opts.brandId) q = q.eq("brand_id", opts.brandId);
  const { data, error } = await q;
  if (error) return { rows: [], error: error.message };

  const byCampaign = new Map<string, LedgerRow>();
  for (const r of (data ?? []) as DbRow[]) {
    const c = one(r.marketing_campaigns);
    if (!c) continue;
    const row = byCampaign.get(r.campaign_id) ?? {
      campaignId: r.campaign_id,
      campaignName: c.name,
      brandId: c.brand_id,
      brandName: one(c.brands)?.name ?? null,
      date: c.starts_on,
      status: c.status,
      blogStatus: null,
      slug: null,
      postedUrl: null,
      title: null,
      primaryKeyword: null,
      primaryQuestion: null,
      blogType: null,
      imageStyle: null,
      social: [] as LedgerSocial[],
    };
    if (r.channel === "blog") {
      row.date = r.publish_date ?? row.date;
      row.blogStatus = r.status;
      row.slug = r.slug;
      row.postedUrl = r.posted_url;
      row.title = r.title;
      row.primaryKeyword = r.primary_keyword ?? parseSeoMd(r.seo_md).primaryKeyword;
      row.primaryQuestion = parseFaqSection(r.seo_md)[0]?.question ?? null;
      row.blogType = r.blog_style;
      row.imageStyle = r.image_style;
    } else if (r.channel !== "email") {
      row.social.push({ channel: r.channel, socialStyle: r.social_style, imageStyle: r.image_style });
    }
    byCampaign.set(r.campaign_id, row);
  }
  // Newest first, undated last, so "the last four posts" is the head of the list.
  const rows = [...byCampaign.values()].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  return { rows };
}
