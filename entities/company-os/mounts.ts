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
  "api/admin/chat/route": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic", maxDuration: 300 },
  },
  "api/admin/marketing/publish-editor/route": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic", maxDuration: 300 },
  },
  "api/qbo/callback/route": {
    segment: { dynamic: "force-dynamic" },
  },
  "api/qbo/connect/route": {
    segment: { dynamic: "force-dynamic" },
  },
  "api/webhooks/resend/route": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "crons/broadcast-summary": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "crons/check-in-reminder": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "crons/contractor-payments": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic" },
  },
  "crons/daily-check-in": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "crons/qbo-invoice-sync": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic" },
  },
  "crons/qbo-refresh": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic" },
  },
  "crons/routine-reaper": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "crons/automation-watchdog": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "crons/notification-flush": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/admin/(auth)/layout": {
    styles: ["@/app/admin/admin.css", "@/app/styles/utilities.css"],
  },
  "routes/admin/(auth)/verify/page": {
    useClient: true,
  },
  "routes/admin/(dashboard)/client-hubs/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/error": {
    useClient: true,
  },
  "routes/admin/(dashboard)/operations/analytics/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/operations/contractor-payments/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/operations/contractor-requests/new/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/operations/contractor-requests/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/operations/contractors/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/operations/gallery/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/operations/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/admin/(dashboard)/operations/vendors/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/admin/(dashboard)/patterns/public/page": {
    styles: ["@/app/styles/site-components.css", "@/app/styles/workflows.css"],
  },
  "routes/admin/(dashboard)/revenue/aio-pad/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/revenue/orders/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/revenue/products/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/revenue/aio-pad/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/revenue/orders/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/revenue/products/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/settings/access-codes/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/settings/agents/[id]/page": {
    segment: { dynamic: "force-dynamic" },
  },
  // Run now runs a routine's handler inside this page's server action (Y.25),
  // so the page gets the longest step any cron route allows (300 s, the step
  // deadline withRoutineRun gives a run by default).
  "routes/admin/(dashboard)/settings/agents/page": {
    segment: { dynamic: "force-dynamic", maxDuration: 300 },
  },
  "routes/admin/(dashboard)/settings/assume/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/settings/quickbooks/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/talent/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
};
