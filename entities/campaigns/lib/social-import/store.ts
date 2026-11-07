import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { MATCH_WINDOW_DAYS, matchPost, type ContentCandidate } from "./match";
import type { SocialExport } from "./parse";

// Writes an imported social export into company_os.social_daily_metrics and
// company_os.social_post_metrics, under the brand whose page it came from.
// Matching only looks at that brand's calendar, so an AI Officer post is never
// linked to an Edge8 entry with similar wording.

export type PlannedPost = {
  externalId: string;
  kind: "post" | "job";
  text: string;
  postedOn: string | null;
  impressions: number;
  clicks: number;
  contentId: string | null;
  contentTitle: string | null;
  // The stored figures came from a more recent export, so this file's are
  // older and are not written.
  stale: boolean;
};

export type ImportPlan = {
  channel: SocialExport["channel"];
  brandId: string;
  asOf: string;
  from: string | null;
  to: string | null;
  days: number;
  impressions: number;
  clicks: number;
  posts: PlannedPost[];
};

export type ContentOption = { id: string; title: string; publishDate: string | null };

export type UnmatchedPost = { id: string; text: string; postedOn: string | null; options: ContentOption[] };

export type ImportOutcome = { days: number; posts: number; skipped: number; unmatched: UnmatchedPost[] };

const LOG = "[campaigns/social-import]";

export async function planImport(data: SocialExport, brandId: string): Promise<ImportPlan> {
  const { posts, candidates, titles, existing } = await readContext(data, brandId);
  const dayList = data.days.map((d) => d.day).sort();
  return {
    channel: data.channel,
    brandId,
    asOf: data.asOf,
    from: dayList[0] ?? data.posts.map((p) => p.postedOn ?? "").filter(Boolean).sort()[0] ?? null,
    to: dayList.at(-1) ?? data.asOf,
    days: data.days.length,
    impressions: data.days.reduce((n, d) => n + d.impressions, 0),
    clicks: data.days.reduce((n, d) => n + d.clicks, 0),
    posts: posts.map((p) => {
      // A link already set is kept; a post still unlinked is matched again,
      // since the calendar may have gained its entry since the last import.
      const known = existing.get(p.externalId);
      const contentId = known?.content_id ?? matchPost(data.channel, p, candidates);
      return {
        externalId: p.externalId,
        kind: p.kind,
        text: p.text,
        postedOn: p.postedOn,
        impressions: p.impressions,
        clicks: p.clicks,
        contentId,
        contentTitle: contentId ? (titles.get(contentId) ?? null) : null,
        stale: !!known && known.as_of > data.asOf,
      };
    }),
  };
}

export async function saveImport(data: SocialExport, brandId: string, personId: string | null): Promise<ImportOutcome> {
  const plan = await planImport(data, brandId);
  const syncedAt = new Date().toISOString();

  if (data.days.length > 0) {
    const { error } = await companyOs.from("social_daily_metrics").upsert(
      data.days.map((d) => ({
        brand_id: brandId,
        channel: data.channel,
        day: d.day,
        impressions: d.impressions,
        unique_impressions: d.uniqueImpressions,
        clicks: d.clicks,
        reactions: d.reactions,
        comments: d.comments,
        reposts: d.reposts,
        synced_at: syncedAt,
        synced_by: personId,
      })),
      { onConflict: "brand_id,channel,day" },
    );
    if (error) throw new Error(`${LOG} daily metrics: ${error.message}`);
  }

  const byId = new Map(data.posts.map((p) => [p.externalId, p]));
  const fresh = plan.posts.filter((p) => !p.stale);
  if (fresh.length > 0) {
    const { error } = await companyOs.from("social_post_metrics").upsert(
      fresh.map((planned) => {
        const p = byId.get(planned.externalId)!;
        return {
          brand_id: brandId,
          channel: data.channel,
          external_id: p.externalId,
          url: p.url,
          kind: p.kind,
          body: p.text,
          posted_on: p.postedOn,
          impressions: p.impressions,
          unique_impressions: p.uniqueImpressions,
          clicks: p.clicks,
          reactions: p.reactions,
          comments: p.comments,
          reposts: p.reposts,
          as_of: data.asOf,
          content_id: planned.contentId,
          synced_at: syncedAt,
          synced_by: personId,
        };
      }),
      { onConflict: "channel,external_id" },
    );
    if (error) throw new Error(`${LOG} post metrics: ${error.message}`);
  }

  return {
    days: data.days.length,
    posts: fresh.length,
    skipped: plan.posts.length - fresh.length,
    unmatched: await unmatchedPosts(data.channel, brandId, fresh.filter((p) => p.kind === "post" && !p.contentId).map((p) => p.externalId)),
  };
}

