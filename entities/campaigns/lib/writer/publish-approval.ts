import { decidePendingApproval, openApproval, withdrawPendingApproval } from "@/kernel/approvals/requests";
import { latestApproval, type SubjectApproval } from "@/kernel/approvals/waiting";
import { closeParkedRun, parkRun } from "@/kernel/audit/parked-runs";
import { stepTick } from "@/kernel/audit/step-driver";
import type { Result } from "@/kernel/data/result";
import { getBrandProfile, type BrandProfile } from "@/entities/campaigns/lib/brand-profiles";
import { siteForBrandSlug } from "@/entities/campaigns/lib/brand-sites";
import { parseSeoMd } from "@/entities/campaigns/lib/seo";
import { blogVersion, CAMPAIGN_PUBLISH, postVersions } from "../blog-version";
import { loadBlogAsset, loadCampaign, moveWriterStateFrom, setWriterState, type BlogAsset, type WriterCampaign } from "./data";
import { WRITER_DONE, WRITER_READY, WRITER_REJECTED, WRITER_ROUTINE_ID } from "./steps";

// The writer's Publish approval (Y.16, decision Y.53, plan B6). A brand without
// auto-publish parks a finished run at ready, and the run waits on a
// campaign_publish approval row addressed to whoever holds the publish
// permission, not on a hook and not on a timeout. The approval carries the
// version of the post it is for: a hash of the exact title, body, SEO plan,
// hero image and date that would go live. Approving decides that row and moves
// the run to its publish step, which the button runs at once and the agent
// driver retries if it fails; the publish step itself checks the latest
// approval against the post it is about to publish, so an edit made after the
// approval sends the run back to ready with a new approval instead of
// publishing what nobody approved. Rejecting closes the run.
//
// The version is ../blog-version's, the one helper publishBlogAsset gates every
// publish on, so a scheduled post edited after its approval does not go live
// on its date either (the scheduled-publish cron refuses it); Ask for approval on the
// hub reopens the approval for the post as it is.
//
// Nothing here guards: the hub's actions (./actions) call requirePermission
// first, inline (ADR 0007).

// Who may approve a post going public: the holders of the atom that runs
// marketing, the people who could press the hub's Publish before there was an
// approval at all (admin and the Revenue role), so the approval adds a record
// and a version check and moves nobody's authority.
export const PUBLISH_APPROVER = "campaigns.marketing";

export type Decider = { personId: string | null; email: string };

// The waiting row's tick: one per version asked for, so a new approval after an
// edit is a new wait and the old one closes as superseded. It differs from
// every step tick, which claim_tick would otherwise refuse while it waits.
function waitTick(campaignId: string, epoch: string | null, version: string): string {
  return stepTick({ id: campaignId, epoch, step: `publish-approval-${version}` });
}

