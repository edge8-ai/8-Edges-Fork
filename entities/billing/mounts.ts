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
  "api/stripe/webhook/route": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/checkout/layout": {
    styles: ["@/app/styles/site-components.css", "@/app/styles/utilities.css"],
  },
  "routes/plans/layout": {
    styles: ["@/app/styles/workflows.css", "@/entities/billing/routes/plans/plans.css", "@/app/styles/site-components.css", "@/app/styles/utilities.css"],
  },
};
