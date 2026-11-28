import { revalidateTag, revalidatePath } from "next/cache";
import { companyOs } from "@/kernel/data/supabase";
import { recordAudit } from "@/kernel/audit/audit";
import { categories } from "./postData";
import { parseSeoMd, isValidSlug, type ParsedSeo } from "@/entities/campaigns/lib/seo";
import { BLOG_CACHE_TAG, postTag } from "./blog";
import { siteForBrandSlug, blogPublishBlocker } from "@/entities/campaigns/lib/brand-sites";
import { saigonToday } from "@/kernel/config/dates";
import { approvedToPublish, postVersions } from "./blog-version";
import { autoPublishes, campaignBrand } from "./blog-live-edit";
import { liveCheckOf, notLiveReason, prePublishOf, type LiveCheck, type PrePublish } from "./blog-live";

// The deterministic publish core, runtime-agnostic so both the admin server
// action and the Publish Editor agent's publish tool call the same logic. It
// validates, normalizes the loose seo_md into columns, flips status, revalidates
// every surface, and checks the live URL. Brand-aware: the destination domain
// comes from the asset's brand, never a hardcoded site. Never throws for a
// validation problem — it returns the full failure list for the caller to act on.
//
// A publish is live only once its URL answers 200 (R3.352, ./blog-live). The
// flip has to come first, since the sites render only published rows, so the
// row's state from before the flip is kept in `pre_publish`; a URL that has
// not answered within the check here leaves the post "not live yet", and the
// blog-live-check routine either stamps it live or puts that state back.

const MIN_WORDS = 600;

/**
 * `live: true`: the URL answered 200, or (`checked: false`) no site origin is
 * configured, so there is nothing to check against (a fork or a local run).
 * `live: false`: the row is published but its URL has not answered; `reason`
 * says what it answered, and `liveCheck` is what the calendar now shows for it
 * (null when the post was already live at this URL and stays so).
 */
export type PublishResult =
  | { ok: true; slug: string; liveUrl: string; live: true; checked: boolean }
  | { ok: true; slug: string; liveUrl: string; live: false; reason: string; liveCheck: LiveCheck | null }
  | { ok: false; errors: string[] };

type BlogRow = {
  id: string;
  channel: string;
  title: string;
  status: string;
  copy_md: string | null;
  body_html: string | null;
  seo_md: string | null;
  image_url: string | null;
  publish_date: string | null;
  published_at: string | null;
  posted_url: string | null;
  pre_publish: unknown;
  brand_id: string | null;
  campaign_id: string | null;
  brands: { name: string; slug: string } | { name: string; slug: string }[] | null;
};

const SELECT =
  "id, channel, title, status, copy_md, body_html, seo_md, image_url, publish_date, published_at, posted_url, pre_publish, brand_id, campaign_id, brands(name, slug)";

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

// Each request is cut off after this long, so a site that hangs cannot hold
// the publish (a person's click, a cron, a writer step) open: three attempts
// and the pauses between them stay under twenty seconds.
const FETCH_TIMEOUT_MS = 5_000;

type LiveAnswer = { ok: true } | { ok: false; answer: string };

async function askOnce(url: string): Promise<LiveAnswer> {
  try {
    const res = await fetch(url, { cache: "no-store", redirect: "follow", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    return res.ok ? { ok: true } : { ok: false, answer: `answered ${res.status}` };
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    return { ok: false, answer: timedOut ? `did not answer within ${FETCH_TIMEOUT_MS / 1000} seconds` : "could not be reached" };
  }
}

/** Ask the live URL up to `attempts` times; the last answer when none was a 200. */
export async function checkLive(url: string, attempts = 3): Promise<LiveAnswer> {
  let last: LiveAnswer = { ok: false, answer: "was not checked" };
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1500 * attempt));
    last = await askOnce(url);
    if (last.ok) return last;
  }
  return last;
}

/** Whether a live URL can be asked at all: a bare path means no site origin is configured. */
export function checkableUrl(url: string): boolean {
  return /^https?:\/\//.test(url);
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
    const versions = postVersions({ title: row.title, copyMd: row.copy_md, bodyHtml: row.body_html, seoMd: row.seo_md, imageUrl: row.image_url, publishDate: row.publish_date, status: row.status });
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

  const liveUrl = `${site.domain}/post/${slug}/`;
  const checkable = checkableUrl(liveUrl);
  // A post already live at this URL stays live whatever this check says: a
  // Re-publish never takes a live post down. Otherwise the row's state from
  // before this publish is kept so the routine can put it back. A retry of a
  // publish still waiting keeps the snapshot it took, never the half-published
  // row; a published row with no snapshot (published before R3.352) has nothing
  // to go back to, so it is only ever marked not live.
  const alreadyLive = row.status === "published" && row.posted_url === liveUrl;
  const before: PrePublish | null =
    !checkable || alreadyLive
      ? null
      : row.status === "published"
        ? prePublishOf(row.pre_publish)
        : prePublishOf({ status: row.status, publish_date: row.publish_date, published_at: row.published_at });

  const publishedAt = new Date().toISOString();
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
      published_at: publishedAt,
      posted_url: alreadyLive ? liveUrl : null,
      pre_publish: before,
      live_check_error: null,
    })
    .eq("id", id);
  if (upErr) return { ok: false, errors: [upErr.message] };

  // Only this site's own cache can be revalidated from here. A different brand's
  // site revalidates itself (or reads the database on every request); its live
  // URL is still checked.
  if (site.self) revalidateBlog(slug);

  const audit = (context: Record<string, unknown>) =>
    recordAudit({ table: "marketing_content", recordId: id, operation: "update", actor, context: { published: true, slug, brand: brand?.slug, ...context } });

  // No site origin (a fork or a local run without NEXT_PUBLIC_SITE_URL): there
  // is no URL to ask, so the publish stands as it always did.
  if (!checkable) {
    await audit({ live: true, checked: false });
    return { ok: true, slug, liveUrl, live: true, checked: false };
  }

  const answer = await checkLive(liveUrl);
  if (answer.ok) {
    // The post is live; failing to stamp the URL is worth a log, not a failed
    // publish, and the routine stamps it on its next run.
    const { error: urlErr } = await companyOs.from("marketing_content")
      .update({ posted_url: liveUrl, pre_publish: null, live_check_error: null })
      .eq("id", id);
    if (urlErr) console.error("[company-os/campaigns] marketing_content", urlErr);
    await audit({ live: true, checked: true });
    return { ok: true, slug, liveUrl, live: true, checked: true };
  }

  const reason = notLiveReason(liveUrl, answer.answer);
  if (!alreadyLive) {
    const { error: reasonErr } = await companyOs.from("marketing_content").update({ live_check_error: reason }).eq("id", id);
    if (reasonErr) console.error("[company-os/campaigns] marketing_content", reasonErr);
  }
  await audit({ live: false, reason });
  const liveCheck = liveCheckOf({
    channel: "blog",
    status: "published",
    posted_url: alreadyLive ? liveUrl : null,
    published_at: publishedAt,
    pre_publish: before,
    live_check_error: alreadyLive ? null : reason,
  });
  return { ok: true, slug, liveUrl, live: false, reason, liveCheck };
}
