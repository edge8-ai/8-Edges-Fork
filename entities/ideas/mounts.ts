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
  // The morning themes (W.189): one model call over every spark. 300 s, the
  // other AI crons' limit, since Y.67.3: at 60 s the call had 40 s and no
  // retry, and every open-model candidate in the Haiku-successor eval timed out.
  "crons/idea-themes": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic", fetchCache: "force-no-store", maxDuration: 300 },
  },
  "crons/ideas-digest": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/admin/(dashboard)/edges/issues/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/edges/sync/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/innovation/ideas/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/innovation/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
};
