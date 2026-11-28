import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { recordAudit } from "@/kernel/audit/audit";
import { brandSlugOf } from "@/entities/contacts";
import { siteForBrandSlug } from "./brand-sites";
import { checkLive, checkableUrl, revalidateBlog } from "./blog-publish";
import { graceOver, notLiveReason, prePublishOf, putBackStatus } from "./blog-live";

// The re-check behind every blog publish that has not answered 200 yet
// (R3.352). A site that reads the shared database may lag a publish by up to
// about a minute, longer than any request should be held open, so the publish
// returns "not live yet" and this routine, every five minutes, asks each such
// URL once more. A 200 stamps `posted_url`, which is what makes a post live to
// the calendar, the writer and the revenue board. A URL still not answering
// once the grace window is over puts the post back to the state kept in
// `pre_publish`, so the calendar never shows as live a post nobody can read.
// A post with no snapshot (published before this existed) is only marked not
// live, and stays checked, so it goes live by itself once its site serves it.

const LIVE_CHECK_ACTOR = "blog-live-check";

// One run asks at most this many URLs, one at a time, each bounded at five
// seconds, so a slow site cannot hold a run past the function's limit. Posts
// with a snapshot (still inside or just past their grace window) go first.
const MAX_PER_RUN = 30;

// A post with no snapshot (published before R3.352) can only ever go live, and
// may wait days for its site, so it is asked once an hour rather than on every
// run: only in the run that starts in the first five minutes of the hour.
const olderPostsDue = (now: Date) => now.getUTCMinutes() < 5;

type WaitingRow = {
  id: string;
  title: string;
  slug: string | null;
  status: string;
  published_at: string | null;
  pre_publish: unknown;
  live_check_error: string | null;
  brand_id: string | null;
};

export type LiveCheckRun = {
  checked: number;
  live: { id: string; title: string; url: string }[];
  putBack: { id: string; title: string; backTo: string; reason: string; publishedAt: string | null }[];
  waiting: number;
  /** Posts published before R3.352 (no snapshot) still not live. */
  older: number;
  /** Posts left for a later run by the per-run cap. */
  deferred: number;
  /** A row whose write failed; the others are still checked. */
  failures: { subject: string; step: string; error: string }[];
};

export async function checkWaitingBlogs(now: Date = new Date()): Promise<LiveCheckRun> {
  const rows = mustRows(
    await companyOs.from("marketing_content")
      .select("id, title, slug, status, published_at, pre_publish, live_check_error, brand_id")
      .eq("channel", "blog")
      .eq("status", "published")
      .is("posted_url", null)
      .order("published_at", { ascending: true }),
    "[campaigns/blog-live-check] marketing_content",
  ) as WaitingRow[];

  const run: LiveCheckRun = { checked: 0, live: [], putBack: [], waiting: 0, older: 0, deferred: 0, failures: [] };
  const withSnapshot = rows.filter((r) => prePublishOf(r.pre_publish));
  const due = [...withSnapshot, ...(olderPostsDue(now) ? rows.filter((r) => !prePublishOf(r.pre_publish)) : [])];
  run.deferred = Math.max(0, due.length - MAX_PER_RUN);
  // Brands are the contacts entity's, read through its door once per brand.
  const slugs = new Map<string, Promise<string | null>>();
  const slugOf = (brandId: string) => {
    if (!slugs.has(brandId)) {
      slugs.set(brandId, brandSlugOf(brandId).then((res) => {
        if (res.error) throw new Error(`[campaigns/blog-live-check] brands ${brandId}: ${res.error.message}`);
        return res.data?.slug ?? null;
      }));
    }
    return slugs.get(brandId)!;
  };
  for (const row of due.slice(0, MAX_PER_RUN)) {
    try {
      await checkOne(row, run, now, row.brand_id ? await slugOf(row.brand_id) : null);
    } catch (err) {
      run.failures.push({ subject: row.title, step: "live check", error: err instanceof Error ? err.message : String(err) });
    }
  }
  return run;
}

async function checkOne(row: WaitingRow, run: LiveCheckRun, now: Date, brandSlug: string | null): Promise<void> {
  const site = siteForBrandSlug(brandSlug);
  if (!site || !row.slug) return;
  const url = `${site.domain}/post/${row.slug}/`;
  // No site origin (a fork or a local run): nothing to ask, as at publish.
  if (!checkableUrl(url)) return;
  run.checked++;

  // One attempt per run: the next run is five minutes away.
  const answer = await checkLive(url, 1);
  if (answer.ok) {
    const stamped = await guardedUpdate(row, { posted_url: url, pre_publish: null, live_check_error: null });
    if (stamped) {
      run.live.push({ id: row.id, title: row.title, url });
      await recordAudit({ table: "marketing_content", recordId: row.id, operation: "update", actor: LIVE_CHECK_ACTOR, context: { live: true, slug: row.slug } });
    }
    return;
  }

  const reason = notLiveReason(url, answer.answer, now);
  const before = prePublishOf(row.pre_publish);
  if (before && graceOver(row.published_at, now)) {
    const backTo = putBackStatus(before);
    const putBack = await guardedUpdate(row, {
      status: backTo,
      publish_date: before.publish_date,
      published_at: before.published_at,
      pre_publish: null,
      live_check_error: reason,
    });
    if (putBack) {
      // This site's own cache may hold the post; drop it so the reader
      // stops serving a post that is no longer published.
      if (site.self) revalidateBlog(row.slug);
      run.putBack.push({ id: row.id, title: row.title, backTo, reason, publishedAt: row.published_at });
      await recordAudit({
        table: "marketing_content",
        recordId: row.id,
        operation: "update",
        actor: LIVE_CHECK_ACTOR,
        context: { live: false, put_back_to: backTo, reason, slug: row.slug },
      });
    }
    return;
  }

  if (before) run.waiting++;
  else run.older++;
  // The reason carries the time it was first seen, so it is written only when
  // the URL answers differently; an unchanged answer is not rewritten every run.
  if (!row.live_check_error?.startsWith(`${url} ${answer.answer} at `)) await guardedUpdate(row, { live_check_error: reason });
}

type LiveCheckWrite = {
  status?: string;
  publish_date?: string | null;
  published_at?: string | null;
  posted_url?: string | null;
  pre_publish?: null;
  live_check_error?: string | null;
};

// Every write is guarded on the row still being the publish this run read:
// still published, not live, and with the same published_at. A person who
// moved the post, or re-published it (which stamps a new published_at), while
// its URL was being asked is never overwritten. True when the row was written.
async function guardedUpdate(row: Pick<WaitingRow, "id" | "published_at">, patch: LiveCheckWrite): Promise<boolean> {
  const base = companyOs.from("marketing_content")
    .update(patch)
    .eq("id", row.id)
    .eq("status", "published")
    .is("posted_url", null);
  const guarded = row.published_at === null ? base.is("published_at", null) : base.eq("published_at", row.published_at);
  const { data, error } = await guarded.select("id");
  if (error) throw new Error(`[campaigns/blog-live-check] marketing_content ${row.id}: ${error.message}`);
  return (data ?? []).length > 0;
}
