import { activeBrandProfiles, brandProfileBySlug, brandProfileOf, type BrandProfileRow } from "@/entities/contacts";
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
  // Campaign images: logos Marketing uploaded (paths in the marketing bucket;
  // null means the brand kit's file in the app) and the channel templates as
  // stored (resolve with visual/brand-kit.ts resolveTemplates).
  logoOnDarkPath: string | null;
  logoOnLightPath: string | null;
  channelTemplates: unknown;
};

// The row is contacts' (A.64): a brand and its writing profile, which may be absent.
function map(row: BrandProfileRow): BrandProfile {
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
    logoOnDarkPath: p?.logo_on_dark_path ?? null,
    logoOnLightPath: p?.logo_on_light_path ?? null,
    channelTemplates: p?.channel_templates ?? {},
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

// All active brands, each with its profile (which may be empty until edited).
export async function listBrandProfiles(): Promise<BrandProfile[]> {
  const { data, error: listErr } = await activeBrandProfiles();
  if (listErr) console.error("[company-os/campaigns] brands", listErr);
  return (data ?? []).map(map);
}

// One brand's profile with a failed read kept as an error, so a caller that
// would otherwise tell a person nothing was decided (the post's image panel
// naming what Style DNA fixes) or make an image without the brand's Style DNA
// can show the failure instead.
export async function readBrandProfile(
  brandId: string,
): Promise<{ ok: true; profile: BrandProfile | null } | { ok: false; error: string }> {
  const { data, error } = await brandProfileOf(brandId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, profile: data ? map(data) : null };
}

// readBrandProfile for the callers where no profile is a fine answer: a failed
// read is logged and answered as a brand with no profile.
export async function getBrandProfile(brandId: string): Promise<BrandProfile | null> {
  const read = await readBrandProfile(brandId);
  if (read.ok) return read.profile;
  console.error("[company-os/campaigns] brands", read.error);
  return null;
}

export async function getBrandProfileBySlug(slug: string): Promise<BrandProfile | null> {
  const { data, error: bySlugErr } = await brandProfileBySlug(slug);
  if (bySlugErr) console.error("[company-os/campaigns] brands", bySlugErr);
  if (!data) return null;
  return map(data);
}
