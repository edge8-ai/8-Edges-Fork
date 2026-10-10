import { revalidateTag, revalidatePath } from "next/cache";
import { companyOs } from "@/kernel/data/supabase";
import { recordAudit } from "@/kernel/audit/audit";
import { categories } from "@/entities/site";
import { parseSeoMd, isValidSlug, type ParsedSeo } from "@/entities/campaigns/lib/seo";
import { BLOG_CACHE_TAG, postTag } from "./blog";
import { siteForBrandSlug, blogPublishBlocker } from "@/entities/campaigns/lib/brand-sites";
import { saigonToday } from "@/kernel/config/dates";
import { approvedToPublish, postVersions } from "./blog-version";
import { autoPublishes, campaignBrand } from "./blog-live-edit";

// The deterministic publish core, runtime-agnostic so both the admin server
// action and the Publish Editor agent's publish tool call the same logic. It
// validates, normalizes the loose seo_md into columns, flips status, revalidates
// every surface, and verifies the live URL. Brand-aware: the destination domain
// comes from the asset's brand, never a hardcoded site. Never throws for a
// validation problem — it returns the full failure list for the caller to act on.

const MIN_WORDS = 600;

export type PublishResult =
  | { ok: true; slug: string; liveUrl: string; verified: boolean; warning?: string }
  | { ok: false; errors: string[] };

type BlogRow = {
  id: string;
  channel: string;
  title: string;
  status: string;
  copy_md: string | null;
  seo_md: string | null;
  image_url: string | null;
  publish_date: string | null;
  posted_url: string | null;
  brand_id: string | null;
  campaign_id: string | null;
  brands: { name: string; slug: string } | { name: string; slug: string }[] | null;
};

const SELECT =
  "id, channel, title, status, copy_md, seo_md, image_url, publish_date, posted_url, brand_id, campaign_id, brands(name, slug)";

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? v[0] ?? null : v;
}