function liveUrl(profile: Pick<BrandProfile, "brandSlug" | "brandName">, blog: BlogAsset): string {
  const site = siteForBrandSlug(profile.brandSlug);
  const slug = parseSeoMd(blog.seoMd).slug;
  if (site && slug) return `${site.domain}/post/${slug}/`;
  return `${profile.brandName}'s blog`;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

/**
 * Ask for approval of the post as it is now, and park the run on it. Opening is
 * idempotent: an approval already pending for this campaign is refreshed with
 * this version rather than joined by a second. `epoch` is the run's start time.
 */
export async function askToPublish(
  campaign: Pick<WriterCampaign, "id" | "name">,
  epoch: string | null,
  profile: Pick<BrandProfile, "brandSlug" | "brandName">,
  blog: BlogAsset,
): Promise<Result & { version?: string }> {
  const version = blogVersion(blog);
  const tick = waitTick(campaign.id, epoch, version);
  const opened = await openApproval({
    subjectType: CAMPAIGN_PUBLISH,
    subjectId: campaign.id,
    approverPermission: PUBLISH_APPROVER,
    requestedBy: null,
    label: `Publish "${blog.title}"`,
    metadata: { version, reach: "public", where: liveUrl(profile, blog), run: tick, campaign: campaign.name },
  });
  if (!opened.ok) return opened;
  // The approval row is what the run waits on; the waiting row is how Settings
  // -> Agents shows the wait. A wait it cannot show is logged, not a failed ask.
  const parked = await parkRun(WRITER_ROUTINE_ID, tick, `Waiting on a Publish approval for version ${version}.`);
  if (!parked.ok) console.error(`[writer] ${campaign.id}: approval opened but the wait was not recorded: ${parked.error}`);
  return { ok: true, version };
}

export type PublishGate = { ok: true; version: string } | { ok: false; reason: string };

/**
 * May the publish step publish this post? Only when the campaign's latest
 * approval is approved and is for exactly this version. Raises when the
 * approval cannot be read, so the step fails and is retried rather than
 * publishing or asking again on a guess.
 */
export async function publishGate(campaignId: string, blog: BlogAsset): Promise<PublishGate> {
  const version = blogVersion(blog);
  const latest = await latestApproval(CAMPAIGN_PUBLISH, campaignId);
  if (!latest) return { ok: false, reason: "No Publish approval is on record for this post." };
  if (latest.state !== "approved") return { ok: false, reason: `The Publish approval is ${latest.state}, not approved.` };
  if (str(latest.metadata.version) !== version) return { ok: false, reason: "The post changed after it was approved." };
  return { ok: true, version };
}

/**
 * What the hub shows beside Publish: the pending version, the post's version
 * now, where it goes, and whether the post needs asking about: a brand that
 * publishes on approval (`gated`), with approval history, whose post is not
 * skipped and is no version the latest approval approved or awaits. Every
 * publish path refuses such a post (publishBlogAsset) and points at Ask for
 * approval, which the hub shows whenever the writer is not running.
 * `editsLocked` says the post is live on such a campaign, so every edit of its
 * version is refused until it is unpublished (Y.91, ../blog-live-edit).
 */
export type PublishApprovalView = {
  pendingVersion: string | null;
  currentVersion: string | null;
  latestState: string | null;
  where: string | null;
  askable: boolean;
  editsLocked: boolean;
};

export async function publishApprovalView(campaignId: string, gated = true): Promise<PublishApprovalView> {
  const [latest, blog] = await Promise.all([latestApproval(CAMPAIGN_PUBLISH, campaignId), loadBlogAsset(campaignId)]);
  const pendingVersion = latest?.state === "pending" ? str(latest.metadata.version) : null;
  const approvedVersion = latest?.state === "approved" ? str(latest.metadata.version) : null;
  const versions = blog.ok ? postVersions(blog.data) : [];
  return {
    pendingVersion,
    currentVersion: blog.ok ? blogVersion(blog.data) : null,
    latestState: latest?.state ?? null,
    where: latest ? str(latest.metadata.where) : null,
    askable:
      gated && blog.ok && blog.data.status !== "skipped" && latest !== null && !(approvedVersion && versions.includes(approvedVersion)) && !(pendingVersion && versions.includes(pendingVersion)),
    editsLocked: gated && blog.ok && blog.data.status === "published" && latest !== null,
  };
}

async function readLatest(campaignId: string): Promise<{ ok: true; latest: SubjectApproval | null } | { ok: false; error: string }> {
  try {
    return { ok: true, latest: await latestApproval(CAMPAIGN_PUBLISH, campaignId) };
  } catch (err) {
    return { ok: false, error: `Could not read the Publish approval: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// Ask again for the post as it is now, withdrawing a stale pending approval
// first so the inbox never holds two answers to one question.
async function askAgain(campaign: WriterCampaign, blog: BlogAsset, stale: SubjectApproval | null, by: Decider): Promise<Result> {
  if (stale?.state === "pending") {
    const withdrawn = await withdrawPendingApproval(
      { subjectType: CAMPAIGN_PUBLISH, subjectId: campaign.id, cancelledBy: by.personId, reason: "The post changed after approval was asked for." },
      by.email,
    );
    if (!withdrawn.ok) return withdrawn;
    const run = str(stale.metadata.run);
    if (run) await closeParkedRun(WRITER_ROUTINE_ID, run, { status: "skipped", summary: "superseded: the post changed" });
  }
  if (!campaign.brandId) return { ok: false, error: "The campaign has no brand." };
  const profile = await getBrandProfile(campaign.brandId);
  if (!profile) return { ok: false, error: "Brand not found." };
  return askToPublish(campaign, campaign.writerStartedAt, profile, blog);
}

/**
 * The approver's Publish. `seenVersion` is the version the page showed them;
 * it must be the post's version now and the version the pending approval was
 * asked for. When either differs, the stale approval is withdrawn, a new one is
 * opened for the post as it is, and the click decides nothing: the approver
 * reads it again. Only the call that closes the pending row moves the run, so a
 * double click or two approvers at once publish once.
 */
export async function approvePublish(campaignId: string, seenVersion: string, by: Decider): Promise<Result> {
  const loaded = await loadCampaign(campaignId);
  if (!loaded.ok) return loaded;
  const campaign = loaded.data;
  if (campaign.writerStep !== WRITER_READY) {
    return { ok: false, error: campaign.writerStep === "publish" ? "Already approved; the post is being published." : "The writer is not waiting on a Publish approval." };
  }
  const blog = await loadBlogAsset(campaignId);
  if (!blog.ok) return blog;
  const current = blogVersion(blog.data);
  const read = await readLatest(campaignId);
  if (!read.ok) return read;
  const latest = read.latest;

  // Approved for this very version with the run still at ready: the decision
  // landed and the state write after it did not. Resume rather than ask again.
  if (latest?.state === "approved" && str(latest.metadata.version) === current) return moveToPublish(campaignId, latest, by);

  const pendingVersion = latest?.state === "pending" ? str(latest.metadata.version) : null;
  if (seenVersion !== current || pendingVersion !== current) {
    const asked = await askAgain(campaign, blog.data, latest, by);
    if (!asked.ok) return { ok: false, error: `The approval could not be asked for again: ${asked.error}` };
    if (seenVersion !== current) return { ok: false, error: "The post changed since this page loaded. Reload, read it again, and press Publish." };
    return {
      ok: false,
      error: pendingVersion
        ? "The post changed after approval was asked for, so that approval is withdrawn and a new one is open for the post as it is now. Read it again and press Publish."
        : "No Publish approval was open for this post; one is open now for the version on this page. Press Publish again to approve it.",
    };
  }

  // Bound to the row just checked and the version on the page: a refresh of
  // that row by an ask for a newer version, between this read and the
  // decision, leaves it undecided rather than approved for what nobody read.
  const decided = await decidePendingApproval(
    {
      subjectType: CAMPAIGN_PUBLISH,
      subjectId: campaignId,
      state: "approved",
      decidedBy: by.personId,
      metadata: { approvedBy: by.email },
      expect: { id: (latest as SubjectApproval).id, version: current },
    },
    by.email,
  );
  if (!decided.ok) return { ok: false, error: `Could not record the approval: ${decided.error}` };
  if (!decided.decided) return { ok: false, error: "This approval was decided or asked again a moment ago. Reload and read it again." };
  return moveToPublish(campaignId, latest, by);
}

async function moveToPublish(campaignId: string, approval: SubjectApproval | null, by: Decider): Promise<Result> {
  const moved = await setWriterState(campaignId, { step: "publish", error: null });
  if (!moved.ok) return { ok: false, error: `Approved, but the run did not move on to publish (${moved.error}). Press Publish again to resume it.` };
  const run = approval ? str(approval.metadata.run) : null;
  if (run) await closeParkedRun(WRITER_ROUTINE_ID, run, { status: "ok", summary: `approved by ${by.email}` });
  return { ok: true };
}

/**
 * Ask for approval of the post as it is, for a campaign whose writer is not
 * running: no run (stopped, or never run), a finished run, or a rejected one.
 * This is the way out of every refusal publishBlogAsset gives a post with
 * approval history: a scheduled post edited since its approval, a stopped run
 * whose approval was withdrawn, a rejected post being tried again, a live post
 * edited since. The run goes to ready under a new start time, so the publish
 * tick it reaches next is a fresh one, with an approval for the post as it is
 * now; Publish then publishes, schedules or re-publishes it.
 */
export async function reaskPublish(campaignId: string, by: Decider): Promise<Result> {
  const loaded = await loadCampaign(campaignId);
  if (!loaded.ok) return loaded;
  const step = loaded.data.writerStep;
  if (step !== null && step !== WRITER_DONE && step !== WRITER_REJECTED) {
    return { ok: false, error: step === WRITER_READY ? "The post already waits on a Publish approval: press Publish." : "The writer is running; Stop it first, then ask for approval." };
  }
  const blog = await loadBlogAsset(campaignId);
  if (!blog.ok) return blog;
  if (blog.data.status === "skipped") return { ok: false, error: "The post is skipped; nothing to ask about." };
  const read = await readLatest(campaignId);
  if (!read.ok) return read;
  const approved = read.latest?.state === "approved" ? str(read.latest.metadata.version) : null;
  if (approved && postVersions(blog.data).includes(approved)) {
    return { ok: false, error: "The post is the version approved; nothing to ask about." };
  }
  // Only from the step checked above: a run started, stopped or decided in the
  // meantime is not pulled back to ready.
  const epoch = new Date().toISOString();
  const moved = await moveWriterStateFrom(campaignId, step, { step: WRITER_READY, error: null, startedAt: epoch });
  if (!moved.ok) return moved;
  if (!moved.moved) return { ok: false, error: "The writer moved on a moment ago. Reload to see where it is." };
  return askAgain({ ...loaded.data, writerStartedAt: epoch }, blog.data, read.latest, by);
}

/** The approver's Reject: decides the pending approval and closes the run as rejected. */
export async function rejectPublish(campaignId: string, by: Decider, reason: string | null = null): Promise<Result> {
  const loaded = await loadCampaign(campaignId);
  if (!loaded.ok) return loaded;
  if (loaded.data.writerStep !== WRITER_READY) return { ok: false, error: "The writer is not waiting on a Publish approval." };
  const read = await readLatest(campaignId);
  if (!read.ok) return read;
  const decided = await decidePendingApproval(
    { subjectType: CAMPAIGN_PUBLISH, subjectId: campaignId, state: "rejected", decidedBy: by.personId, reason },
    by.email,
  );
  if (!decided.ok) return { ok: false, error: `Could not record the rejection: ${decided.error}` };
  if (!decided.decided) return { ok: false, error: "There is no Publish approval waiting to reject; it was decided a moment ago, or none was open." };
  const closed = await setWriterState(campaignId, { step: WRITER_REJECTED, error: null });
  if (!closed.ok) return { ok: false, error: `Rejected, but the run did not close (${closed.error}). Press Stop to end it.` };
  const run = read.latest ? str(read.latest.metadata.run) : null;
  if (run) await closeParkedRun(WRITER_ROUTINE_ID, run, { status: "ok", summary: "rejected" });
  return { ok: true };
}

/**
 * Withdraw a pending Publish approval when its run ends without a decision: a
 * person stopped the run or started it again. A decided approval is left as it
 * is, because a published post stays approved.
 */
export async function withdrawPublish(campaignId: string, by: Decider, why: string): Promise<Result> {
  const read = await readLatest(campaignId);
  if (!read.ok) return read;
  if (read.latest?.state !== "pending") return { ok: true };
  const withdrawn = await withdrawPendingApproval({ subjectType: CAMPAIGN_PUBLISH, subjectId: campaignId, cancelledBy: by.personId, reason: why }, by.email);
  if (!withdrawn.ok) return withdrawn;
  const run = str(read.latest.metadata.run);
  if (run) await closeParkedRun(WRITER_ROUTINE_ID, run, { status: "skipped", summary: why });
  return { ok: true };
}
