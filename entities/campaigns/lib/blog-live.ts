import { z } from "zod";
import { BUSINESS_TIME_ZONE, zonedClock } from "@/kernel/config/dates";
import type { CalendarStatus } from "./marketing-calendar-shared";

// Whether a published blog is live on its site (R3.352). The publish flow flips
// a post to published before it checks the live URL, because the sites render
// only published rows; the check cannot pass until the flip is done. So a
// published blog counts as live only once its URL answered 200, which stamps
// `posted_url`. Until then `pre_publish` holds the row as it was before the
// publish, and the blog-live-check routine puts it back if the URL never
// answers. Pure, so the calendar's client components read the same rule the
// server writes by.

/**
 * How often the blog-live-check routine asks a waiting URL. The routine's cron
 * schedule (crons/blog-live-check.ts) says the same, and a test holds the two
 * equal, so the copy that names the interval cannot drift from it.
 */
export const LIVE_CHECK_EVERY_MINUTES = 5;

/** How long a publish may wait for its URL to answer before the post is put back. */
export const LIVE_GRACE_MINUTES = 15;
const GRACE_MS = LIVE_GRACE_MINUTES * 60_000;

/**
 * The stored statuses marketing_content_status_check allows. Roles other than
 * this code can write pre_publish, so a snapshot naming any other status is not
 * one this code wrote and is never restored: the put-back would fail the check.
 * blog-live.test.ts holds this list equal to the constraint in the schema
 * generated from production.
 */
export const STORED_STATUSES = ["idea", "drafted", "approved", "scheduled", "published", "skipped"] as const satisfies readonly CalendarStatus[];

/** The row as it stood before a publish that has not answered 200 yet. */
const prePublishSchema = z.object({
  status: z.enum(STORED_STATUSES),
  publish_date: z.string().nullable(),
  published_at: z.string().nullable(),
});
export type PrePublish = z.infer<typeof prePublishSchema>;

/** The stored snapshot, or null when there is none or it is not one this code wrote. */
export function prePublishOf(value: unknown): PrePublish | null {
  const parsed = prePublishSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** "https://site/post/x/ answered 404 at 15:32", the reason the calendar shows. */
export function notLiveReason(url: string, answer: string, at: Date = new Date()): string {
  return `${url} ${answer} at ${zonedClock(at, BUSINESS_TIME_ZONE).time}`;
}

/** True once a publish that started at `publishedAt` has waited out the grace window. */
export function graceOver(publishedAt: string | null, now: Date = new Date()): boolean {
  if (!publishedAt) return true;
  const started = Date.parse(publishedAt);
  return !Number.isFinite(started) || now.getTime() - started >= GRACE_MS;
}

/**
 * Narrows a marketing_content query to rows a reader may treat as out: a
 * published blog that is not live yet always carries its snapshot
 * (`pre_publish`) or its reason (`live_check_error`), and a 200 clears both. A
 * publish with no site origin to ask (a fork) never sets either, so it stays
 * in, as liveCheckOf reads it. Every other channel sets neither, so a query
 * across channels keeps them all.
 */
export function liveOnly<Q extends { is(column: string, value: null): Q }>(query: Q): Q {
  return query.is("pre_publish", null).is("live_check_error", null);
}

/**
 * The status a put-back restores. A post that was Scheduled goes back to
 * Approved, because its publish date has passed: left Scheduled, the
 * scheduled-publish cron would publish it again the next morning, its URL
 * would fail again, and the post would loop, with two notices a day, until
 * someone noticed. Approved stops the automation and leaves the post for a
 * person to schedule again once its site serves it.
 */
export function putBackStatus(before: PrePublish): CalendarStatus {
  return before.status === "scheduled" ? "approved" : before.status;
}

/**
 * What the calendar shows about a blog that is not live. "waiting": published,
 * and the routine is still checking its URL; it goes back to `backTo` at
 * `backBy` if the URL never answers. "failed": the URL never answered (the
 * post was put back, or it was published before the routine existed). Null
 * for a live post, a post never published, and every channel but the blog.
 */
export type LiveCheck =
  | { state: "waiting"; reason: string | null; backBy: string | null; backTo: string | null }
  | { state: "failed"; reason: string };

export function liveCheckOf(row: {
  channel: string;
  status: string;
  posted_url: string | null;
  published_at: string | null;
  pre_publish: unknown;
  live_check_error: string | null;
}): LiveCheck | null {
  if (row.channel !== "blog" || row.posted_url) return null;
  const before = row.status === "published" ? prePublishOf(row.pre_publish) : null;
  if (before) {
    const started = row.published_at ? Date.parse(row.published_at) : NaN;
    return {
      state: "waiting",
      reason: row.live_check_error,
      backBy: Number.isFinite(started) ? new Date(started + GRACE_MS).toISOString() : null,
      backTo: putBackStatus(before),
    };
  }
  return row.live_check_error ? { state: "failed", reason: row.live_check_error } : null;
}

/**
 * The sentence the calendar drawer shows for a blog that is not live, the
 * copy of the approved prototype. `status` is the row's status now: a failed
 * check on a row still published (published before R3.352, so there was
 * nothing to put back) is only waiting for its site, and says so.
 */
export function liveCheckMessage(check: LiveCheck, status: string, label: (status: string) => string): string {
  if (check.state === "waiting") {
    const answer = check.reason ? withoutScheme(check.reason) : "Its live URL has not answered yet";
    const by = check.backBy ? `by ${zonedClock(check.backBy, BUSINESS_TIME_ZONE).time}` : `within ${LIVE_GRACE_MINUTES} minutes`;
    const back = check.backTo ? `goes back to ${label(check.backTo)}` : "goes back";
    return `Not live yet. ${answer}. It is checked again every ${LIVE_CHECK_EVERY_MINUTES} minutes; if it still has not answered ${by}, the post ${back}.`;
  }
  if (status === "published") {
    return `Not live. ${withoutScheme(check.reason)}. It is checked again every ${LIVE_CHECK_EVERY_MINUTES} minutes and counts as live once the site serves it.`;
  }
  return `Not live. ${withoutScheme(check.reason)}, so the post went back to ${label(status)}. Publish again once the site serves it.`;
}

function withoutScheme(reason: string): string {
  return reason.replace(/^https?:\/\//, "");
}
