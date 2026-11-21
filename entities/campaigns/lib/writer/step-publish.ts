import { publishBlogAsset, type PublishResult } from "@/entities/campaigns/lib/blog-publish";
import { once } from "@/kernel/audit/effects";
import { finishCampaign, loadBlogAsset, scheduleBlogAsset } from "./data";
import { approvedToPublish, blogVersion } from "../blog-version";
import { WRITER_ACTOR, type StepRunner } from "./types";
import { saigonToday } from "@/kernel/config/dates";

// Step 10: publish. The same deterministic publishBlogAsset the hub button
// calls, inside the step route's request so the blog cache revalidates.
// Reached after every channel is written when the brand's auto-publish switch
// is on, and otherwise only through an approved Publish approval for this very
// version of the post (Y.16; advance checks it before this runs). Passes when
// the post is live and its URL answered 200, and closes the campaign as done on
// the day the post goes live.
//
// A post dated later than today is not published early. It is moved to
// scheduled, the same hand-off a person makes on the hub, and the daily
// publish routine puts it live on its date. That keeps a campaign written
// ahead of time from jumping the queue on the blog and in the weekly letter.
//
// The publish is claimed in the effect ledger first (Z.1), keyed by the post
// and its version: a publish has no provider key, and a step retried after it
// published but before it finished must not publish again. A key an earlier
// attempt already holds is the publish done when the post reads published, and
// otherwise an outcome nobody knows, which the runbook says how to settle.
async function republishes(campaignId: string, autoPublish: boolean, version: string): Promise<boolean> {
  if (autoPublish) return true;
  return (await approvedToPublish(campaignId, version, true)).ok;
}

export const runPublish: StepRunner = async ({ campaign, profile }) => {
  const loaded = await loadBlogAsset(campaign.id);
  if (!loaded.ok) return loaded;
  const blog = loaded.data;
  const today = saigonToday();
  if (blog.publishDate && blog.publishDate > today && blog.status !== "published") {
    const scheduled = await scheduleBlogAsset(blog.id);
    if (!scheduled.ok) return { ok: false, error: `Publish: ${scheduled.error}` };
    const finished = await finishCampaign(campaign.id, blog.publishDate);
    if (!finished.ok) return { ok: false, error: `Publish: ${finished.error}` };
    return { ok: true, summary: `Scheduled for ${blog.publishDate}; the daily publish routine puts it live that morning. Campaign done.` };
  }
  // Already live. An earlier attempt that published it and stopped before
  // closing the campaign: close it, not by version, because a post published
  // with no date was given today's, so its version changed in the act. But a
  // live post a person edited and had approved again (Ask for approval on the
  // hub), or any live post of an auto-publish brand the writer ran again, is
  // re-published below so the site serves what was approved.
  if (blog.status === "published" && !(await republishes(campaign.id, profile.autoPublish, blogVersion(blog)))) {
    const finished = await finishCampaign(campaign.id, blog.publishDate ?? today);
    if (!finished.ok) return { ok: false, error: `Publish: ${finished.error}` };
    return { ok: true, summary: `Already published${blog.postedUrl ? ` at ${blog.postedUrl}` : ""} by an earlier attempt. Campaign done.` };
  }
  const key = `campaigns:publish:${blog.id}:${blogVersion(blog)}`;
  let r: PublishResult | null = null;
  const effect = await once(key, "publish", async () => {
    r = await publishBlogAsset(blog.id, WRITER_ACTOR);
    return r.ok ? { ok: true, ref: r.liveUrl } : { ok: false, error: r.errors.join(" ") };
  });
  if (!effect.acted) {
    if (blog.status !== "published") return { ok: false, error: `Publish: ${effect.reason}, but the post is not published. Check automation_effects for ${key} (docs/operations/routines-runbook.md).` };
    const finished = await finishCampaign(campaign.id, blog.publishDate ?? today);
    if (!finished.ok) return { ok: false, error: `Publish: ${finished.error}` };
    return { ok: true, summary: `Already published by an earlier attempt (${key}). Campaign done.` };
  }
  const published = r as PublishResult | null;
  if (!published) return { ok: false, error: `Publish: ${effect.outcome.ok ? "no result" : effect.outcome.error}` };
  if (!published.ok) return { ok: false, error: `Publish: ${published.errors.join(" ")}` };
  // A live-URL check can only be made against a real origin. When the site
  // origin is not configured the URL is a bare path, the check can never pass,
  // and failing here would leave a published post's campaign open forever. The
  // post is live either way; say so and carry on.
  const hasOrigin = /^https?:\/\//.test(published.liveUrl);
  if (!published.verified && hasOrigin) return { ok: false, error: `Publish: the post was published but ${published.liveUrl} did not answer 200. ${published.warning ?? ""}`.trim() };
  const finished = await finishCampaign(campaign.id, blog.publishDate ?? today);
  if (!finished.ok) return { ok: false, error: `Publish: ${finished.error}` };
  if (!hasOrigin) return { ok: true, summary: `Published at ${published.liveUrl}; the live URL was not verified because no site origin is configured (set NEXT_PUBLIC_SITE_URL). Campaign done.` };
  return { ok: true, summary: `Published at ${published.liveUrl}. Campaign done.` };
};
