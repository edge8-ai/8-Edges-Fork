// The Supabase tables the replenishment entity owns (spec 2026-10-28, "Data"):
// a warehouse's profiles, the runs built from its stock exports, and each
// run's jobs. Written by RP.2's migration; read and written from RP.3 on.
export const REPLENISHMENT_TABLES: readonly string[] = ["replenishment_jobs", "replenishment_profiles", "replenishment_runs"];
