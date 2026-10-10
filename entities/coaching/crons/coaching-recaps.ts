import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { draftNextPendingRecap } from "@/entities/coaching/lib/recap-drafter";
import { saigonToday } from "@/entities/coaching";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs — an entity left out takes its crons with it.
 * Read as text by the generator, so nothing imports it.
 * @generator
 */
export const schedule = "0 9 * * 3";

/**
 * What Settings -> Agents says about this routine (Y.14). Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "Coaching recaps",
  description: "Hourly. Drafts the recap for one held 1-1 that has a transcript and no summary. Summarising is an Opus job, kept off the daily cycle on purpose.",
  content: ["1-1 transcripts"],
  apps: ["Supabase", "Lark", "Claude"],
};

// Vercel cron (see vercel.json): weekly, Wednesday 16:00 Asia/Ho_Chi_Minh
// (09:00 UTC). Drafts the recap for ONE held 1-1
// that has a transcript and no summary, whichever route put the transcript
// there — the 22:00 coaching-lark-pickup job, a paste into the coach page, or the
// lark-cli scheduled task on Dave's machine writing straight to company_os.
//
// Separate from /api/cron/coaching-cycle on purpose. Summarising is an Opus
// call over a long transcript, so the daily pass cannot absorb it inside its
// own 300s budget. One recap per run, on the Wednesday planning slot; an
// out-of-cycle 1-1 gets its recap by the coach requesting it on the coach page.
//
// The coach is emailed and DMed per draft. Publishing to the member stays a
// deliberate human act on the coach page — this route never publishes.
async function handler(req: Request) {
  const result = await draftNextPendingRecap(saigonToday());
  // A transcript the model could not summarise used to ride as `error` inside a
  // 200, which recorded ok. It is the 1-1's failure, named by the 1-1's id and
  // never the member's name (Y.19).
  return routineResult({
    status: "ok",
    ...result,
    failures: result.error ? [{ subject: `1-1 ${result.meetingId ?? "unknown"}`, step: "summarise transcript", error: result.error }] : [],
  });
}

// Every scheduled run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request) => withRoutineRun("/api/cron/coaching-recaps/", req, handler);
