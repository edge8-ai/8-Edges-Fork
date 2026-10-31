// The brands Edge8 markets under, their writing profiles and their audiences,
// as campaigns asks about and changes them (A.64, ADR 0018). A brand is
// active while `active` is true; the marketing screens list active brands
// only, while the email schedule names any brand a send was ever filed under.
import { companyOs, companyOsUntyped } from "@/kernel/data/supabase";
import type { TablesInsert } from "@/kernel/data/supabase/database.types";
import { upsertBrandProfiles } from "./writes";

/** Active brands' id, name and slug, by name. */
export async function activeBrands() {
  return companyOs.from("brands").select("id, name, slug").eq("active", true).order("name", { ascending: true });
}

/** Every brand's id and name, inactive ones included, in no set order. */
export async function brandNames() {
  return companyOs.from("brands").select("id, name");
}

/** One brand's slug, by id, or null. */
export async function brandSlugOf(brandId: string) {
  return companyOs.from("brands").select("slug").eq("id", brandId).maybeSingle();
}

/** One brand's id, by slug, or null. */
export async function brandIdBySlug(slug: string) {
  return companyOs.from("brands").select("id").eq("slug", slug).maybeSingle();
}

type BrandProfileColumns = {
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

/** A brand with its writing profile, which is absent until someone edits it. */
export type BrandProfileRow = {
  id: string;
  slug: string;
  name: string;
  brand_profiles: BrandProfileColumns | BrandProfileColumns[] | null;
};

const BRAND_PROFILE =
  "id, slug, name, brand_profiles(positioning, audience, offer, primary_cta, author_md, voice_md, rules_md, channels_md, process_md, blog_styles_md, editing_lens_md, seo_lens_md, image_style_md, preferred_blog_types, preferred_image_styles, preferred_social_styles, auto_publish)" as const;

// The profile embed is typed by hand once, here, because brand_profiles is a
// one-to-one PostgREST may answer as an object or a one-row array; the row
// type above names both, and every reader in campaigns handles both.
type Answer<T> = { data: T; error: { message: string } | null };

/** Every active brand with its profile, by name. */
export async function activeBrandProfiles(): Promise<Answer<BrandProfileRow[] | null>> {
  const { data, error } = await companyOs.from("brands").select(BRAND_PROFILE).eq("active", true).order("name", { ascending: true });
  return { data: data as unknown as BrandProfileRow[] | null, error };
}

/** One brand with its profile, by id, or null. */
export async function brandProfileOf(brandId: string): Promise<Answer<BrandProfileRow | null>> {
  const { data, error } = await companyOs.from("brands").select(BRAND_PROFILE).eq("id", brandId).maybeSingle();
  return { data: data as unknown as BrandProfileRow | null, error };
}

/** One brand with its profile, by slug, or null. */
export async function brandProfileBySlug(slug: string): Promise<Answer<BrandProfileRow | null>> {
  const { data, error } = await companyOs.from("brands").select(BRAND_PROFILE).eq("slug", slug).maybeSingle();
  return { data: data as unknown as BrandProfileRow | null, error };
}

/** Write these fields of a brand's profile, creating it when there is none. */
export async function writeBrandProfile(row: TablesInsert<{ schema: "company_os" }, "brand_profiles">) {
  return upsertBrandProfiles(row, { onConflict: "brand_id" });
}

/**
 * One page (rows from..to, by person) of the people in a guest brand's
 * audience. `brand_contacts` is one of the few tables the generated types do
 * not carry (see the manifest header), so the row is typed here.
 */
export async function brandAudiencePage(brandId: string, from: number, to: number): Promise<Answer<{ person_id: string }[] | null>> {
  const { data, error } = await companyOsUntyped
    .from("brand_contacts")
    .select("person_id")
    .eq("brand_id", brandId)
    .order("person_id", { ascending: true })
    .range(from, to);
  return { data: data as { person_id: string }[] | null, error };
}
