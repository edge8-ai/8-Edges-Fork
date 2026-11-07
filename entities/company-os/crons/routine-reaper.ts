import { NextResponse } from "next/server";
import { reapDiedRuns } from "@/kernel/audit/routine-reaper";
import { markUnknownEffects } from "@/kernel/audit/effects";
import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs — an entity left out takes its crons with it.
 * Read as text by the generator, so nothing imports it.
 * @generator
 */
export const schedule = "*/5 * * * *";

/**
 * What Settings -> Agents says about this routine (Y.14). Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "Routine reaper",
  description: "Every five minutes. Marks a run still 'running' a minute past its step deadline as died (killed, timed out or crashed before it could close its row) and tells Operations. Runs waiting on an approval or a delayed send are never reaped.",
  content: ["Routine runs (this page)"],
  apps: ["Supabase", "Lark"],
};

// Vercel cron (see vercel.json): every five minutes. Since Y.6 a run's row
// opens as `running` before the work starts, so a function Vercel killed or
// timed out leaves a row that never closes. This marks every running row whose
// step deadline passed more than a minute ago as `died` and tells Operations,
// so a killed run is visible instead of looking like it is still going.
// Waiting rows (parked on an approval or a delayed send) are never reaped. It
// ships with Y.6 rather than later because a died state with nothing to set
// it is decoration.

const ROUTINE_ID = "/api/cron/routine-reaper/";

async function handler(_req: Request): Promise<Response> {
  const reaped = await reapDiedRuns();
  if ("error" in reaped) return NextResponse.json({ error: reaped.error }, { status: 500 });
  const body = { died: reaped.died.length, routines: reaped.died.map((r) => r.routine_id) };
  // The rows are marked; the alert is what makes anyone look at them, so a
  // lost alert fails this run, and two in a row alert through the streak.
  const failures = reaped.alerted
    ? []
    : [{ subject: "died-runs alert", step: "alert Operations", error: "Lark did not accept the died-runs alert (LARK_OPS_WEBHOOK_URL)" }];
  // The effect ledger's half (Z.1): a claimed Lark post or publish whose run
  // is over is marked unknown and told to Operations, because nothing proves
  // whether it happened.
  const effects = await markUnknownEffects();
  let unknownEffects = 0;
  if ("error" in effects) failures.push({ subject: "effect ledger", step: "mark unknown", error: effects.error });
  else {
    unknownEffects = effects.unknown.length;
    if (!effects.alerted) failures.push({ subject: "unknown-effects alert", step: "alert Operations", error: "Lark did not accept the unknown-effects alert (LARK_OPS_WEBHOOK_URL)" });
  }
  return routineResult({ status: "ok", ...body, unknownEffects, failures });
}

// Every run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request): Promise<Response> => withRoutineRun(ROUTINE_ID, req, handler);
