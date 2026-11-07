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
  "crons/onboarding-cycle": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/talent/onboarding/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/talent/onboarding/plan/[id]/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/onboarding/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/onboarding/plan/[id]/page": {
    segment: { dynamic: "force-dynamic" },
  },
};
