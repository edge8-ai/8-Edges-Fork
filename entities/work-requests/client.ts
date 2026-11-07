// The work-requests entity's browser-safe door: everything a "use client" file
// may import. scripts/entity-client-doors.test.mjs proves nothing server-only is
// reachable from here, so it holds only this entity's navigation rows.
// This entity's rows in the Admin shell's navigation (ADR 0002).
export { adminNav } from "./ui/nav";
// A contractor's own work and pay, in the team hub's navigation.
export { teamNav } from "./ui/team-nav";
