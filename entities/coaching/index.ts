// The coaching module's door (ME-11; AR-27 lands inside this module). Sibling
// modules and the rest of the entity reach coaching only through this file —
// the generated ESLint zones enforce it for siblings — so the module can change
// its files without the rest of the team entity noticing.
export * from "./lib/ai";
export * from "./lib/cycle";

// Team Coaching Cycle data access (docs/plans/2026-07-25-team-coaching-cycle.md).
// The ONLY sanctioned path to the coaching_* tables. The coaching relationship
// is coach_id on coaching_profiles — deliberately NOT the org chart's
// manager_id and NOT actor.teamMemberScope, because dotted lines are
// first-class (My reports to Mai but is coached by Dave). That is why these
// tables are not in lib/team/data.ts's SCOPE_ALLOWLIST: their scope column is
// the coach, not the member.
//
// TWO TIERS, ENFORCED HERE:
//   coach tier  — every function prefixed coach* filters coach_id =
//                 actor.teamMemberId (from the JWT-derived actor, never client
//                 input) and re-derives ownership before any write.
//   member tier — every function prefixed my* filters team_member_id =
//                 actor.teamMemberId and selects ONLY member-visible fields:
//                 FAST goals, priorities, published OCEAN, commitments,
//                 check-ins, and shared recaps that have been PUBLISHED.
//                 Prep, transcripts, private summaries, private profile,
//                 trends and context never appear in a member-tier select.
// The client-safe vocabulary lives in ./types; re-exported so the server
// callers of this module keep one import.

// The data access is split by tier and concern under ./data/ (Q3, 2026-09-05);
// this index is the single import path callers keep. The client-safe
// vocabulary lives in ./types and the Saigon-date helpers in the kernel; both
// are re-exported so the server callers of this module keep one import. Row
// types that only this module's own components need stay on their data file.
export * from "./lib/types";
export { saigonToday } from "@/kernel/config/dates";
export { getAdminRosterGoals, adminAddGoal, adminUpdateGoal, adminDeleteGoal } from "./lib/data/admin-goals";
export { getEdgesLadderOptions } from "./lib/data/goals";
export { getMyCoaching } from "./lib/data/member";
// The member's own held 1-1s and quick notes, member tier, for the team
// assistant's my_coaching tool.
export { getMyHistory } from "./lib/data/member-history";
export { getMyNotes } from "./lib/data/member-notes";
export { getMyCoachingPage } from "./lib/data/my-coaching-page";
export { getTeamMemberActiveGoals } from "./lib/data/member-goals";
export { type MyGoalInput, getMyGoals, ladderLabelFor, myAddGoal, myUpdateGoal, myDeleteGoal } from "./lib/data/my-goals";
export { getPracticeFacts } from "./lib/data/practice-facts";
export { getCoachProfileDetail } from "./lib/data/profile";
export { getCoachRoster, canManageRoster, getRosterCandidates } from "./lib/data/roster";
export { getDottedLine, getPastTeam } from "./lib/data/team-tabs";
export { getLarkConnection } from "./lib/lark-connection";
export { getCoachingProfileIdForMember } from "./lib/data/shared";
export * from "./lib/goal-notify";
export * from "./lib/ladder";
// The member's own agenda window, and the one line the team hub shows about an
// upcoming 1-1 (L.7). Pure; team renders it, which is a legal door import
// because team already requires coaching.
export * from "./lib/member-agenda";
export * from "./lib/markdown";
export * from "./lib/sessions";
export * from "./lib/transcript";
// The client components and the server actions are NOT re-exported here. The
// components import ./actions and ./my-actions, and those import the concrete
// ./data files, so any re-export of either would close a cycle
// (index -> ui -> actions -> index). Every caller already imports them by their
// concrete path (entities/team/modules/coaching/ui/*), which is also what keeps
// the server-only data layer out of the client bundle. The coach- and member-
// tier write helpers those actions call are likewise no longer re-exported:
// their only caller now lives inside this module, next to its data.
// The goals editor the team directory page renders for a member (RS-12).
export { TeamGoalsEditor } from "./ui/TeamGoalsEditor";
// What the composition root registers when this entity is installed: the board
// card that suggests a commitment was kept, and the approved leave that moves a
// booked 1-1 off somebody's holiday.
export { subscriptions } from "./lib/subscriptions";
// Cross-entity reads of this entity's tables (design §4).
export * from "./lib/reads";

// What this entity tells the access resolver (ADR 0013): the Coach role and a
// coach's reach over their coachees. The composition root registers it (app/access.ts).
export { accessContributions } from "./lib/access-contributions";
