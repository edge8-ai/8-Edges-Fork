// The replenishment entity's browser-safe door: the Admin navigation rows
// (RP.3), the Team hub's row for the scanner (RP.5), and the pure schema,
// engine and preview the profile editor runs in the browser on every draft
// (RP.6). ./index.ts reaches SheetJS and the service-role client, and must
// never reach the browser; the export is read on the server and only its
// table of cells crosses. The operator card is imported by its own route,
// inside the entity, so it needs no door.
export { adminNav } from "./ui/nav";
export { teamNav } from "./ui/team-nav";
export { parseProfile } from "./lib/profile";
export type { Profile, ProfileIssue } from "./lib/profile";
export { jobsChange, previewRun, tryLocation } from "./lib/preview";
export type { Preview } from "./lib/preview";
