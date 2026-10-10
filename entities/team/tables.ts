// The Supabase tables the team entity owns (design §4, ME-02).
//
// Ownership means this entity is the only one that writes them directly;
// scripts/check-table-ownership.mjs ratchets everyone else's reads and fails an
// unlisted cross-entity write. The names here and the `tables` array for team
// in entities.manifest.json are the same list — entities/team/entity.test.ts
// asserts that, so the gate and the entity can never drift apart.
// FS-03 moved the leave tables (time_off, leave_policies, leave_adjustments) to
// the time-off entity along with the code that writes them, and T.1 moved
// `holidays` after it: team read it nowhere, and since team requires time-off,
// time-off could never have imported team's door to reach the calendar its own
// day arithmetic depends on.
// Kudos (TH.1.8): the peer thank-you board on the team Home.
export const TEAM_TABLES = [
  "kudos",
  "performance_reviews",
] as const;
