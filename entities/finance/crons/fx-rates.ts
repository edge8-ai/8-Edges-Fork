import { NextResponse } from "next/server";
import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { refreshCachedRates } from "@/entities/finance/lib/fx-refresh";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs — an entity left out takes its crons with it.
 * Read as text by the generator, so nothing imports it.
 * @generator
 */
export const schedule = "15 0 * * *";

/**
 * What Settings -> Agents says about this routine (Y.14). Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "FX rates",
  description: "Nightly, before the revenue snapshot. Refreshes every cached currency's rate to USD, so any deal or order converts at a rate no older than a day. A currency the source cannot price is reported, not a failure.",
  content: ["FX rates"],
  apps: ["Supabase", "Exchange-rate API"],
};

// Nightly, before the 00:30 revenue snapshot: every cached currency's rate to
// USD is refreshed, so a deal or order written by any path converts at a rate
// no older than a day (Y.42). A currency the source cannot price is reported
// in the body, not treated as a failure.
async function handler() {
  const r = await refreshCachedRates();
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 });
  // `skipped` stays a counter, not a failure list: a currency the source cannot
  // price keeps its last rate by design, and the run fails on its own when no
  // lookup succeeds (fx-refresh), which is the whole-run 500 above.
  return routineResult({ status: "ok", refreshed: r.refreshed, skipped: r.skipped });
}

// Every scheduled run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request) => withRoutineRun("/api/cron/fx-rates/", req, handler);
