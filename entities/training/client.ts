// The training entity's browser-safe door. Only what a "use client" file may
// import: the navigation contributions. ./index.ts reaches the
// service-role client and must never reach the browser.
export { adminNav } from "./ui/nav";
export { teamNav } from "./ui/team-nav";
export { portalNav } from "./ui/portal-nav";
