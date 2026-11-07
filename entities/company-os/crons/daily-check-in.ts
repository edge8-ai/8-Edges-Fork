import { withRoutineRun } from "@/kernel/audit/routine-runs";
import { DAILY_CHECK_IN_ROUTINE, checkInResponse, runDailyCheckIn } from "@/entities/company-os/lib/check-in/check-in-run";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs — an entity left out takes its crons with it.
 * Read as text by the generator, so nothing imports it.
 * @generator
 */
export const schedule = "30 2 * * 1-5";

/**
 * What Settings -> Agents says about this routine (Y.14). Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "Daily check-in",
  description: "Reads every person's Workboard cards and posts one check-in per roster to its Lark chat. Run now on this page starts the same run by hand.",
  content: ["Workboard cards", "Card comments", "Time off", "Team directory"],
  apps: ["Supabase", "Lark"],
};

// Vercel cron (see vercel.json): weekdays 02:30 UTC (09:30 Asia/Ho_Chi_Minh).
// The run itself lives in the boards module, because Settings -> Agents can
// start the same run from its Run now button; this file is only the schedule's
// way in. The response shape lives there too, so the two entry points cannot
// disagree about what a failed run looks like.
async function handler(_req: Request) {
  return checkInResponse(await runDailyCheckIn());
}

export const GET = (req: Request) => withRoutineRun(DAILY_CHECK_IN_ROUTINE, req, handler);
