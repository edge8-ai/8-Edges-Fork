// The org entity's browser-safe door (design §3, "two doors per entity").
// ./index.ts pulls the service-role Supabase client, and a barrel is bundled
// whole, so a "use client" component may never import it. Only browser-safe
// code is re-exported here, and scripts/entity-client-doors.test.mjs walks this
// file's import graph to prove nothing server-only follows it into the browser.

// What the portal's public survey runner — a client component — reads of the
// survey engine: the field vocabulary and the rating bounds, split out of
// lib/surveys.ts for exactly this door.
export { ratingBounds, type FieldType, type SurveyFieldRow } from "./lib/surveys-schema";
// How the runner lays a client review's questions out on screens, and the
// member's answer it shows beside them (CR.2.2). Both modules are pure.
export { formSteps } from "./lib/form-steps";
export type { AnswerBeside } from "./lib/client-reviews/beside";
// What the skip-manager's pages draw (CR.3.2). The module reads nothing.
export type { SkipListRow, SkipQuestion } from "./lib/client-reviews/skip-rules";
// The Edges vocabulary the ideas issue board renders; constants and types only.
export * from "./lib/company/edges-shared";
// This entity's rows in the Admin shell's navigation (ADR 0002); the
// composition root hands them to the shell for the deployments that install it.
// Performance reviews moved here from team with the table they write (ADR 0025):
// the review vocabulary and the history table other entities' pages draw.
export * from "./lib/reviews-labels";
export { ReviewHistoryTable } from "./ui/ReviewHistoryTable";
export { adminNav } from "./ui/nav";
// This entity's rows in the team hub's navigation (ADR 0002).
export { teamNav } from "./ui/team-nav";
