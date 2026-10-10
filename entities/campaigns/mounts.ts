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
  "crons/blog-publish": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic", fetchCache: "force-no-store", maxDuration: 300 },
  },
  "crons/email-campaign-send": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic", fetchCache: "force-no-store", maxDuration: 300 },
  },
  "crons/email-series-draft": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic", fetchCache: "force-no-store", maxDuration: 300 },
  },
  "crons/letter-weekly": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic", fetchCache: "force-no-store", maxDuration: 300 },
  },
  "crons/marketing-digest": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "crons/marketing-recap": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "crons/marketing-weekly-pulse": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "crons/agent-driver": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic", fetchCache: "force-no-store", maxDuration: 300 },
  },
  "crons/revenue-content-sync": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic", fetchCache: "force-no-store", maxDuration: 300 },
  },
  "crons/writer-schedule": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic", fetchCache: "force-no-store", maxDuration: 300 },
  },
  "routes/admin/(dashboard)/revenue/marketing/audiences/[id]/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/admin/(dashboard)/revenue/marketing/audiences/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/admin/(dashboard)/revenue/marketing/books/[slug]/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/admin/(dashboard)/revenue/marketing/books/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/admin/(dashboard)/revenue/marketing/brands/[slug]/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/admin/(dashboard)/revenue/marketing/brands/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/admin/(dashboard)/revenue/marketing/broadcasts/[id]/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/admin/(dashboard)/revenue/marketing/broadcasts/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/admin/(dashboard)/revenue/marketing/calendar/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store", maxDuration: 300 },
  },
  "routes/admin/(dashboard)/revenue/marketing/campaigns/[id]/assets/[assetId]/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/admin/(dashboard)/revenue/marketing/campaigns/[id]/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store", maxDuration: 300 },
  },
  "routes/admin/(dashboard)/revenue/marketing/campaigns/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/admin/(dashboard)/revenue/marketing/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/admin/(dashboard)/revenue/marketing/recaps/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/admin/(dashboard)/revenue/marketing/recurring/[id]/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/admin/(dashboard)/revenue/marketing/recurring/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/admin/(dashboard)/revenue/marketing/schedule/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/team/(dashboard)/revenue/marketing/books/[slug]/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/team/(dashboard)/revenue/marketing/books/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/team/(dashboard)/revenue/marketing/brands/[slug]/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/team/(dashboard)/revenue/marketing/brands/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/team/(dashboard)/revenue/marketing/broadcasts/[id]/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/team/(dashboard)/revenue/marketing/broadcasts/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/team/(dashboard)/revenue/marketing/calendar/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store", maxDuration: 300 },
  },
  "routes/team/(dashboard)/revenue/marketing/campaigns/[id]/assets/[assetId]/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/team/(dashboard)/revenue/marketing/campaigns/[id]/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store", maxDuration: 300 },
  },
  "routes/team/(dashboard)/revenue/marketing/campaigns/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/team/(dashboard)/revenue/marketing/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/team/(dashboard)/revenue/marketing/recaps/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
};
