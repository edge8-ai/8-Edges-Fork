// What `app/` needs to mount this entity's routes and cannot derive: the
// route-segment config and the page's stylesheet. The Quests page reads live
// rows per request, so it is never rendered statically.
import type { RouteMounts } from "@/kernel/config/route-mount";

/** @generator */
export const mounts: RouteMounts = {
  // Asks (AK.2, ADR 0036): live rows per request, refreshed after every answer,
  // so neither the page nor supabase-js's fetches are ever cached.
  "routes/team/(dashboard)/asks/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
    styles: ["@/app/styles/asks.css"],
  },
  // The manager report (QS.3) reads who stands where on one Bounty per request,
  // and lays out its picker and footnote with its own sheet.
  "routes/admin/(dashboard)/talent/quests/page": {
    segment: { dynamic: "force-dynamic" },
    styles: ["@/app/styles/quest-report.css", "@/app/styles/talent-ats.css"],
  },
  // The same report on the Team view (QS.3b), drawn with the Quests page's
  // faces and pills, so it takes that sheet before its own.
  "routes/team/(dashboard)/quests/report/page": {
    segment: { dynamic: "force-dynamic" },
    styles: ["@/app/styles/quests.css", "@/app/styles/quest-report.css"],
  },
};
