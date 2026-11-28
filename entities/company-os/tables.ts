// The Supabase tables the company-os entity owns (design §4, ME-02).
//
// Ownership means this entity is the only one that writes them directly;
// scripts/check-table-ownership.mjs ratchets everyone else's reads and fails an
// unlisted cross-entity write. The names here and the `tables` array for
// company-os in entities.manifest.json are the same list —
// entities/company-os/entity.test.ts asserts that, so the gate and the entity
// can never drift apart.
export const COMPANY_OS_TABLES = [
  "integration_sources",
  "people_with_deals",
] as const;
