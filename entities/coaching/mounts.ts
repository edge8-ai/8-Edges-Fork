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
  "crons/coaching-cycle": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic", maxDuration: 300 },
  },
  "crons/coaching-lark-pickup": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic", maxDuration: 300 },
  },
  "crons/coaching-recaps": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic", maxDuration: 300 },
  },
  "crons/coaching-backstops": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic", fetchCache: "force-no-store", maxDuration: 300 },
  },
  "crons/zoom-transcripts": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic", maxDuration: 300 },
  },
  "routes/team/(dashboard)/coaching-sessions/[id]/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/coaching-sessions/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/coaching/[profileId]/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/coaching/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/goals/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/my-coaching/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/my-coaching/review/[quarter]/page": {
    segment: { dynamic: "force-dynamic" },
  },
};
