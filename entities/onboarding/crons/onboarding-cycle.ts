import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { runOnboardingCycle, saigonToday } from "@/entities/onboarding/lib/cycle";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs — an entity left out takes its crons with it.
 * Read as text by the generator, so nothing imports it.
 * @generator
 */
// 07:30 in Vietnam (GMT+7); Vercel runs cron schedules in UTC.
export const schedule = "30 0 * * *";

/**
 * What Settings -> Agents says about this routine (Y.14). Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "Onboarding cycle",
  description: "One daily pass over every onboarding journey: backfill, nag for plans, Day 8 survey, probation trigger, promotions, 180-day stay interview.",
  content: ["Onboarding journeys"],
  apps: ["Supabase", "Resend"],
};

// Vercel cron (see vercel.json): daily 07:30 UTC. Its Day 45 milestone is the
// one probation-review email (Y.9, decided 23 Sep 2026); the team cron that
// sent a second one 14 days out is gone.
// One pass over every live onboarding journey: backfill missing journeys, nag
// managers for missing plans (T-7..Day 1), send the Day 8 survey, trigger the
// probation review 15 days before probation ends, remind on missing decisions,
// promote passed hires to full time at probation end, and prompt the 180-day
// stay interview. Milestone sends are stamped on the journey (>= conditions),
// so a missed day self-heals on the next run; only the nag/reminder emails
// repeat daily by design. Auth is the standard Vercel Cron bearer.
async function handler(req: Request) {
  const summary = await runOnboardingCycle(saigonToday());
  // A journey whose milestones threw is named in summary.failures by its id, so
  // the kernel makes the run an error that says whose journey it was (Y.19).
  return routineResult({ status: "ok", ...summary });
}

// Every scheduled run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request) => withRoutineRun("/api/cron/onboarding-cycle/", req, handler);
