// What `app/` needs to mount this entity's routes and cannot derive: the
// route-segment config. Both inbox pages read live rows per request, and
// supabase-js reads through Next's patched fetch, so they opt out of the fetch
// cache as well as static rendering.
import type { RouteMounts } from "@/kernel/config/route-mount";

/** @generator */
export const mounts: RouteMounts = {
  "routes/admin/(dashboard)/inbox/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
    // The Inbox's own sheet (TH.2).
    styles: ["@/app/styles/inbox.css"],
    // A card's drawer over the list (TH.2.6), from boards when it is installed.
    slots: { cardPeek: "CardPeek" },
  },
  "routes/team/(dashboard)/inbox/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
    // The Inbox's own sheet (TH.2), and the team page's (TH.8).
    styles: ["@/app/styles/inbox.css", "@/app/styles/team-inbox.css"],
    // A card's drawer over the list (TH.2.6), and what the reminders' cards
    // are now (TH.8), both from boards when it is installed.
    slots: { cardPeek: "CardPeek", cardFacts: "inboxCardFacts", decisions: "inboxDecisions" },
  },
};
