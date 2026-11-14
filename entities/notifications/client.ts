// The notifications entity's browser-safe door. Only what a "use client" file
// may import: the team hub's navigation row. ./index.ts pulls the service-role
// client and must never reach the browser.
export { teamNav } from "./ui/team-nav";
