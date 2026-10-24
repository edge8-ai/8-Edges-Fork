// Quests' access declaration (ADR 0013; spec 2026-10-20, "Access"). Read as
// text by scripts/gen-deployment.mjs; nothing imports this file.
//
// Two atoms and no new role. quests.mine is everything a party member does on the
// Quests page. quests.report is the manager report of who missed one Bounty
// (ADR 0020): a manager reaches their direct reports, an admin everyone. Its
// page, on the admin surface, arrives in a later ticket; it is declared now so
// the access rows can be seeded before any guard asks for it.
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
  },
  actions: {
    "lib/quest-actions": "quests.mine",
    "lib/lore-actions": "quests.mine",
    "lib/campfire-actions": "quests.mine",
    "lib/beacon-actions": "quests.mine",
  },
  implies: {},
};
