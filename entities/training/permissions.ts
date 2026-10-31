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
    "training.host": "Run a session you organise: open its page, mark who came, move it or cancel it",
    "training.organise": "Schedule trainings for people and change them until they start",
    "training.types": "Keep the list of training types in Settings",
  },
  holders: {
    "training.mine": "team-member:own, contractor:own",
    // A teacher or team coach organises through the Training organiser role
    // below; a manager organises for their own team.
    "training.organise": "manager:team, admin",
    // A Raid's Host runs their own taught session through the implied Host role
    // below (QS.5b); every organiser holds it too, so the session page and its
    // three moves open to everyone they opened to before. Each still finds only
    // a session the reader organises.
    "training.host": "host:own, manager:team, admin",
    "training.types": "admin",
  },
  roles: {
    "training-organiser": {
      "name": "Training organiser",
      "sentence": "Schedules trainings for people and runs training plans: a teacher, a team coach or a lead.",
      "atoms": "training.organise, training.host",
    },
  },
  routes: {
    "routes/team/(dashboard)/my-training/page": "training.mine",
    "routes/team/(dashboard)/my-training/sessions/[id]/page": "training.mine",
    "routes/team/(dashboard)/training/page": "training.organise",
    "routes/team/(dashboard)/training/plans/[planId]/page": "training.organise",
    "routes/team/(dashboard)/training/plans/[planId]/philosophy/page": "training.organise",
    "routes/team/(dashboard)/training/exercises/page": "training.organise",
    "routes/team/(dashboard)/training/sessions/[id]/page": "training.host",
    "routes/team/(dashboard)/training/plans/[planId]/learners/[personId]/page": "training.organise",
    "routes/team/(dashboard)/training/plans/[planId]/weekly/[week]/page": "training.organise",
    "routes/admin/(dashboard)/settings/training-types/page": "training.types",
    // Talent › People › Training: every class, whoever organises it,
    // read-only. Admin holds training.organise at all and only admins enter
    // the Admin view, so no atom of its own is needed.
    "routes/admin/(dashboard)/talent/training/page": "training.organise",
    // One class's page (ADR 0016, amended 2026-10-26): its attendees, lesson
    // plan, recap, and each learner's English evaluation and instructor
    // feedback, read-only, under the same atom as the list.
    "routes/admin/(dashboard)/talent/training/classes/[id]/page": "training.organise",
  },
  actions: {
    "routes/team/(dashboard)/my-training/actions": "training.mine",
    "routes/team/(dashboard)/training/actions": "training.organise",
    "routes/team/(dashboard)/training/actions#updateTrainingAction": "training.host",
    "routes/team/(dashboard)/training/actions#cancelTrainingAction": "training.host",
    "routes/team/(dashboard)/training/plans/[planId]/actions": "training.organise",
    "routes/team/(dashboard)/training/exercises/actions": "training.organise",
    "routes/team/(dashboard)/training/sessions/[id]/actions": "training.organise",
    "routes/team/(dashboard)/training/sessions/[id]/actions#setAttendanceAction": "training.host",
    "routes/team/(dashboard)/training/plans/[planId]/learners/[personId]/actions": "training.organise",
    "routes/team/(dashboard)/training/plans/[planId]/weekly/[week]/actions": "training.organise",
    "routes/admin/(dashboard)/settings/training-types/actions": "training.types",
  },
  implies: {
    "host": "organises at least one taught session (a Sharing session on the record for others, not cancelled)",
  },
};
