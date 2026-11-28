// Values the deal actions share, beside actions.ts rather than in it because
// that file is "use server", where every export must be an async server action.

// The reasons a closer may reject a handoff for; here rather than in actions.ts
// because "use server" allows only async exports. The lost reasons live with
// the close itself, in crm/lib/deal-close.
export const HANDOFF_REJECT_REASONS = new Set([
  "not_qualified",
  "bad_fit",
  "duplicate",
  "bad_timing",
  "other",
]);
