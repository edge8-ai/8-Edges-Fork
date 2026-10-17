// The Supabase tables the site entity owns (multi-entity design §4, and the
// `tables` array for `site` in entities.manifest.json, which is what
// scripts/check-table-ownership.mjs actually reads). Only the owner writes a
// table directly: the gallery is written from the admin and team screens today,
// and those writes are in scripts/table-ownership-allowlist.json until the
// gallery moves behind this entity's index.
export const SITE_TABLES = ["gallery_photo_people", "gallery_photos"] as const;