/**
 * Links an imported post to the planned post it is, or clears the link.
 * Returns why a link is refused: a job post, or a planned post on another
 * channel or another brand.
 */
export async function linkPost(postId: string, contentId: string | null): Promise<string | null> {
  const posts = mustRows(
    await companyOs.from("social_post_metrics").select("channel, kind, brand_id").eq("id", postId),
    `${LOG} post to link`,
  );
  const post = posts[0];
  if (!post) return "That post is no longer there.";
  if (contentId) {
    if (post.kind === "job") return "Job posts are not linked to the calendar.";
    const content = mustRows(
      await companyOs.from("marketing_content").select("channel, brand_id").eq("id", contentId),
      `${LOG} content to link`,
    );
    if (!content[0]) return "That planned post is no longer there.";
    if (content[0].channel !== post.channel || content[0].brand_id !== post.brand_id) {
      return "Pick a planned post on the same channel and brand.";
    }
  }
  const { error } = await companyOs.from("social_post_metrics").update({ content_id: contentId }).eq("id", postId);
  if (error) throw new Error(`${LOG} link post: ${error.message}`);
  return null;
}

async function readContext(data: SocialExport, brandId: string) {
  const posts = data.posts;
  const dates = posts.map((p) => p.postedOn).filter((d): d is string => !!d).sort();
  const existingRows = posts.length
    ? (mustRows(
        await companyOs
          .from("social_post_metrics")
          .select("id, external_id, as_of, content_id")
          .eq("channel", data.channel)
          .in("external_id", posts.map((p) => p.externalId)),
        `${LOG} social_post_metrics`,
      ))
    : [];
  const contentRows = dates.length
    ? mustRows(
        await companyOs
          .from("marketing_content")
          .select("id, channel, publish_date, title, copy_md")
          .eq("channel", data.channel)
          .eq("brand_id", brandId)
          .gte("publish_date", shiftDay(dates[0], -MATCH_WINDOW_DAYS))
          .lte("publish_date", shiftDay(dates.at(-1)!, MATCH_WINDOW_DAYS)),
        `${LOG} marketing_content`,
      )
    : [];
  const candidates: ContentCandidate[] = contentRows.map((r) => ({
    id: r.id,
    channel: r.channel,
    publishDate: r.publish_date,
    text: `${r.title}\n${r.copy_md ?? ""}`,
  }));
  return {
    posts,
    candidates,
    titles: new Map(contentRows.map((r) => [r.id, r.title])),
    existing: new Map(existingRows.map((r) => [r.external_id, r])),
  };
}

// The picker offers the channel's planned posts a week either side of the
// post, which is wider than the matcher's day because a person is choosing.
async function unmatchedPosts(channel: SocialExport["channel"], brandId: string, externalIds: string[]): Promise<UnmatchedPost[]> {
  if (externalIds.length === 0) return [];
  const rows = mustRows(
    await companyOs
      .from("social_post_metrics")
      .select("id, body, posted_on")
      .eq("channel", channel)
      .in("external_id", externalIds),
    `${LOG} unmatched posts`,
  );
  const dates = rows.map((r) => r.posted_on).filter((d): d is string => !!d).sort();
  const options = dates.length
    ? mustRows(
        await companyOs
          .from("marketing_content")
          .select("id, title, publish_date")
          .eq("channel", channel)
          .eq("brand_id", brandId)
          .gte("publish_date", shiftDay(dates[0], -7))
          .lte("publish_date", shiftDay(dates.at(-1)!, 7))
          .order("publish_date"),
        `${LOG} link options`,
      )
    : [];
  return rows.map((r) => ({
    id: r.id,
    text: r.body,
    postedOn: r.posted_on,
    options: options
      .filter((o) => !r.posted_on || !o.publish_date || Math.abs(Date.parse(o.publish_date) - Date.parse(r.posted_on)) <= 7 * 86_400_000)
      .map((o) => ({ id: o.id, title: o.title, publishDate: o.publish_date })),
  }));
}

function shiftDay(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
