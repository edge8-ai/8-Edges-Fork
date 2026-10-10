// The Supabase tables the retreats entity owns (design §4, ME-02).
//
// Ownership means this entity is the only one that writes them directly;
// scripts/check-table-ownership.mjs ratchets everyone else's reads and fails an
// unlisted cross-entity write. The list is deliberately a plain string tuple
// rather than keys of the generated Database type: `private_session_blocks`
// is read by code but absent from the types snapshot, so typing this against
// it would not compile. The trip_* tables left with the Vietnam Adventure
// forms (Y.37, decision Y.55).
//
// The names here and the `tables` array for retreats in entities.manifest.json
// are the same list — entities/retreats/entity.test.ts asserts that, so the
// gate and the entity can never drift apart.
export const RETREATS_TABLES = [
  "event_agenda_blocks",
  "event_agenda_staff",
  "event_pnl_lines",
  "event_registrations",
  "event_talks",
  "events",
  "private_session_blocks",
  "talks",
] as const;
