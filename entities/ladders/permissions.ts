// Ladders' access declaration (ADR 0013; spec 2026-10-21, "Access"; ADR 0021).
// Read as text by scripts/gen-deployment.mjs; nothing imports this file.
//
// One atom and no new role. ladders.mine is everything a person does with
// their own ladders: reading their standing, wearing or hiding a tier, dressing
// their profile. There is no report atom and no manager or admin holder,
// because there is nothing for one to read: a ladder is read by the person
// alone, and teammates see only what the person chose to wear (through
// wornTiers, which needs no atom of its own because it answers only what was
// chosen for them). The profile page and the commands that read this atom
// arrive with LD.2, LD.4 and LD.6; it is declared now so the access rows can
// be seeded before any guard asks for it.
import type { EntityPermissions } from "@/kernel/identity/permission-declaration";

/** @generator */
export const permissions: EntityPermissions = {
  permissions: {
    "ladders.mine": "See your own ladders and badges, and choose what you wear",
  },
  holders: {
    "ladders.mine": "team-member:own, contractor:own",
  },
  routes: {},
  actions: {
    "lib/display-actions": "ladders.mine",
    "lib/shown-actions": "ladders.mine",
  },
  implies: {},
};
