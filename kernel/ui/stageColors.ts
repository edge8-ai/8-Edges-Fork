/**
 * Canonical pipeline / stage accent colors, shared by the deals board, inquiries
 * board, revenue dashboard, and job-req pipeline.
 *
 * Kept in TS (not CSS custom properties) because these accents are consumed as
 * inline-style color strings by the kanban/board components. Values mirror the
 * data-layer palette in app/globals.css — see
 * docs/product/edge8-design-system-data.md.
 *
 * Previously these arrays were copy-pasted across four files with drifting values
 * (e.g. `var(--admin-accent)` vs the accent token, `var(--admin-chart-4)` vs a raw hex). This module
 * is the single source; the per-page duplicates now import from here.
 */

/** First / "new" stage — brand blue. CSS var so it tracks the accent token. */
export const STAGE_LEAD = "var(--admin-accent)";
/** Terminal outcome — won (data chart-3, green). */
export const STAGE_WON = "var(--admin-ok-strong)";
/** Terminal outcome — lost (neutral gray). */
export const STAGE_LOST = "var(--admin-muted)";
/** Default / unclassified in-progress stage (slate). */
export const STAGE_NEUTRAL = "var(--admin-muted)";
/** Rotating in-progress accent — discovery (data chart-4, pink). */
export const STAGE_DISCOVERY = "var(--admin-chart-4)";
/** Rotating in-progress accent — proposal (amber). */
export const STAGE_PROPOSAL = "var(--admin-warn-strong)";
/** Late in-progress accent — contract sent, awaiting payment (teal, near-won). */
export const STAGE_CONTRACT = "var(--admin-chart-2)";
/** "New from SDR" handoff column (violet). */
export const STAGE_HANDOFF = "var(--admin-chart-3)";

/**
 * Full rotating cycle including terminal colors, for position-agnostic pipeline
 * views that index by column order (job-req pipeline).
 */
export const STAGE_ACCENT_CYCLE = [
  STAGE_LEAD,
  STAGE_NEUTRAL,
  STAGE_DISCOVERY,
  STAGE_PROPOSAL,
  STAGE_WON,
  STAGE_LOST,
] as const;
