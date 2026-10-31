// The replenishment entity's server door (spec 2026-10-28): a warehouse's
// rules held as a profile, and the runs one stock export makes against it.
// Only this file and client.ts may be imported from outside the entity, and
// it exports only what something outside reads (knip fails an export nobody
// uses): the pure engine, schema and reader stay behind it in lib/ until a
// caller outside needs one.
export { listProfiles, readProfile } from "./lib/profile-store";
export { earlierRuns, jobsOfRun, listRuns, readRun } from "./lib/run-store";
export type { RunSummary, StoredJob } from "./lib/run-store";
export {
  bandCounts,
  binWords,
  finishedBy,
  jobProgress,
  jobsFilterOf,
  jobsShown,
  operatorWords,
  runChecks,
  runDate,
  runDay,
  runTime,
  shortDay,
  statusWords,
  workedByWords,
} from "./lib/run-view";
export { offlineFileName, renderOfflineReport } from "./lib/offline-report";
