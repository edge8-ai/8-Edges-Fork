// Where each brand's blog actually lives. The marketing DB (company_os.
// marketing_calendar) is one shared source across brands, but each brand renders
// on its OWN website, so publishing must resolve a per-brand destination — never
// assume edge8.ai. This map is the single source of truth for that routing.
//
// - self: this repo (edge8-web) renders this brand's posts. Only the self brand's
//   posts may appear on this site; everything else is filtered out of the reader.
// - blogEnabled: the brand's site has a live blog that reads these posts. When
//   false (a brand whose site ships no blog), publishing
//   is refused with a clear message rather than sending content to a dead URL.

import { SELF_BRAND_SLUG } from "@/kernel/config/brand";

export type BrandSite = {
  slug: string;
  domain: string; // origin, no trailing slash
  self: boolean;
  blogEnabled: boolean;
};

const SITES: Record<string, BrandSite> = {
  edge8: { slug: "edge8", domain: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}`, self: true, blogEnabled: true },
  // ai-officer.com is a separate repo (aio-website) that reads these posts from
  // the shared DB (brand-scoped to ai-officer) and renders them on its own site.
  "ai-officer": { slug: "ai-officer", domain: "https://ai-officer.com", self: false, blogEnabled: true },
};

export function siteForBrandSlug(slug: string | null): BrandSite | null {
  if (!slug) return null;
  return SITES[slug] ?? null;
}

// Human-readable reason a brand cannot be published from here, or null if it can.
export function blogPublishBlocker(slug: string | null, brandName: string): string | null {
  const site = siteForBrandSlug(slug);
  if (!site) {
    return `${brandName} has no website configured for blog publishing.`;
  }
  if (!site.blogEnabled) {
    return `${brandName} publishes to ${site.domain}, but that site has no blog yet. Blog publishing for this brand is not available.`;
  }
  return null;
}
