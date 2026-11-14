import { latestApproval } from "@/kernel/approvals/waiting";
import { contentVersion } from "@/kernel/approvals/version";
import type { ApprovalSubject } from "@/kernel/approvals/vocabulary";

// The version of a blog post a Publish approval is for (Y.16), and the gate
// every publish passes through. One place computes the version, from the row
// as it is stored, so the writer's approval, its publish step and
// publishBlogAsset (the hub, the calendar, the Publish Editor, the revenue
// board and the scheduled-publish cron all call it) can never disagree about
// what was approved.

export const CAMPAIGN_PUBLISH = "campaign_publish" as const satisfies ApprovalSubject;

/** What a version is made of: the title, the body, the SEO plan, the hero image and the date. */
export type BlogVersionParts = { title: string; copyMd: string | null; seoMd: string | null; imageUrl: string | null; publishDate?: string | null };

export function blogVersion(blog: BlogVersionParts): string {
  return contentVersion({ title: blog.title, copyMd: blog.copyMd, seoMd: blog.seoMd, imageUrl: blog.imageUrl, publishDate: blog.publishDate ?? null });
}

/**
 * The versions that count as this post: its version now and, once it is live,
 * the version it had before its first publish gave it today's date.
 */
export function postVersions(blog: BlogVersionParts & { status: string }): string[] {
  const now = blogVersion(blog);
  if (blog.status !== "published") return [now];
  const undated = blogVersion({ ...blog, publishDate: null });
  return undated === now ? [now] : [now, undated];
}

function str(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

export type ApprovedGate = { ok: true } | { ok: false; reason: string };

// What a person does about a refusal: the controls the campaign hub shows in
// that state. A waiting approval is decided with Publish; anything else (a
// rejected, withdrawn or outdated approval) is asked again with Ask for
// approval, which the hub offers whenever the writer is not running.
const PENDING_REFUSAL = "This post waits on its Publish approval: read it and press Publish on the campaign hub.";
const ASK_REFUSAL =
  "This post has no Publish approval for the version it is now. Press Ask for approval on the campaign hub (Stop the writer first if it is running), then Publish there.";

/**
 * May this version of a campaign's post go live? A campaign with an approval
 * on record publishes only a version its latest approval approved, whoever
 * presses publish; one with no approval history (a hand-made post) publishes as
 * before unless `required`. A withdrawn or rejected latest approval counts as
 * history: a post once put to a person goes live only once one approves it.
 * `versions` are the post's versions that count as itself: its version now
 * and, for a post already live, the version it had before publishing gave it
 * today's date. Auto-publish brands do not come here (publishBlogAsset skips
 * the gate for them: their switch is the approval). A failed read refuses:
 * "no approval" must never be what a database hiccup says.
 */
export async function approvedToPublish(campaignId: string, versions: string | string[], required = false): Promise<ApprovedGate> {
  let latest: Awaited<ReturnType<typeof latestApproval>>;
  try {
    latest = await latestApproval(CAMPAIGN_PUBLISH, campaignId);
  } catch (err) {
    return { ok: false, reason: `The Publish approval could not be read, so nothing was published. Try again in a moment. (${err instanceof Error ? err.message : String(err)})` };
  }
  if (!latest) return required ? { ok: false, reason: ASK_REFUSAL } : { ok: true };
  if (latest.state === "pending") return { ok: false, reason: PENDING_REFUSAL };
  const approved = latest.state === "approved" ? str(latest.metadata.version) : null;
  if (!approved || !(Array.isArray(versions) ? versions : [versions]).includes(approved)) return { ok: false, reason: ASK_REFUSAL };
  return { ok: true };
}
