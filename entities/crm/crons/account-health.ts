import { NextResponse } from "next/server";
import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { takeAccountHealthSnapshots } from "@/entities/crm/lib/account-health";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs — an entity left out takes its crons with it.
 * Read as text by the generator, so nothing imports it.
 * @generator
 */
export const schedule = "30 19 * * *";

/**
 * What Settings -> Agents says about this routine (Y.14). Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "Account health",
  description: "Nightly at 02:30 Vietnam time. Scores every current client from four signals (days since the last meeting, overdue invoices, roadmap moves in 30 days, days since the last portal sign-in) into one account health row each, which Revenue's Accounts needing attention reads.",
  content: ["Companies", "Meetings", "Invoices", "Client roadmaps", "Portal sign-ins"],
  apps: ["Supabase"],
};

// Nightly at 19:30 UTC, 02:30 in Saigon: one account_health_snapshots row per
// current client, from four company-level signals — days since the last
// meeting, overdue invoices, roadmap moves in 30 days and days since the last
// portal sign-in — scored by crm's scoreHealth (S.6). The Revenue "Accounts
// needing attention" screen reads the latest day's rows.
//
// A failed read refuses to write and answers 500, so Settings -> Agents shows a
// failed run instead of a night of readings taken from half the facts.
async function handler() {
  const r = await takeAccountHealthSnapshots();
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 });
  return routineResult({ status: "ok", takenOn: r.takenOn, accounts: r.accounts });
}

// Every scheduled run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request) => withRoutineRun("/api/cron/account-health/", req, handler);
