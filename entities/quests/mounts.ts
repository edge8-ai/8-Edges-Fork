// What `app/` needs to mount this entity's routes and cannot derive: the
// route-segment config and the page's stylesheet. The Quests page reads live
// rows per request, so it is never rendered statically.
import type { RouteMounts } from "@/kernel/config/route-mount";

/** @generator */
export const mounts: RouteMounts = {
  "routes/team/(dashboard)/quests/page": {
    segment: { dynamic: "force-dynamic" },
    // Lighthouses (QS.6) and the next move (QS.13) keep their own sheets, after the page's.
    styles: ["@/app/styles/quests.css", "@/app/styles/quests-lighthouses.css", "@/app/styles/quests-next-move.css", "@/app/styles/quests-lands.css"],
    // QS.11: the reader's game style comes from ladders, which quests may not
    // import; so does their Learn & Share position for the next move (QS.13).
    // QS.15b: and so does a badge the reader's act found, which drops beside that act.
    slots: { gameStyle: "gameStyle", learnShareStanding: "learnShareStanding", questBadgeDrops: "questBadgeDrops" },
  },
  // The manager report (QS.3) reads who stands where on one Bounty per request,
  // and lays out its picker and footnote with its own sheet.
  "routes/admin/(dashboard)/talent/quests/page": {
    segment: { dynamic: "force-dynamic" },
    styles: ["@/app/styles/quest-report.css"],
  },
  // The same report on the Team view (QS.3b), drawn with the Quests page's
  // faces and pills, so it takes that sheet before its own.
  "routes/team/(dashboard)/quests/report/page": {
    segment: { dynamic: "force-dynamic" },
    styles: ["@/app/styles/quests.css", "@/app/styles/quest-report.css"],
  },
};
