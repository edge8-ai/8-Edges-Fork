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
  "crons/contractor-payments": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/operations/contractor-payments/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/operations/contractor-requests/new/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/operations/contractor-requests/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/operations/contractors/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/portal/(dashboard)/requests/[id]/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/portal/(dashboard)/requests/new/page": {
    segment: { dynamic: "force-dynamic" },
  },
  // A contractor's own work and pay: read per request, never prerendered (ADR 0008).
  "routes/team/(dashboard)/my-work/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/work/[token]/page": {
    segment: { dynamic: "force-dynamic" },
  },
};
