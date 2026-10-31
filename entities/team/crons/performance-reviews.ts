import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { runReviewScheduler } from "@/entities/team/lib/review-scheduler";
import { saigonToday } from "@/kernel/config/dates";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs — an entity left out takes its crons with it.
 * Read as text by the generator, so nothing imports it.
 * @generator
 */
// 08:00 in Vietnam (GMT+7); Vercel runs cron schedules in UTC.
export const schedule = "0 1 * * *";

/**
 * What Settings -> Agents says about this routine (Y.14). Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "Performance reviews",
  description: "Opens review cycles whose moment date has arrived (probation +6w, mid-year +5m, renewal +11m) and chases open cycles weekly.",
  content: ["Review cycles", "Employee anchors"],
  apps: ["Supabase", "Resend"],
};

// Vercel cron (see vercel.json): daily 08:00 UTC. Opens review cycles whose
// moment date has just arrived (probation start+6w, mid-year anchor+5m,
// renewal anchor+11m) and chases open cycles weekly until each side submits.
// Auth is the standard Vercel Cron bearer.
async function handler(req: Request) {
  // ?dry=1 previews the day's volume without opening cycles or sending mail.
  const dryRun = new URL(req.url).searchParams.get("dry") === "1";
  // The business date from the kernel helper, not a second copy of it (Y.40).
  const todayISO = saigonToday();
  const result = await runReviewScheduler(todayISO, { dryRun });
  // The scheduler throws on a failed read, which stops the run as a whole; a member
  // with no manager is a data gap it reports as a count, not a failed step.
  return routineResult({
    status: "ok",
    dryRun,
    date: result.date,
    opened: result.opened.length,
    openedDetail: result.opened,
    remindersSent: result.remindersSent,
    skippedNoManager: result.skippedNoManager.length,
  });
}

// Every scheduled run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request) => withRoutineRun("/api/cron/performance-reviews/", req, handler);
