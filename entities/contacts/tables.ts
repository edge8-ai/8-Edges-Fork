// The Supabase tables the contacts entity owns (design §4; moved off company-os
// by RS-01 so Boards could sit below the entities that render boards).
//
// Ownership means contacts is the only entity that writes these directly;
// everyone else goes through this entity's index.ts. The gate that enforces it
// (scripts/check-table-ownership.mjs) reads the same list from the `tables`
// array on `contacts` in entities.manifest.json.
export const CONTACTS_TABLES = [
  "affiliates",
  "brand_contacts",
  "brand_profiles",
  "brands",
  "people_sensitive",
  "person_companies",
  "staff_assignments",
  "taggables",
  "tags",
] as const;
