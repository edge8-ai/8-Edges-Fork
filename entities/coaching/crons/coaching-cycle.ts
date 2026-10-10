import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { runCoachingCycle } from "@/entities/coaching/lib/cycle";
import { saigonToday } from "@/entities/coaching";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs — an entity left out takes its crons with it.
 * Read as text by the generator, so nothing imports it.
 * @generator
 */
export const schedule = "45 0 * * *";

/**
 * What Settings -> Agents says about this routine (Y.14). Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "Coaching cycle",
  description: "Daily pass over active coaching profiles: 1-1 prep, lapsed-cadence nudges, mid-cycle check-ins, monthly trend reports. Lands before 09:00 +07.",
  content: ["Coaching profiles", "1-1 cadences"],
  apps: ["Supabase", "Resend", "Lark"],
};

// Vercel cron (see vercel.json): daily 00:45 UTC = 07:45 Saigon, so preps and
// nudges land before the workday starts (Dave reads his prep by 09:00 +07).
// One pass over every active coaching profile: generate the prep for upcoming
// 1-1s (and mail the coach), nudge on lapsed cadences (weekly), send the
// mid-cycle check-in to the member (once per cycle), and run last month's
// trend reports in the first days of the month. Every step is stamped, so a
// missed day self-heals on the next run. Auth is the standard Vercel Cron
// bearer.
async function handler(req: Request) {
  const summary = await runCoachingCycle(saigonToday());
  return routineResult({ status: "ok", ...summary });
}

// Every scheduled run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request) => withRoutineRun("/api/cron/coaching-cycle/", req, handler);
