// What `app/` needs to mount this entity's routes and cannot derive: the
// route-segment config and the stylesheets, neither of which Next sees through
// a re-export. Everything else about a mount — its path, and the names Next
// binds it by — comes from the route itself (scripts/gen-app-mounts.mjs).
//
// Keys are paths within this entity. Nothing imports this file; the generator
// reads it, and `npm run check:app-mounts` fails when `app/` disagrees with it.
import type { RouteMounts } from "@/kernel/config/route-mount";

/** @generator */
export const mounts: RouteMounts = {
  "crons/board-digest": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "crons/weekly-sprints": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic", fetchCache: "force-no-store", maxDuration: 60 },
  },
  "crons/revenue-closed-cards": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic", fetchCache: "force-no-store", maxDuration: 60 },
  },
  "crons/deliverable-sweep": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic", fetchCache: "force-no-store", maxDuration: 60 },
  },
  "crons/meeting-cards": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic", fetchCache: "force-no-store", maxDuration: 300 },
  },
  "routes/team/(dashboard)/my-week/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
    slots: { inboxLine: "InboxLine" },
  },
  "routes/admin/(dashboard)/boards/[slug]/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/admin/(dashboard)/boards/[slug]/epics/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/admin/(dashboard)/boards/[slug]/sprints/[sprintId]/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/admin/(dashboard)/boards/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/admin/(dashboard)/edges/domains/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/admin/(dashboard)/edges/sprint-planning/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/admin/(dashboard)/edges/workboard/flow/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/admin/(dashboard)/edges/workboard/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
};
