// What `app/` needs to mount this entity's routes and cannot derive: the
// route-segment config and the stylesheets of the scanner and the profile
// editor. Every page reads live rows (a profile just imported, a run just
// sent), so each opts out of the data cache as well as static rendering
// (force-dynamic alone does not stop fetch caching).
//
// Keys are paths within this entity. Nothing imports this file; the generator
// reads it, and `npm run check:app-mounts` fails when `app/` disagrees with it.
import type { RouteMounts } from "@/kernel/config/route-mount";

/** @generator */
export const mounts: RouteMounts = {
  "routes/admin/(dashboard)/operations/replenishment/profile/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
    // The profile editor (RP.6): its save bar, the preview beside the form, the rule cards.
    styles: ["@/app/styles/replenishment-profile.css"],
  },
  "routes/admin/(dashboard)/operations/replenishment/runs/[id]/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  // Download offline copy (RP.7): the file is built from live rows on each request.
  "routes/admin/(dashboard)/operations/replenishment/runs/[id]/offline/route": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/admin/(dashboard)/operations/replenishment/runs/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/team/(dashboard)/replenishment/[id]/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
    // The scanner's full screen (RP.5), over the Team hub's chrome.
    styles: ["@/app/styles/replenishment-scanner.css"],
  },
  "routes/team/(dashboard)/replenishment/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
};
