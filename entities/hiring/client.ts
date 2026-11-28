// The hiring entity's browser-safe door. Its screens still live elsewhere and
// move here in a later slice, so this door exists to satisfy the shape every
// entity has and will fill as those pages arrive.
export {};
export { ApplicantStatusSelect } from "./ui/ApplicantStatusSelect";
// This entity's rows in the Admin shell's navigation (ADR 0002); the
// composition root hands them to the shell for the deployments that install it.
export { adminNav } from "./ui/nav";
// This entity's rows in the team hub's navigation (ADR 0002).
export { teamNav } from "./ui/team-nav";
