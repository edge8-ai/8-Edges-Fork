import { publishBlogAsset, type PublishResult } from "@/entities/campaigns/lib/blog-publish";
import { once } from "@/kernel/audit/effects";
import { finishCampaign, loadBlogAsset, scheduleBlogAsset } from "./data";
import { approvedToPublish, blogVersion } from "../blog-version";
import { WRITER_ACTOR, type StepResult, type StepRunner } from "./types";
import { liveCheckMessage, type LiveCheck } from "../blog-live";
import { STATUS_LABEL, type CalendarStatus } from "../marketing-calendar-shared";
import { saigonToday } from "@/kernel/config/dates";

// Step 10: publish. The same deterministic publishBlogAsset the hub button
// calls, inside the step route's request so the blog cache revalidates.
// Reached after every channel is written when the brand's auto-publish switch
// is on, and otherwise only through an approved Publish approval for this very
// version of the post (Y.16; advance checks it before this runs). Passes when
// the post is live and its URL answered 200, and closes the campaign as done on
// the day the post goes live. A publish whose URL has not answered yet is not
// live (R3.352): the step fails with the reason, so the driver retries it, and
// a retry while the blog-live-check routine is still asking waits. The publish
// itself happened, so the ledger keeps its claim and no retry publishes again.
// By the last retry the routine has either stamped the post live, which closes
// the campaign, or put it back, which stops the run with the reason for a
// person to publish again once the site serves the post.
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

// Why a post this run published is not live (still being checked, published
// before the check existed and never answered, or put back), in the sentence
// the calendar drawer shows for the same row.
function notLive(status: string, check: LiveCheck): StepResult {
  return { ok: false, error: `Publish: ${liveCheckMessage(check, status, (s) => STATUS_LABEL[s as CalendarStatus] ?? s)}` };
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
  // A publish still waiting on its live check is neither done nor worth
  // repeating: the routine settles it within the grace window.
  // A published post that is not live (published before R3.352, or whose slug
  // changed) passes the same approval gate as a live one: an edit nobody
  // approved is never published just because the site has not served it.
  if (blog.status === "published" && blog.liveCheck?.state === "waiting") return notLive(blog.status, blog.liveCheck);
  if (blog.status === "published" && !(await republishes(campaign.id, profile.autoPublish, blogVersion(blog)))) {
    if (blog.liveCheck) return notLive(blog.status, blog.liveCheck);
    const finished = await finishCampaign(campaign.id, blog.publishDate ?? today);
    if (!finished.ok) return { ok: false, error: `Publish: ${finished.error}` };
    return { ok: true, summary: `Already published${blog.postedUrl ? ` at ${blog.postedUrl}` : ""} by an earlier attempt. Campaign done.` };
  }
  const key = `campaigns:publish:${blog.id}:${blogVersion(blog)}`;
  let r: PublishResult | null = null;
  const effect = await once(key, "publish", async () => {
    r = await publishBlogAsset(blog.id, WRITER_ACTOR);
    // A publish whose URL has not answered still happened: the claim holds,
    // and the retries below read the post's live state rather than publish.
    return r.ok ? { ok: true, ref: r.liveUrl } : { ok: false, error: r.errors.join(" ") };
  });
  if (!effect.acted) {
    if (blog.liveCheck) return notLive(blog.status, blog.liveCheck);
    if (blog.status !== "published") return { ok: false, error: `Publish: ${effect.reason}, but the post is not published. Check automation_effects for ${key} (docs/operations/routines-runbook.md).` };
    const finished = await finishCampaign(campaign.id, blog.publishDate ?? today);
    if (!finished.ok) return { ok: false, error: `Publish: ${finished.error}` };
    return { ok: true, summary: `Already published by an earlier attempt (${key}). Campaign done.` };
  }
  const published = r as PublishResult | null;
  if (!published) return { ok: false, error: `Publish: ${effect.outcome.ok ? "no result" : effect.outcome.error}` };
  if (!published.ok) return { ok: false, error: `Publish: ${published.errors.join(" ")}` };
  // A live post published again keeps its earlier URL (no check is pending);
  // the retry finds it published with nothing waiting and closes the campaign.
  if (!published.live) {
    return published.liveCheck
      ? notLive("published", published.liveCheck)
      : { ok: false, error: `Publish: published again, but its URL did not answer: ${published.reason}. The post stays live at its earlier URL.` };
  }
  const finished = await finishCampaign(campaign.id, blog.publishDate ?? today);
  if (!finished.ok) return { ok: false, error: `Publish: ${finished.error}` };
  // A live-URL check can only be made against a real origin. When the site
  // origin is not configured the URL is a bare path and publishBlogAsset does
  // not check it; the post is live either way, so say so and carry on.
  if (!published.checked) return { ok: true, summary: `Published at ${published.liveUrl}; the live URL was not verified because no site origin is configured (set NEXT_PUBLIC_SITE_URL). Campaign done.` };
  return { ok: true, summary: `Published at ${published.liveUrl}. Campaign done.` };
};
