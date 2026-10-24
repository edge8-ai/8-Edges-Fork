// What `app/` needs to mount this entity's routes and cannot derive: the
// route-segment config. Ladders ships dark in LD.1 (no page); its one mount is
// the nightly replay, which recomputes every person from their source rows.
import type { RouteMounts } from "@/kernel/config/route-mount";

/** @generator */
export const mounts: RouteMounts = {
  "crons/ladders-replay": {
    // Four door reads and two writes per batch of people; well inside a minute
    // today, with room for the company to grow.
    segment: { runtime: "nodejs", dynamic: "force-dynamic", fetchCache: "force-no-store", maxDuration: 300 },
  },
};
