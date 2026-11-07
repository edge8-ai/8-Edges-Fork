// Replenishment's access declaration (ADR 0013; spec 2026-10-28, "Access").
// Read as text by scripts/gen-deployment.mjs; nothing imports this file.
//
// Three atoms: the profile (a warehouse's rules), the runs (upload, check,
// send, close, read every job) and working a sent run on a scanner. A
// warehouse manager holds all three; an operator holds only the last.
//
// The spec named them profiles.manage, runs.manage and jobs.work. The atom
// grammar admits a third part only as a view/manage pair, and an entity adopts
// a pair only when a role needs to see without controlling (access-control
// skill, "View and manage pairs"). No role does yet, so they are two-part
// atoms; jobs.work has no legal three-part spelling at all.
//
// Neither Admin nor Super Admin holds any of them. The kernel's Admin bundles
// must list exactly what the holders entries give `admin`, so an Admin holder
// here would force an edit to the kernel's bundles for a feature most
// deployments run for one warehouse. The two roles below are declared by this
// entity instead and granted in Settings → Access. The rows reach a database
// as a data-only migration written by `npm run access:sync`; until they land,
// every page here refuses everyone.
import type { EntityPermissions } from "@/kernel/identity/permission-declaration";

/** @generator */
export const permissions: EntityPermissions = {
  permissions: {
    "replenishment.profiles": "Set up a warehouse's replenishment profile: its zones, rules, bands and words",
    "replenishment.runs": "Upload a stock export, check its jobs, send it to the scanners and close it",
    "replenishment.work": "Work a sent replenishment run on a scanner: finish and reopen its jobs",
  },
  holders: {
    "replenishment.profiles": "warehouse-manager",
    "replenishment.runs": "warehouse-manager",
    "replenishment.work": "warehouse-manager, warehouse-operator",
  },
  roles: {
    // The manager works from the Admin view, where the runs and the profile live,
    // and can work a run on the scanner too, which lives on the Team hub.
    "warehouse-manager": {
      "name": "Warehouse manager",
      "sentence": "Sets up the warehouse's replenishment profile, uploads each week's stock export, checks the jobs and sends them to the scanners.",
      "atoms": "surface.admin, surface.team, replenishment.profiles, replenishment.runs, replenishment.work",
    },
    // The operator works a sent run on a handheld scanner, from the Team hub.
    "warehouse-operator": {
      "name": "Warehouse operator",
      "sentence": "Works sent replenishment runs on a scanner, moving stock from reserve to the pick BINs.",
      "atoms": "surface.team, replenishment.work",
    },
  },
  routes: {
    "routes/admin/(dashboard)/operations/replenishment/profile/page": "replenishment.profiles",
    "routes/admin/(dashboard)/operations/replenishment/runs/page": "replenishment.runs",
    "routes/admin/(dashboard)/operations/replenishment/runs/[id]/page": "replenishment.runs",
    "routes/team/(dashboard)/replenishment/page": "replenishment.work",
    "routes/team/(dashboard)/replenishment/[id]/page": "replenishment.work",
  },
  actions: {
    "lib/profile-actions": "replenishment.profiles",
    "lib/preview-actions": "replenishment.profiles",
    "lib/run-actions": "replenishment.runs",
    "lib/job-actions": "replenishment.work",
  },
  implies: {},
};
