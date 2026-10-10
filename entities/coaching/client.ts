// The coaching entity's browser-safe door (design §3, "two doors per entity").
// ./index.ts pulls the service-role Supabase client and the coaching guards, so
// a "use client" component may never import it; only browser-safe code is
// re-exported here and scripts/entity-client-doors.test.mjs proves it.
//
// What is here is what a client component outside the entity renders: the goal
// vocabulary the admin goals editor shows and the ladder picker beside it.
export {
  GOAL_STATUS_LABELS,
  type AdminMemberGoals,
  type CoachingGoal,
  type EdgesOptions,
  type GoalStatus,
} from "./lib/types";
export { ladderValue, parseLadder } from "./lib/ladder";
export { LadderSelect } from "./ui/LadderSelect";
// The shared-bet row (L.5). A "use client" component needs this TYPE, and its
// own module opens with the service-role Supabase client — type-only imports
// erase at build, so nothing breaks today, but a later edit that drops the
// `type` keyword would pull that client into the browser bundle. Going through
// this door makes that impossible rather than merely unlikely.
export type { SharedGoal } from "./lib/data/shared-key-result";
// The member page's whole model (A.11). Same reasoning as SharedGoal above:
// MyCoachingView needs the TYPE and its module opens with the service-role
// client, so the type travels through this door where it cannot become a
// value import by accident.
export type { MyCoachingPageModel } from "./lib/data/my-coaching-page";
// This entity's rows in the team hub's navigation (ADR 0002).
export { teamNav } from "./ui/team-nav";
