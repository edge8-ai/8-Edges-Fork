import { companyOs, type CompanyOsUpdate } from "@/kernel/data/supabase";
import { latestApproval } from "@/kernel/approvals/waiting";
import { getBrandProfile } from "./brand-profiles";
import { blogVersion, CAMPAIGN_PUBLISH, postVersions, type BlogVersionParts } from "./blog-version";

// A live post on a campaign that publishes on approval keeps the version it was
// published in (Y.91, Khoa's decision of 9 Oct 2026). The public page renders
// the row as stored, so an edit to a live post's title, body, SEO plan, hero
// image or date would be on the site the moment it saved, in a version nobody
// approved, and "an edited draft needs a new approval" would hold everywhere
// except on the one page the public reads. So every path that writes those
// columns asks liveEditRefusal first: the calendar drawer and its Draft with
// AI, the hub's Draft with AI and the writer's steps, the asset page's copy
// editor and its regenerate buttons, the image picker, and the Publish
// Editor's update_blog_content tool.
//
// The rule is the Publish gate's (publishBlogAsset), read the same way: the
// campaign's brand decides, not the row's, and a post whose brand is not its
// campaign's stays locked, as the gate refuses it; an auto-publish brand's switch is
// its approval (decision Y.53), so its live posts stay editable; a post with no
// campaign, or whose campaign has no approval history, publishes without an
// approval and so edits as before. Any read that fails refuses, because "not
// gated" must never be what a database hiccup says. The way out is the one the
// hub already has: move the post out of Published (unpublish it), edit it,
// then Ask for approval and Publish on the campaign hub.

/** The columns that make up a post's version (./blog-version). */
const VERSION_COLUMNS = ["title", "copy_md", "seo_md", "image_url", "publish_date"] as const;
type VersionColumn = (typeof VERSION_COLUMNS)[number];
type VersionRow = { [K in VersionColumn]: K extends "title" ? string : string | null };

export const LIVE_EDIT_REFUSAL =
  "This post is live and its campaign publishes on approval, so its title, copy, SEO plan, hero image and date cannot change while it is live: " +
  "the live page would show a version nobody approved. To change it, unpublish it first (drag it out of Published on the campaign hub's Workboard tab or on the calendar), " +
  "edit it, then press Ask for approval on the campaign hub and Publish.";

/**
 * The campaign's brand, the brand the Publish gate goes by. `outcome` finishes
 * the refusal ("nothing was published", "the edit was not saved"). A failed
 * read refuses: guessing the brand would guess whether the gate applies.
 */
export async function campaignBrand(campaignId: string, outcome: string): Promise<{ ok: true; brandId: string | null } | { ok: false; error: string }> {
  const { data, error } = await companyOs.from("marketing_campaigns").select("brand_id").eq("id", campaignId).maybeSingle();
  if (error) return { ok: false, error: `The post's campaign could not be read, so ${outcome}. Try again in a moment. (${error.message})` };
  if (!data) return { ok: false, error: `The post's campaign was not found, so ${outcome}.` };
  return { ok: true, brandId: data.brand_id };
}

/** Whether a brand publishes without an approval. A brand whose profile cannot be read is gated, the stricter answer. */
export async function autoPublishes(brandId: string | null): Promise<boolean> {
  if (!brandId) return false;
  const profile = await getBrandProfile(brandId);
  return profile?.autoPublish === true;
}

function parts(row: VersionRow): BlogVersionParts {
  return { title: row.title, copyMd: row.copy_md, seoMd: row.seo_md, imageUrl: row.image_url, publishDate: row.publish_date };
}

function withChange(row: VersionRow, change: Record<string, unknown>): VersionRow {
  const next: Record<string, unknown> = { ...row };
  for (const c of VERSION_COLUMNS) if (change[c] !== undefined) next[c] = change[c];
  return next as VersionRow;
}

/**
 * Why this write may not land on this content row, or null. `change` is the
 * update about to be written; a change that leaves the post's version as it is
 * (a save of the drawer that only touched the notes, a re-pick of the selected
 * image) passes, and so does one that makes it a version the latest approval
 * approved (putting back what was approved). Leave `change` out to ask before
 * an edit whose text is not known yet, such as before a model call: any edit
 * of a live post on a gated campaign is then refused.
 */
export async function liveEditRefusal(id: string, change?: Record<string, unknown>): Promise<string | null> {
  if (change && !VERSION_COLUMNS.some((c) => change[c] !== undefined)) return null;
  const { data, error } = await companyOs
    .from("marketing_content")
    .select("channel, status, campaign_id, brand_id, title, copy_md, seo_md, image_url, publish_date")
    .eq("id", id)
    .maybeSingle();
  if (error) return `The post could not be read, so the edit was not saved. Try again in a moment. (${error.message})`;
  if (!data || data.channel !== "blog" || data.status !== "published" || !data.campaign_id) return null;

  const before = parts(data);
  const after = change ? parts(withChange(data, change)) : null;
  if (after && blogVersion(after) === blogVersion(before)) return null;

  const owner = await campaignBrand(data.campaign_id, "the edit was not saved");
  if (!owner.ok) return owner.error;
  // A post moved off its campaign's brand is one the gate refuses to publish
  // at all, so neither brand's switch unlocks it: moving the campaign onto an
  // auto-publish brand must not open its live posts to edits.
  const moved = owner.brandId !== null && data.brand_id !== owner.brandId;
  if (!moved && (await autoPublishes(owner.brandId ?? data.brand_id))) return null;

  let latest: Awaited<ReturnType<typeof latestApproval>>;
  try {
    latest = await latestApproval(CAMPAIGN_PUBLISH, data.campaign_id);
  } catch (err) {
    return `The Publish approval could not be read, so the edit was not saved. Try again in a moment. (${err instanceof Error ? err.message : String(err)})`;
  }
  if (!latest) return null;
  const approved = latest.state === "approved" && typeof latest.metadata.version === "string" ? latest.metadata.version : null;
  if (after && approved && postVersions({ ...after, status: "published" }).includes(approved)) return null;
  return LIVE_EDIT_REFUSAL;
}

/** A write a live-edit refusal stopped: the refusal is the message, and `refused` tells it from a database error. */
export type ContentWriteError = { message: string; refused?: true };

/**
 * Update a content row unless liveEditRefusal refuses the change. Answers in
 * the shape of a Supabase write so a call site swaps one line. A caller that
 * has read the row's channel passes it, and a row that is not a blog is
 * written without asking: only a blog is refused, a campaign's row never
 * changes channel (channelChangeRefusal), and a row with no campaign is never
 * refused, so a social row cannot become a gated blog under the write.
 */
export async function updateContentUnlessLive(
  id: string,
  fields: CompanyOsUpdate<"marketing_content">,
  channel?: string,
): Promise<{ error: ContentWriteError | null }> {
  const refused = channel === undefined || channel === "blog" ? await liveEditRefusal(id, fields) : null;
  if (refused) return { error: { message: refused, refused: true } };
  const { error } = await companyOs.from("marketing_content").update(fields).eq("id", id);
  return { error };
}
