import { brandAudiencePage, brandSlugOf } from "@/entities/contacts";

// Guest-brand scoping for resolveAudience (lib/broadcasts.ts). brand_contacts is
// contacts' table; its door hands back the builder so the paging stays here.

// Paged explicitly: PostgREST caps an unbounded select and truncates silently,
// which would quietly shrink a guest brand's audience.
const PAGE = 500;

// Edge8 owns this CRM, so an Edge8-branded (or brand-less) broadcast draws from
// the whole house list. Any other brand is a guest and is scoped strictly to
// its brand_contacts membership, so a guest send can never reach the house list.
const HOME_BRAND_SLUG = "edge8";

// Returns the person_ids a guest brand is allowed to mail, or null when the
// brand is the home brand (no scoping). An empty array means the guest brand
// has no audience yet — the caller must treat that as "nobody", never a leak.
export async function brandMemberIds(brandId: string): Promise<{ ids: string[] | null; error?: string }> {
  const { data: brand, error: brandError } = await brandSlugOf(brandId);
  if (brandError) return { ids: null, error: brandError.message };
  if (!brand || brand.slug === HOME_BRAND_SLUG) return { ids: null };

  const ids: string[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await brandAudiencePage(brandId, offset, offset + PAGE - 1);
    if (error) return { ids: null, error: error.message };
    const page = data ?? [];
    for (const r of page) ids.push(r.person_id);
    if (page.length < PAGE) break;
  }
  return { ids };
}

