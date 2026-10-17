import { companyOs } from "@/kernel/data/supabase";
import { selectBrands } from "@/entities/contacts";
import { SELF_BRAND_SLUG } from "@/kernel/config/brand";

// Brand writing profiles: the voice, channel rules, and full content-studio
// process the per-brand admin page edits and the AI writer reads. One per brand;
// only active brands are surfaced.

export type BrandProfile = {
  brandId: string;
  brandSlug: string;
  brandName: string;
  // Basics
  positioning: string | null;
  audience: string | null;
  offer: string | null;
  primaryCta: string | null;
  authorMd: string | null;
  // Voice
  voiceMd: string | null;
  rulesMd: string | null;
  // Channels
  channelsMd: string | null;
  // Writing Process
  processMd: string | null;
  blogStylesMd: string | null;
  editingLensMd: string | null;
  seoLensMd: string | null;
  imageStyleMd: string | null;
  // Styles: preferred picks from the shared catalogues (slugs)
  preferredBlogTypes: string[];
  preferredImageStyles: string[];
  preferredSocialStyles: string[];
  // Writer agent: publish and re-derive the channels with no human step once
  // every check passes. Off by default; the run parks at ready until it is on.
  autoPublish: boolean;
};

type DbProfile = {
  positioning: string | null;
  audience: string | null;
  offer: string | null;
  primary_cta: string | null;
  author_md: string | null;
  voice_md: string | null;
  rules_md: string | null;
  channels_md: string | null;
  process_md: string | null;
  blog_styles_md: string | null;
  editing_lens_md: string | null;
  seo_lens_md: string | null;
  image_style_md: string | null;
  preferred_blog_types: string[] | null;
  preferred_image_styles: string[] | null;
  preferred_social_styles: string[] | null;
  auto_publish: boolean | null;
};

type DbRow = {
  id: string;
  slug: string;
  name: string;
  brand_profiles: DbProfile | DbProfile[] | null;
};

function map(row: DbRow): BrandProfile {
  const p = Array.isArray(row.brand_profiles) ? row.brand_profiles[0] ?? null : row.brand_profiles;
  return {
    brandId: row.id,
    brandSlug: row.slug,
    brandName: row.name,
    positioning: p?.positioning ?? null,
    audience: p?.audience ?? null,
    offer: p?.offer ?? null,
    primaryCta: p?.primary_cta ?? null,
    authorMd: p?.author_md ?? null,
    voiceMd: p?.voice_md ?? null,
    rulesMd: p?.rules_md ?? null,
    channelsMd: p?.channels_md ?? null,
    processMd: p?.process_md ?? null,
    blogStylesMd: p?.blog_styles_md ?? null,
    editingLensMd: p?.editing_lens_md ?? null,
    seoLensMd: p?.seo_lens_md ?? null,
    imageStyleMd: p?.image_style_md ?? null,
    preferredBlogTypes: p?.preferred_blog_types ?? [],
    preferredImageStyles: p?.preferred_image_styles ?? [],
    preferredSocialStyles: p?.preferred_social_styles ?? [],
    autoPublish: mayAutoPublish(row.slug) && (p?.auto_publish ?? false),
  };
}

/**
 * Only our own brand may publish with no click (decision Y.53, Khoa, 25-26 Sep
 * 2026): a client brand's writer gets a Publish step, whatever its stored switch
 * says. Since Y.16 that step is a Publish approval its run parks on at ready
 * (lib/writer/publish-approval.ts); before the approvals inbox it was
 * draft-only. Read here, where every reader of the profile gets it, so neither
 * the writer's next step nor its channel step can publish a client's post
 * without an approval.
 */
export function mayAutoPublish(brandSlug: string): boolean {
  return brandSlug === SELF_BRAND_SLUG;
}

const SELECT =
  "id, slug, name, brand_profiles(positioning, audience, offer, primary_cta, author_md, voice_md, rules_md, channels_md, process_md, blog_styles_md, editing_lens_md, seo_lens_md, image_style_md, preferred_blog_types, preferred_image_styles, preferred_social_styles, auto_publish)";

// All active brands, each with its profile (which may be empty until edited).
export async function listBrandProfiles(): Promise<BrandProfile[]> {
  const { data, error: listErr } = await selectBrands(SELECT)
    .eq("active", true)
    .order("name", { ascending: true });
  if (listErr) console.error("[company-os/campaigns] brands", listErr);
  return ((data ?? []) as unknown as DbRow[]).map(map);
}

export async function getBrandProfile(brandId: string): Promise<BrandProfile | null> {
  const { data, error: byIdErr } = await selectBrands(SELECT).eq("id", brandId).maybeSingle();
  if (byIdErr) console.error("[company-os/campaigns] brands", byIdErr);
  if (!data) return null;
  return map(data as unknown as DbRow);
}

export async function getBrandProfileBySlug(slug: string): Promise<BrandProfile | null> {
  const { data, error: bySlugErr } = await selectBrands(SELECT).eq("slug", slug).maybeSingle();
  if (bySlugErr) console.error("[company-os/campaigns] brands", bySlugErr);
  if (!data) return null;
  return map(data as unknown as DbRow);
}
