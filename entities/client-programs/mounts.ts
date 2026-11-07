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
  "crons/client-status": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic", fetchCache: "force-no-store", maxDuration: 300 },
  },
  "crons/client-status-check": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic", fetchCache: "force-no-store", maxDuration: 300 },
  },
  "crons/client-status-driver": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic", fetchCache: "force-no-store", maxDuration: 300 },
  },
  "routes/admin/(dashboard)/edges/client-roadmaps/page": {
    segment: { dynamic: "force-dynamic" },
  },
  // The weekly status review: its actions run a step inline, the draft's model
  // call included, fitted inside the step's 300 seconds.
  "routes/team/(dashboard)/clients/[companyId]/status/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store", maxDuration: 300 },
  },
};
