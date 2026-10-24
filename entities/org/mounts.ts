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
  "crons/kr-agent-sync": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "crons/survey-reminders": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/admin/(dashboard)/company/goals/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/company/onboarding-deck/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/company/org/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/company/strategy/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/company/values/page": {
    segment: { dynamic: "force-dynamic" },
  },
  // Live rows on every render: a cached page would answer the fit check from
  // commitments that have since changed. supabase-js reads through Next's
  // patched fetch, so the fetch cache is switched off as well as the page's.
  "routes/admin/(dashboard)/operations/capacity/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/admin/(dashboard)/operations/equipment/fitness/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/operations/equipment/new/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/operations/equipment/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/operations/surveys/[id]/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/operations/surveys/[id]/results/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/operations/surveys/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/talent/probation/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/talent/team/[id]/id-image/[side]/route": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/talent/team/[id]/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/talent/team/page": {
    segment: { dynamic: "force-dynamic" },
  },
};
