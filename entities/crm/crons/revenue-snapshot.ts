import { NextResponse } from "next/server";
import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { NOT_DIGEST_DAY } from "@/entities/crm/lib/revenue-metrics/digest";
import { takeRevenueSnapshot } from "@/entities/crm/lib/revenue-metrics/snapshot";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs — an entity left out takes its crons with it.
 * Read as text by the generator, so nothing imports it.
 * @generator
 */
export const schedule = "30 0 * * *";

/**
 * What Settings -> Agents says about this routine (Y.14). Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "Revenue snapshot",
  description: "Nightly at 00:30 UTC. Writes one row of the figures the Revenue hub showed, which the Pipeline tab charts. On the 1st it also posts the month-end digest to the Revenue chat and says whether it went out.",
  content: ["Deals", "Invoices", "Revenue snapshots"],
  apps: ["Supabase", "Lark"],
};

// Nightly: one row in revenue_snapshots with the figures the Revenue hub
// showed at 00:30 UTC. The Pipeline tab charts the rows; history starts at the
// first one and the chart says so. A failed read refuses to write, because a
// half-loaded reading would be a wrong data point forever.
//
// On the first of the month the same run posts the month-end digest to the
// Revenue Lark channel (RF-9), reporting the month that just ended. The result
// says whether it went out and why not, so a silent non-delivery is visible in
// Settings -> Agents rather than being assumed.
async function handler() {
  const r = await takeRevenueSnapshot();
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 });
  // On the 1st a digest that did not go out is a failure the run names: the
  // snapshot is saved, but the Revenue chat never got its month-end figures.
  // Every other night "not the first of the month" is the design (Y.22).
  const failures =
    !r.digest.posted && r.digest.reason !== NOT_DIGEST_DAY
      ? [{ subject: "month-end digest", step: "post the digest", error: r.digest.reason }]
      : [];
  return routineResult({
    status: "ok",
    takenOn: r.takenOn,
    openDeals: r.openDeals,
    openUsdCents: r.openUsdCents,
    digestPosted: r.digest.posted,
    digestSkipped: r.digest.posted ? undefined : r.digest.reason,
    failures,
  });
}

// Every scheduled run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request) => withRoutineRun("/api/cron/revenue-snapshot/", req, handler);
