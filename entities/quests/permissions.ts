// Quests' access declaration (ADR 0013; spec 2026-10-20, "Access"). Read as
// text by scripts/gen-deployment.mjs; nothing imports this file.
//
// Two atoms and no new role. quests.mine is everything a party member does on the
// Quests page. quests.report is the manager report of who missed one Bounty
// (ADR 0020): a manager reaches their direct reports, an admin everyone. Its
// pages are the report at Talent › People › Quests on the admin surface (QS.3)
// and the same report under Quests in the Team sidebar (QS.3b), which is the
// one a manager who is not an admin can open.
import type { EntityPermissions } from "@/kernel/identity/permission-declaration";

/** @generator */
export const permissions: EntityPermissions = {
  permissions: {
    "quests.mine": "See the Quests page, accept, turn in or hand back a quest, post one, take a seat and write in the Lore",
    "quests.report": "See which of the people you manage missed one Bounty, one quest at a time",
  },
  holders: {
    "quests.mine": "team-member:own, contractor:own",
    "quests.report": "manager:team, admin",
  },
  routes: {
    "routes/team/(dashboard)/quests/page": "quests.mine",
    "routes/admin/(dashboard)/talent/quests/page": "quests.report",
    "routes/team/(dashboard)/quests/report/page": "quests.report",
  },
  actions: {
    "lib/quest-actions": "quests.mine",
    "lib/lore-actions": "quests.mine",
    "lib/campfire-actions": "quests.mine",
    "lib/beacon-actions": "quests.mine",
    "lib/evolve-actions": "quests.mine",
  },
  implies: {},
};
