// The hiring entity's server door. Candidates, applications and the interview loop.
//
// Its screens still live where they were and move here in a later slice; what
// moved first is ownership of the tables and the writers that touch them,
// because an entity that owns its data is the unit a deployment installs.
// The questions and commands other entities may put to hiring's tables (A.69,
// ADR 0018). The raw builders this door used to re-export are gone: nothing
// outside hiring chooses its own columns or filters on these tables any more.
export * from "./lib/requisitions";
export * from "./lib/application-lookups";
export * from "./lib/interview-seats";
// The ATS module moved here whole (RS-07): it only ever read hiring tables.
export * from "./lib/application-status";
export * from "./lib/applications";
export * from "./lib/ats/loop";
export * from "./lib/ats/pipeline";
export * from "./lib/ats/scorecard";
export * from "./lib/candidate-sensitive";
export * from "./lib/interview-panel";
export * from "./lib/interview-panelist";
export * from "./lib/recruiting-options";
export * from "./lib/resume-extract";
export * from "./lib/resume-screen";
// The hiring chain (Z.9): a new application joins it at the screen.
export { screenNewApplication } from "./lib/chain/entry";
// Where another entity's status select proposes Hired and Rejected for a chain application.
export { proposeHrefsForIds } from "./lib/chain/view";
export * from "./lib/application-actions";
// The team hub's hiring reads (A.88.3, ADR 0025): the hiring manager's board,
// the interviewer's day and kit, and the role-family screen. They read only
// hiring's records, so they moved here from team's lib/, and team's hiring
// pages put these questions to this door from their route bodies.
export * from "./lib/team-hiring";
export * from "./lib/interview-kit";
export * from "./lib/family-screen";
export * from "./lib/role-families";
// Named types the team hub's hiring screens take from this door.
export type { Result as PipelineResult } from "./lib/ats/pipeline";
export type Recommendations = typeof import("./lib/interview-panel").RECOMMENDATIONS;
// What this entity tells the access resolver (ADR 0013): who is a Hiring manager.
// The composition root registers it (app/access.ts).
export { accessContributions } from "./lib/access-contributions";
// What this entity answers the global search with (S.1); app/search.ts composes it.
export { searchContributions } from "./lib/search";
