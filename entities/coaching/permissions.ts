// Coaching on the Team view (ADR 0013). Read as text by scripts/gen-deployment.mjs;
// nothing imports this file.
//
// Every team login reaches these pages today and each filters its own rows: a
// member sees their own coaching, a coach the people on their roster (the roster
// page also checks canManageRoster). Team members and contractors therefore hold
// each atom at own, and the Coach role, which coaching implies for anyone with a
// coaching_profiles row, holds the roster at team; the reach is what AC.7's swap reads.
import type { EntityPermissions } from "@/kernel/identity/permission-declaration";

/** @generator */
export const permissions: EntityPermissions = {
  permissions: {
    "coaching.mine": "See your own coaching: your coach, your goals and your quarterly reviews",
    "coaching.roster": "Coach your people: the roster and each person's coaching",
    "coaching.sessions": "Join the AIO group coaching sessions",
  },
  holders: {
    "coaching.mine": "team-member:own, contractor:own",
    // The roster is for whoever may build one, as /team/coaching has always
    // admitted: a coach, or a manager adding their first person (AC.8).
    "coaching.roster": "coach:team, manager:team",
    // Recordings of how the company teaches itself: with the Company module for a contractor (AC.19).
    // In the Contractor baseline with the rest of the Company module (AE.3).
    "coaching.sessions": "team-member, contractor, company",
  },
  routes: {
    "routes/team/(dashboard)/my-coaching/page": "coaching.mine",
    "routes/team/(dashboard)/my-coaching/review/[quarter]/page": "coaching.mine",
    "routes/team/(dashboard)/goals/page": "coaching.mine",
    "routes/team/(dashboard)/coaching/page": "coaching.roster",
    "routes/team/(dashboard)/coaching/[profileId]/page": "coaching.roster",
    "routes/team/(dashboard)/coaching-sessions/page": "coaching.sessions",
    "routes/team/(dashboard)/coaching-sessions/[id]/page": "coaching.sessions",
  },
  actions: {
    "lib/actions": "surface.team",
    "lib/commitment-actions": "surface.team",
    "lib/goal-actions": "surface.team",
    "lib/meeting-actions": "surface.team",
    "lib/my-actions": "coaching.mine",
    "lib/premeeting-actions": "coaching.mine",
    "lib/row-bar-actions": "surface.team",
    "lib/schedule-actions": "surface.team",
    "routes/team/(dashboard)/goals/actions": "coaching.mine",
  },
  implies: {
    "coach": "coaches at least one person (a coaching_profiles row names them as coach)",
  },
};
