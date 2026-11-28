// What `app/` needs to mount the kernel's event routines and cannot derive:
// the route-segment config, which Next does not see through a re-export.
// Everything else about a mount (its path, and the names Next binds it by)
// comes from the routine itself (scripts/gen-app-mounts.mjs). A kernel package
// declares its routines' mounts the way an entity does (A.86).
//
// Keys are paths within this package. Nothing imports this file; the generator
// reads it, and `npm run check:app-mounts` fails when `app/` disagrees with it.
import type { RouteMounts } from "@/kernel/config/route-mount";

/** @generator */
export const mounts: RouteMounts = {
  "crons/event-outbox": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic", fetchCache: "force-no-store", maxDuration: 300 },
  },
  "crons/event-deliveries": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
};
