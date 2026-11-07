import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { writeStories } from "@/entities/training/lib/narrations";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs. Read as text by the generator.
 * @generator
 */
export const schedule = "0 0-5 * * 1";

/**
 * What Settings -> Agents says about this routine (Y.14). Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "Training programme narration",
  description: "Mondays, hourly from 07:00 to 12:00 Vietnam time. Reads the programme as each manager, organiser and admin sees it and writes two or three sentences on every slice they are shown, for each period, kept for that reader only. Claude is given the slice's figures and nothing else, never a name or a note; a story that cites any number not in its figures is set aside and that slice shows figures only for the week. Identical figures are written once and shared, and each tick makes at most 12 model calls, so later ticks finish what earlier ones left.",
  content: ["Training reviews", "Attendance", "Training plans", "Training types"],
  apps: ["Supabase", "Claude"],
};

// Vercel cron: Monday ticks for the week's programme stories (TR.9). Each tick
// makes at most CALLS model calls and leaves the rest for the next, so a tick
// can never run past the route's ceiling; a story already written is never
// written again.
const ROUTINE_ID = "/api/cron/training-programme-narration/";
const CALLS = 12;

async function handler(): Promise<Response> {
  const run = await writeStories(new Date(), CALLS);
  return routineResult({ status: "ok", ...run });
}

// Every scheduled run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request) => withRoutineRun(ROUTINE_ID, req, handler, "vercel", { stepSeconds: 280 });
