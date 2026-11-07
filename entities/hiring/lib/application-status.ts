// Single source of truth for the applicant-status dropdown shown across the
// three talent surfaces (contact 360 header, applications shelf, rank shelf).
// These values mirror the applications_status_check DB constraint and the
// server-side APP_STATUSES validation in
// app/admin/(dashboard)/talent/applications/actions.ts — keep them in sync.
export const APPLICATION_STATUS_OPTIONS = [
  ["active", "Active"],
  ["on_hold", "On hold"],
  ["passive", "Passive"],
  ["withdrawn", "Withdrawn"],
  ["hired", "Hired"],
  ["rejected", "Rejected"],
  ["future_consideration", "Future consideration"],
] as const;

// In a live hiring chain (Z.9, decision 10) these two are proposed, not set:
// the three surfaces offer "Propose…", which opens the application's Decision card.
export const PROPOSE_LABEL = { hired: "Propose hire…", rejected: "Propose rejection…" } as const;

export function isDecisionStatus(value: string): value is "hired" | "rejected" {
  return value === "hired" || value === "rejected";
}
