import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { ingestHandler } from "./zoom-transcripts";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs — an entity left out takes its crons with it.
 * Read as text by the generator, so nothing imports it.
 * @generator
 */
export const schedule = "*/15 14-16 * * 2";

/**
 * What Settings -> Agents says about this routine (Y.14). Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "Group coaching transcripts, Tuesday",
  description: "Tuesdays every 15 minutes from 21:15 to 23:00 Saigon time, just after the evening group session. The same ingest as the hourly job, so the session's summary and Lark card land minutes after Zoom finishes the transcript.",
  content: ["Zoom cloud recordings", "Group coaching sessions"],
  apps: ["Zoom", "Supabase", "Claude", "Lark"],
};

// The evening group session runs on Tuesday until about 21:00 Saigon time
// (14:00 UTC), and the hourly job at :40 would leave the card waiting up to an
// hour after Zoom finished the transcript. This runs the same ingest every 15
// minutes from 21:15 to 23:00 Saigon time (14:15 to 16:00 UTC), the Tuesday
// twin of zoom-transcripts-thursday. A cron expression cannot start at :15 of
// one hour and stop on the hour two hours later, so the schedule covers
// 14:00-16:45 and the slots outside the window skip. The ingest deduplicates
// on the recording UUID, so this and the hourly job never announce a session
// twice.
const WINDOW_START_MIN = 14 * 60 + 15;
const WINDOW_END_MIN = 16 * 60;

/** True when `now` is inside 14:15-16:00 UTC, the 21:15-23:00 Saigon window. */
export function inTuesdayWindow(now: Date): boolean {
  const minute = now.getUTCHours() * 60 + now.getUTCMinutes();
  return minute >= WINDOW_START_MIN && minute <= WINDOW_END_MIN;
}

async function handler() {
  if (!inTuesdayWindow(new Date())) {
    return routineResult({ status: "skipped", reason: "outside the 21:15-23:00 Saigon window" });
  }
  return ingestHandler();
}

// Every scheduled run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request) => withRoutineRun("/api/cron/zoom-transcripts-tuesday/", req, handler);
