// What `app/` needs to mount this entity's routes and cannot derive: the
// route-segment config. Both inbox pages read live rows per request, and
// supabase-js reads through Next's patched fetch, so they opt out of the fetch
// cache as well as static rendering.
import type { RouteMounts } from "@/kernel/config/route-mount";

/** @generator */
export const mounts: RouteMounts = {
  "routes/admin/(dashboard)/inbox/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/team/(dashboard)/inbox/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
};
