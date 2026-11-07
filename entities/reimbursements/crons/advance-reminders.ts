import { NextResponse } from "next/server";
import { failuresFrom, routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { saigonToday } from "@/kernel/config/dates";
import { sendAdvanceReminders } from "@/entities/reimbursements/lib/advance-reminders";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs. Read as text by the generator.
 * @generator
 */
export const schedule = "0 1 * * 1-5";

/**
 * What Settings -> Agents says about this routine (Y.14). Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "Advance reminders",
  description: "Weekdays at 08:00. Reminds whoever holds an advance three working days before its settle-by date, and tells them and Finance once when it passes. Nobody hears while a settlement is being checked.",
  content: ["Reimbursement advances"],
  apps: ["Supabase", "Resend"],
};

// Vercel cron: 01:00 UTC on weekdays, which is 08:00 in Vietnam (design section 8). Each
// notice is claimed on the advance before it goes, so a rerun sends nothing new.

const ROUTINE_ID = "/api/cron/advance-reminders/";

async function handler(_req: Request) {
  try {
    const report = await sendAdvanceReminders(saigonToday());
    const nobodyDue = report.reminded + report.overdue === 0 && report.failed.length === 0;
    return routineResult({
      status: nobodyDue ? "skipped" : "ok",
      ...(nobodyDue ? { reason: "no advance was due a reminder today" } : {}),
      ...report,
      failures: failuresFrom(report.failed, "send advance reminder", "Advance reminders"),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export const GET = (req: Request) => withRoutineRun(ROUTINE_ID, req, handler, "vercel", { stepSeconds: 60 });
