// Training's access declaration (ADR 0013). Read as text by
// scripts/gen-deployment.mjs; nothing imports this file.
//
// TR.2 declared the three atoms; their rows reached production through the
// data-only migration 20261011180100_training_access_rows, written to match,
// before any page was moved onto them, so nobody was refused on the way.
import type { EntityPermissions } from "@/kernel/identity/permission-declaration";

/** @generator */
export const permissions: EntityPermissions = {
  permissions: {
    "training.mine": "See your own training, log a training you took, and say whether you went",
    "training.organise": "Schedule trainings for people and change them until they start",
    "training.types": "Keep the list of training types in Settings",
  },
  holders: {
    "training.mine": "team-member:own, contractor:own",
    // A teacher or team coach organises through the Training organiser role
    // below; a manager organises for their own team.
    "training.organise": "manager:team, admin",
    "training.types": "admin",
  },
  roles: {
    "training-organiser": {
      "name": "Training organiser",
      "sentence": "Schedules trainings for people and runs training plans: a teacher, a team coach or a lead.",
      "atoms": "training.organise",
    },
  },
  routes: {
    "routes/team/(dashboard)/my-training/page": "training.mine",
    "routes/team/(dashboard)/my-training/sessions/[id]/page": "training.mine",
    "routes/team/(dashboard)/training/page": "training.organise",
    "routes/team/(dashboard)/training/plans/[planId]/page": "training.organise",
    "routes/team/(dashboard)/training/plans/[planId]/philosophy/page": "training.organise",
    "routes/team/(dashboard)/training/exercises/page": "training.organise",
    "routes/team/(dashboard)/training/sessions/[id]/page": "training.organise",
    "routes/team/(dashboard)/training/plans/[planId]/learners/[personId]/page": "training.organise",
    "routes/team/(dashboard)/training/plans/[planId]/weekly/[week]/page": "training.organise",
    "routes/admin/(dashboard)/settings/training-types/page": "training.types",
  },
  actions: {
    "routes/team/(dashboard)/my-training/actions": "training.mine",
    "routes/team/(dashboard)/training/actions": "training.organise",
    "routes/team/(dashboard)/training/plans/[planId]/actions": "training.organise",
    "routes/team/(dashboard)/training/exercises/actions": "training.organise",
    "routes/team/(dashboard)/training/sessions/[id]/actions": "training.organise",
    "routes/team/(dashboard)/training/plans/[planId]/learners/[personId]/actions": "training.organise",
    "routes/team/(dashboard)/training/plans/[planId]/weekly/[week]/actions": "training.organise",
    "routes/admin/(dashboard)/settings/training-types/actions": "training.types",
  },
  implies: {},
};