function bodyWordCount(copyMd: string): number {
  const body = copyMd.split("## FAQ")[0];
  const text = body
    .replace(/<[^>]+>/g, " ")
    .replace(/[#*`>_[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.split(" ").length : 0;
}

function resolveCategory(parsedCategory: string | null): { category: string; categorySlug: string } {
  const wanted = (parsedCategory ?? "").trim().toLowerCase();
  const hit = categories.find((c) => c.slug === wanted || c.label.toLowerCase() === wanted);
  return hit ? { category: hit.label, categorySlug: hit.slug } : { category: "Innovation", categorySlug: "innovation" };
}

// Pure validation, shared by the publish action and the agent's read-only
// run_validation_checks tool. Reports every failure at once.
export function validateBlogForPublish(
  row: Pick<BlogRow, "channel" | "copy_md" | "seo_md" | "image_url">,
  parsed: ParsedSeo,
  slugTaken: (slug: string) => boolean,
): string[] {
  const errors: string[] = [];
  if (row.channel !== "blog") errors.push("Only blog assets can be published to the site.");
  if (!row.copy_md?.trim()) errors.push("The post has no body copy.");
  if (!row.image_url) errors.push("The post has no hero image. Generate or select one first.");
  if (!row.seo_md?.trim()) errors.push("The post has no SEO plan (seo_md).");

  if (!parsed.slug) errors.push("No slug found in the SEO plan.");
  else if (!isValidSlug(parsed.slug)) errors.push(`Slug "${parsed.slug}" is not a valid kebab-case slug.`);
  else if (slugTaken(parsed.slug)) errors.push(`Slug "${parsed.slug}" is already in use by another post.`);
  if (!parsed.titleTag) errors.push("No title tag found in the SEO plan.");
  if (!parsed.metaDescription) errors.push("No meta description found in the SEO plan.");

  const copy = row.copy_md ?? "";
  if (copy && bodyWordCount(copy) < MIN_WORDS) errors.push(`Body is under ${MIN_WORDS} words.`);
  if (copy && !/<details[^>]*class="faq-item"/i.test(copy)) errors.push("The post has no FAQ (required for FAQ structured data).");

  // Brand rule: never em dashes.
  const emDashScope = [copy, parsed.titleTag ?? "", parsed.metaDescription ?? ""].join("\n");
  if (emDashScope.includes("—")) errors.push("Contains an em dash (—). Edge8 never uses em dashes.");

  // SEO floor: every post links into the rest of the blog (in the body, not the
  // FAQ), and the title tag must be crafted, not "{title} | Edge8 Blog" filler.
  // Both defects shipped at scale once (the static migration bypassed this
  // gate); the gate keeps them out of anything published from here on.
  const bodyOnly = copy.split("## FAQ")[0];
  const internalLinks = (bodyOnly.match(/\]\(\/post\//g) ?? []).length;
  if (copy && internalLinks < 2) {
    errors.push(`Only ${internalLinks} internal link(s) in the body. Add at least 2 links to related posts (/post/<slug>/).`);
  }
  if (parsed.titleTag && /\|\s*Edge8 Blog\s*$/i.test(parsed.titleTag)) {
    errors.push('Title tag is the generic "... | Edge8 Blog" pattern. Write a keyword-led title tag.');
  }

  return errors;
}

// True if the slug belongs to a legacy static post or a *different* published
// DB blog row.
async function isSlugTaken(slug: string, selfId: string): Promise<boolean> {
  const { data, error: slugErr } = await companyOs.from("marketing_content").select("id")
    .eq("channel", "blog")
    .eq("slug", slug)
    .neq("id", selfId)
    .maybeSingle();
  if (slugErr) console.error("[company-os/campaigns] marketing_content", slugErr);
  return Boolean(data);
}

// Revalidate every surface that lists or renders a blog post. Called on publish
// AND on unpublish so the site reflects the change within one request.
//
// Next 16 gave revalidateTag a second argument and made a bare cacheLife
// profile ("max") serve the stale page while it refreshes in the background.
// `{ expire: 0 }` keeps what 14 and 15 did: the entry expires at once and the
// next request renders fresh (B.18.3). updateTag would too, but only inside a
// server action, and crons and the publish editor's route call this as well.
const EXPIRE_NOW = { expire: 0 };
export function revalidateBlog(slug: string): void {
  revalidateTag(BLOG_CACHE_TAG, EXPIRE_NOW);
  revalidateTag(postTag(slug), EXPIRE_NOW);
  revalidatePath(`/post/${slug}/`);
  revalidatePath("/blog");
  revalidatePath("/sitemap.xml");
  revalidatePath("/llms.txt");
}

async function verifyLive(url: string): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { cache: "no-store", redirect: "follow" });
      if (res.ok) return true;
    } catch {
      // transient; retry
    }
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  return false;
}

/**
 * Why a calendar entry may not change channel, or null. A live row keeps its
 * channel (moving a live blog to a social channel would unlist it by a side
 * door), and so does a row that belongs to a campaign: a campaign's blog moved
 * to LinkedIn, marked posted and moved back would be a live blog that no
 * publish and no approval ever saw (Y.16). A failed read refuses.
 */
export async function channelChangeRefusal(id: string, channel: string): Promise<string | null> {
  const { data, error } = await companyOs.from("marketing_content").select("channel, status, campaign_id").eq("id", id).maybeSingle();
  if (error) return `The entry could not be read: ${error.message}`;
  if (!data || data.channel === channel) return null;
  if (data.status === "published") return "A published entry keeps its channel.";
  if (data.campaign_id) return "An entry that belongs to a campaign keeps its channel; add a new entry for another channel.";
  return null;
}

export async function publishBlogAsset(id: string, actor: string): Promise<PublishResult> {
  const { data, error } = await companyOs.from("marketing_content").select(SELECT).eq("id", id).maybeSingle();
  if (error) return { ok: false, errors: [error.message] };
  if (!data) return { ok: false, errors: ["Asset not found."] };
  const row = data as BlogRow;

  // The Publish approval gate (Y.16), here because every publish comes through
  // here: the hub, the calendar, the Publish Editor, the revenue board and the
  // scheduled-publish cron. A writer campaign with an approval on record goes
  // live only in the version approved; the version is read off the row as
  // stored, before the date is defaulted below. A post already live also counts
  // as its version without the date, which its first publish gave it, so a
  // Re-publish of an unedited post passes. The gate binds the brands that
  // publish on approval: an auto-publish brand's switch is its approval
  // (decision Y.53), so its posts skip it whatever their history. A brand whose
  // profile cannot be read is gated, the stricter answer. The brand that
  // decides is the campaign's, which the writer and the hub use; a post whose
  // own brand was moved off its campaign's (onto an auto-publish brand, say) is
  // refused, so a client campaign's post never reaches another brand's site.
  let gatedBrand = row.brand_id;
  if (row.campaign_id) {
    const owner = await campaignBrand(row.campaign_id, "nothing was published");
    if (!owner.ok) return { ok: false, errors: [owner.error] };
    if (owner.brandId && row.brand_id !== owner.brandId) {
      return { ok: false, errors: ["This post's brand is not its campaign's brand, so it is not published. Set the post back to the campaign's brand."] };
    }
    gatedBrand = owner.brandId ?? row.brand_id;
  }
  if (row.campaign_id && !(await autoPublishes(gatedBrand))) {
    const versions = postVersions({ title: row.title, copyMd: row.copy_md, seoMd: row.seo_md, imageUrl: row.image_url, publishDate: row.publish_date, status: row.status });
    const gate = await approvedToPublish(row.campaign_id, versions);
    if (!gate.ok) return { ok: false, errors: [gate.reason] };
  }

  // Resolve the destination site from the brand. A brand with no live blog
  // (AIO until its site ships one, or any unconfigured brand) is refused here
  // rather than sending content to the wrong domain or a dead URL.
  const brand = one(row.brands);
  const site = siteForBrandSlug(brand?.slug ?? null);
  const brandBlock = blogPublishBlocker(brand?.slug ?? null, brand?.name ?? "This brand");
  if (brandBlock || !site) {
    return { ok: false, errors: [brandBlock ?? "This brand has no website configured for blog publishing."] };
  }

  const parsed = parseSeoMd(row.seo_md);
  const slugTaken = new Set<string>();
  if (parsed.slug && (await isSlugTaken(parsed.slug, id))) slugTaken.add(parsed.slug);

  const errors = validateBlogForPublish(row, parsed, (s) => slugTaken.has(s));
  if (errors.length) return { ok: false, errors };

  const slug = parsed.slug as string;
  const words = bodyWordCount(row.copy_md ?? "");
  const readTime = `${Math.max(1, Math.round(words / 200))} min read`;
  const { category, categorySlug } = resolveCategory(parsed.category);
  const publishDate = row.publish_date ?? saigonToday();

  const { error: upErr } = await companyOs.from("marketing_content").update({
      status: "published",
      slug,
      title_tag: parsed.titleTag,
      meta_description: parsed.metaDescription,
      excerpt: parsed.excerpt ?? parsed.metaDescription,
      primary_keyword: parsed.primaryKeyword,
      category,
      category_slug: categorySlug,
      read_time: readTime,
      publish_date: publishDate,
      published_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (upErr) return { ok: false, errors: [upErr.message] };

  const liveUrl = `${site.domain}/post/${slug}/`;

  // Only this site's own cache can be revalidated from here. A different brand's
  // site (a future AIO blog) revalidates itself; we still verify its live URL.
  if (site.self) revalidateBlog(slug);

  const verified = await verifyLive(liveUrl);
  if (verified) {
    // The post is already live; failing to stamp the URL is worth a log, not a
    // failed publish.
    const { error: urlErr } = await companyOs.from("marketing_content").update({ posted_url: liveUrl }).eq("id", id);
    if (urlErr) console.error("[company-os/campaigns] marketing_content", urlErr);
  }

  await recordAudit({
    table: "marketing_content",
    recordId: id,
    operation: "update",
    actor,
    context: { published: true, slug, brand: brand?.slug, verified },
  });
  return verified
    ? { ok: true, slug, liveUrl, verified: true }
    : { ok: true, slug, liveUrl, verified: false, warning: "Published, but the live URL did not return 200 yet. It may take a minute to propagate; re-verify shortly." };
}
