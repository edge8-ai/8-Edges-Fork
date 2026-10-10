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
  "api/portal/program-plan/route": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic", maxDuration: 300 },
  },
  "api/portal/roadmap-assist/route": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic", maxDuration: 60 },
  },
  "api/surveys/[slug]/route": {
    segment: { runtime: "nodejs" },
  },
  "api/surveys/[slug]/upload/route": {
    segment: { runtime: "nodejs" },
  },
  "routes/portal/(auth)/layout": {
    styles: ["../../admin/admin.css", "@/app/styles/utilities.css"],
  },
  "routes/portal/(dashboard)/company/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/portal/(dashboard)/error": {
    useClient: true,
  },
  "routes/portal/(dashboard)/events/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/portal/(dashboard)/hub/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/portal/(dashboard)/invoices/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/portal/(dashboard)/meetings/[id]/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/portal/(dashboard)/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/portal/(dashboard)/profile/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/portal/(dashboard)/programs/[id]/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/portal/(dashboard)/programs/add/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/portal/(dashboard)/programs/add/plan/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/portal/(dashboard)/programs/add/upload/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/portal/(dashboard)/programs/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/portal/(dashboard)/referrals/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/portal/(dashboard)/requests/[id]/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/portal/(dashboard)/requests/hire/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/portal/(dashboard)/requests/new/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/portal/(dashboard)/requests/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/portal/(dashboard)/team/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/portal/(dashboard)/time-off/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/portal/(dashboard)/tokens/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/portal/(dashboard)/users/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/proposals/layout": {
    styles: ["@/app/styles/site-components.css", "@/app/styles/utilities.css"],
  },
  "routes/surveys/[slug]/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/surveys/layout": {
    styles: ["@/app/styles/site-components.css", "@/app/styles/utilities.css"],
  },
  "routes/t/[code]/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/t/layout": {
    styles: ["@/app/styles/site-components.css", "@/app/styles/utilities.css"],
  },
  "routes/work/[token]/page": {
    segment: { dynamic: "force-dynamic" },
  },
};
