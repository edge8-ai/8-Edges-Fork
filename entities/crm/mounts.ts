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
  "crons/account-health": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "crons/revenue-snapshot": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  // The proposal chain's driver (Z.10): a step may wait on a model call, so it
  // has the longest a route may take, which the AI sites fit their calls in.
  "crons/proposal-chain": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic", fetchCache: "force-no-store", maxDuration: 300 },
  },
  // A published proposal is read live: never a cached copy of a page that a
  // later edit and approval replaced.
  "routes/proposals/d/[slug]/route": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "crons/crm-driver": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic", fetchCache: "force-no-store", maxDuration: 300 },
  },
  // The inquiry-to-lead chain's driver (Z.11): a qualify step waits on one
  // model call, so the route has the longest a route may take, which the
  // lead-qualify site fits its call inside.
  "crons/inquiry-to-lead": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic", fetchCache: "force-no-store", maxDuration: 300 },
  },
  "routes/admin/(dashboard)/contacts/[id]/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/contacts/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/revenue/accounts/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/admin/(dashboard)/revenue/affiliates/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/revenue/clients/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/revenue/companies/[id]/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/revenue/companies/[id]/programs/[programId]/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/revenue/companies/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/revenue/deals/[id]/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/admin/(dashboard)/revenue/deals/page": {
    segment: { dynamic: "force-dynamic" },
  },
  // Read again on the Leads card and the Inquiries board runs the qualifier's
  // model call inside the page's server action (Z.11), so both pages have the
  // longest a route may take, which lead-qualify fits its call inside.
  "routes/admin/(dashboard)/revenue/inquiries/page": {
    segment: { dynamic: "force-dynamic", maxDuration: 300 },
  },
  "routes/admin/(dashboard)/revenue/leads/page": {
    segment: { dynamic: "force-dynamic", maxDuration: 300 },
  },
  "routes/admin/(dashboard)/revenue/meetings/[id]/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/revenue/meetings/new/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/revenue/meetings/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/revenue/billing/clients/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/revenue/billing/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/revenue/data-health/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/revenue/demand/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/revenue/outlook/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/revenue/market/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/revenue/pipeline/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/revenue/proposals/[id]/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store", maxDuration: 300 },
  },
  "routes/admin/(dashboard)/revenue/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/revenue/sales-intelligence/[id]/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/revenue/sales-intelligence/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/revenue/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/revenue/pipeline/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/revenue/proposals/[id]/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store", maxDuration: 300 },
  },
  "routes/team/(dashboard)/revenue/demand/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/revenue/billing/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/revenue/outlook/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/revenue/market/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/revenue/data-health/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/revenue/deals/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/revenue/deals/[id]/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/team/(dashboard)/revenue/leads/page": {
    segment: { dynamic: "force-dynamic", maxDuration: 300 },
  },
  "routes/team/(dashboard)/revenue/inquiries/page": {
    segment: { dynamic: "force-dynamic", maxDuration: 300 },
  },
  "routes/team/(dashboard)/revenue/companies/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/revenue/companies/[id]/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/revenue/companies/[id]/programs/[programId]/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/revenue/clients/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/revenue/meetings/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/revenue/meetings/new/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/revenue/meetings/[id]/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/revenue/sales-intelligence/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/revenue/sales-intelligence/[id]/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/revenue/accounts/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/team/(dashboard)/revenue/affiliates/page": {
    segment: { dynamic: "force-dynamic" },
  },
};
