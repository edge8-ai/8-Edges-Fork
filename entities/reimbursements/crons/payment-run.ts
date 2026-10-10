import { NextResponse } from "next/server";
import { failuresFrom, routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { saigonToday } from "@/kernel/config/dates";
import { buildPaymentRun } from "@/entities/reimbursements/lib/payment-runs";
import { isRunDay } from "@/entities/reimbursements/lib/run-rules";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs. Read as text by the generator.
 * @generator
 */
export const schedule = "0 1 1,15 * *";

/**
 * What Settings -> Agents says about this routine (Y.14). Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "Payment run",
  description: "08:00 on the 1st and the 15th. Puts every claim approved before midnight into one payment run, one payment per person, and tells accounting@ and the Operations chat once, with the people and the total and never a bank detail. Nothing approved, no run. Building again the same day changes nothing.",
  content: ["Reimbursement claims", "Payment runs"],
  apps: ["Supabase", "Resend", "Lark"],
};

// Vercel cron: 01:00 UTC on the 1st and the 15th, which is 08:00 in Vietnam
// (UTC+7, no daylight saving), weekends included (design §1.7). It builds the
// run for today's Vietnam date from the claims approved before 00:00 that day.
// Building is idempotent, so a retried tick finds the run it built and sends
// no second notice; a tick Vercel missed is built by the payer's "Build the
// run" button, which calls the same function (decision 6).

const ROUTINE_ID = "/api/cron/payment-run/";

async function handler(_req: Request) {
  const today = saigonToday();
  // A manual trigger on another day builds nothing: runs belong to their dates.
  // status "skipped" is the only word the run record reads as skipped (Y.34).
  if (!isRunDay(today)) return NextResponse.json({ status: "skipped", reason: `${today} is not a run day` });
  const built = await buildPaymentRun(today);
  if (!built.ok) return NextResponse.json({ error: built.error }, { status: 500 });
  if (!built.built) return NextResponse.json({ built: false, reason: built.reason });
  // A failed transfer makes an error run that names it; the kernel decides (Y.13).
  return routineResult({
    status: "ok",
    ...built,
    failures: failuresFrom(built.failed, "transfer", "payment run"),
  });
}

export const GET = (req: Request) => withRoutineRun(ROUTINE_ID, req, handler, "vercel", { stepSeconds: 60 });
