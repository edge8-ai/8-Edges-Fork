// The site entity's public surface. Everything outside entities/site reaches the
// public marketing site through this file (multi-entity design §3, rules 1 and 2):
// the root layout mounts the site chrome, and two retreats pages reuse the site's
// reveal observer and video carousel.
//
// It is a server-only barrel (design §3, "two doors"): the content helpers at
// the bottom touch Supabase, the filesystem and Resend. A "use client" component
// imports ./client.ts instead, which carries only browser-safe code.
export { default as SiteFrame } from "./ui/SiteFrame";
export { default as RevealObserver } from "./ui/RevealObserver";
export { VideoCarousel } from "./ui/VideoCarousel";

// --- Content helpers other entities read (ME-13) ---------------------------
// Until ME-13 these resolved through one-line shims at their old lib/ paths;
// the shims are gone and the callers come here. Everything below touches
// Supabase, the filesystem or Resend, which is why this door is server-only
// and a "use client" component takes the gallery vocabulary from ./client.ts.

export { categories, type PostMeta } from "./lib/postData";
export * from "./lib/posts";
export { faqPageSchema, jsonLd } from "./lib/seo";
// The root layout's <head> copy. Through the door, not by deep path, so the
// fork overlay's replacement of public-routes.ts reaches app/layout.tsx too.
export { SITE_TITLE, SITE_DESCRIPTION, SITE_NAME, LOGO_SRC } from "./lib/public-routes";

export {
  addPhotoTag,
  deleteGalleryPhoto,
  listGalleryPhotos,
  recordGalleryPhoto,
  removePhotoTag,
  signedGalleryUpload,
  taggablePeople,
  updateGalleryPhoto,
  type Result,
} from "./lib/gallery";

// The Open Graph card renderer moved to ./upstream.ts: it is the upstream's own
// marketing copy and photography, so it does not sync. The twelve retreats
// opengraph-image routes that render with it are internal too, and import it
// from there.
export * from "./lib/pillars";
