// What `app/` needs to mount this entity's routes and cannot derive: the
// route-segment config. Every page reads live claims and money, so none is
// cached and none of its reads goes through Next's fetch cache (supabase-js
// uses the patched fetch, so force-dynamic alone would not stop it).
//
// Keys are paths within this entity. Nothing imports this file; the generator
// reads it, and `npm run check:app-mounts` fails when `app/` disagrees with it.
import type { RouteMounts } from "@/kernel/config/route-mount";

/** @generator */
export const mounts: RouteMounts = {
  // One delete per row (see the routine), so it gets the minute boards' sweep has.
  "crons/receipt-sweep": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic", fetchCache: "force-no-store", maxDuration: 60 },
  },
  // Asks the banks over the network: a lookup per open currency and per
  // pending receipt, each request capped at six seconds, and a bank that fails
  // once is not asked again in the run (see the routine).
  "crons/vnd-rates": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic", fetchCache: "force-no-store", maxDuration: 300 },
  },
  // Builds at most one run: a read, one guarded move per approved claim, one
  // payment per person and two emails. A minute covers a run of hundreds.
  "crons/payment-run": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic", fetchCache: "force-no-store", maxDuration: 60 },
  },
  // Two reads and an email per checker and approver with something waiting.
  "crons/monday-nudge": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic", fetchCache: "force-no-store", maxDuration: 60 },
  },
  "routes/team/(dashboard)/finance/payment-runs/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/team/(dashboard)/finance/payment-runs/[id]/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/team/(dashboard)/finance/payment-runs/[id]/spreadsheet/route": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/admin/(dashboard)/finance/reimbursements/payment-runs/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/admin/(dashboard)/finance/reimbursements/payment-runs/[id]/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/admin/(dashboard)/finance/reimbursements/payment-runs/[id]/spreadsheet/route": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/admin/(dashboard)/finance/reimbursements/export/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/admin/(dashboard)/finance/reimbursements/export/spreadsheet/route": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic", fetchCache: "force-no-store", maxDuration: 60 },
  },
  // The month's documents as one zip, streamed from storage as it downloads
  // (lib/zip-stream.ts): the route's time limit is what bounds a bundle, so it
  // gets five minutes, which at the bucket's usual speed is more than the 4 GiB
  // a plain zip may hold (the route refuses a bigger bundle before it starts).
  "routes/admin/(dashboard)/finance/reimbursements/export/documents/route": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic", fetchCache: "force-no-store", maxDuration: 300 },
  },
  "routes/team/(dashboard)/claims/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/team/(dashboard)/claims/new/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/team/(dashboard)/claims/[id]/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/team/(dashboard)/finance/claims/to-check/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/team/(dashboard)/finance/claims/[id]/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/admin/(dashboard)/finance/reimbursements/to-check/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/admin/(dashboard)/finance/reimbursements/to-approve/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/admin/(dashboard)/finance/reimbursements/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/admin/(dashboard)/finance/reimbursements/approved/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/admin/(dashboard)/finance/reimbursements/paid/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/admin/(dashboard)/finance/reimbursements/[id]/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
};
