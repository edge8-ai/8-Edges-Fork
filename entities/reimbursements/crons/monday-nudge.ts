import { NextResponse } from "next/server";
import { failuresFrom, routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { saigonToday } from "@/kernel/config/dates";
import { sendMondayNudges } from "@/entities/reimbursements/lib/nudges";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs. Read as text by the generator.
 * @generator
 */
export const schedule = "0 1 * * 1";

/**
 * What Settings -> Agents says about this routine (Y.14). Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "Reimbursements Monday nudge",
  description: "Mondays at 08:00. Emails each checker how many submitted claims wait to be checked, and each approver how many checked claims wait for approval, with a link to their queue. A person's own claim is not counted for them, and nobody hears about an empty queue.",
  content: ["Reimbursement claims"],
  apps: ["Supabase", "Resend"],
};

// Vercel cron: 01:00 UTC every Monday, which is 08:00 in Vietnam (design
// §1.8). Checkers are reminded of submitted claims, approvers of checked ones;
// nobody hears about a queue with nothing in it (lib/nudges.ts).

const ROUTINE_ID = "/api/cron/monday-nudge/";

async function handler(_req: Request) {
  try {
    const report = await sendMondayNudges(saigonToday());
    // A nudge that should have gone and did not names the person; the kernel makes the run an error (Y.13).
    const nobodyWaited = report.check + report.approve === 0 && report.failed.length === 0;
    return routineResult({
      status: nobodyWaited ? "skipped" : "ok",
      ...(nobodyWaited ? { reason: "no queue had a claim waiting on anyone" } : {}),
      ...report,
      failures: failuresFrom(report.failed, "send nudge email", "Monday nudge"),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export const GET = (req: Request) => withRoutineRun(ROUTINE_ID, req, handler, "vercel", { stepSeconds: 60 });
