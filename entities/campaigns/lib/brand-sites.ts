// Where each brand's blog actually lives. The marketing DB (company_os.
// marketing_calendar) is one shared source across brands, but each brand renders
// on its OWN website, so publishing must resolve a per-brand destination — never
// assume edge8.ai. This map is the single source of truth for that routing.
//
// - self: this repo (edge8-web) renders this brand's posts. Only the self brand's
//   posts may appear on this site; everything else is filtered out of the reader.
// - blogEnabled: publishing to this brand is allowed. When false (a brand whose
//   site ships no blog), publishing is refused with a clear message rather than
//   sending content to a dead URL. When true, a post still counts as live only
//   once its URL answers 200 (blog-live.ts, R3.352), so a site that does not
//   read these posts yet shows each post as not live rather than live.

import { SELF_BRAND_SLUG } from "@/kernel/config/brand";

export type BrandSite = {
  slug: string;
  domain: string; // origin, no trailing slash
  self: boolean;
  blogEnabled: boolean;
};

const SITES: Record<string, BrandSite> = {
  edge8: { slug: "edge8", domain: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}`, self: true, blogEnabled: true },
  // ai-officer.com is a separate site that today serves static files, so a post
  // published here is not on it yet: its URL answers 404 and the blog-live-check
  // routine puts the post back (R3.352). A reader of the shared database,
  // brand-scoped to ai-officer, is being built in the site's own repository.
  // Once it ships, a post published from then on goes live; a post already put
  // back needs publishing again.
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
