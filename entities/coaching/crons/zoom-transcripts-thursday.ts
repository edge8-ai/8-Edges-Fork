import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { ingestHandler } from "./zoom-transcripts";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs — an entity left out takes its crons with it.
 * Read as text by the generator, so nothing imports it.
 * @generator
 */
export const schedule = "*/15 4-5 * * 4";

/**
 * What Settings -> Agents says about this routine (Y.14). Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "Group coaching transcripts, Thursday",
  description: "Thursdays every 15 minutes from 11:30 to 12:30 Saigon time, just after the weekly group session. The same ingest as the hourly job, so the session's summary and Lark card land minutes after Zoom finishes the transcript.",
  content: ["Zoom cloud recordings", "Group coaching sessions"],
  apps: ["Zoom", "Supabase", "Claude", "Lark"],
};

// The weekly group session runs on Thursday until about 11:00 Saigon time
// (04:00 UTC), and the hourly job at :40 left the card waiting up to an hour
// after Zoom finished the transcript. This runs the same ingest every 15
// minutes from 11:30 to 12:30 Saigon time (04:30 to 05:30 UTC). A cron
// expression cannot start at :30 of one hour and stop at :30 of the next, so
// the schedule covers 04:00-05:45 and the slots outside the window skip. The
// ingest deduplicates on the recording UUID, so this and the hourly job never
// announce a session twice.
const WINDOW_START_MIN = 4 * 60 + 30;
const WINDOW_END_MIN = 5 * 60 + 30;

/** True when `now` is inside 04:30-05:30 UTC, the 11:30-12:30 Saigon window. */
export function inThursdayWindow(now: Date): boolean {
  const minute = now.getUTCHours() * 60 + now.getUTCMinutes();
  return minute >= WINDOW_START_MIN && minute <= WINDOW_END_MIN;
}

async function handler() {
  if (!inThursdayWindow(new Date())) {
    return routineResult({ status: "skipped", reason: "outside the 11:30-12:30 Saigon window" });
  }
  return ingestHandler();
}

// Every scheduled run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request) => withRoutineRun("/api/cron/zoom-transcripts-thursday/", req, handler);
