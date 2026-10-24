import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { ingestZoomCoachingSessions } from "@/entities/coaching/lib/zoom-ingest";
import { saigonToday } from "@/entities/coaching";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs — an entity left out takes its crons with it.
 * Read as text by the generator, so nothing imports it.
 * @generator
 */
export const schedule = "40 * * * *";

/**
 * What Settings -> Agents says about this routine (Y.14). Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "Group coaching transcripts",
  description: "Hourly. Pulls new Zoom cloud-recording transcripts of the group coaching sessions into meetings, writes an actionable summary with action items, posts a card to the coaching Lark group, and puts each session's key learnings on its learning platform session.",
  content: ["Zoom cloud recordings", "Group coaching sessions"],
  apps: ["Zoom", "Supabase", "Claude", "Lark", "Learning platform"],
};

// Vercel cron (see vercel.json): hourly, at :40. Pulls new Zoom cloud-recording
// transcripts of the group coaching sessions (the weekly cohort call) into
// company_os.meetings, writes our own actionable summary and action items, and
// posts a card to the coaching Lark group with a link to
// /team/coaching-sessions. Hourly rather than one weekly slot because
// Zoom finishes a transcript anywhere from minutes to an hour after the
// recording ends, and a fixed slot would miss the late ones; an hour with
// nothing new costs one Zoom list call. Dedup on the recording UUID makes every
// run idempotent, so a session is never ingested or announced twice.
//
// Before this route the same work was scripts/crm/zoom-ingest.mjs, run by hand
// from an operator's laptop after each session. Off entirely (a clean run with
// enabled: false) until ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET and
// ZOOM_HOST_EMAIL are set on the deployment. The Thursday burst
// (zoom-transcripts-thursday) runs this same handler every 15 minutes just
// after the weekly session, so the card lands minutes after Zoom finishes the
// transcript instead of up to an hour later.
export async function ingestHandler() {
  const result = await ingestZoomCoachingSessions(saigonToday(), await getSiteOrigin());
  // Off until the Zoom credentials are set: nothing was due, which is not a failure.
  if (!result.enabled) return routineResult({ ...result, status: "skipped", reason: result.reason ?? "Zoom is not configured" });
  // Each line the ingest collected (a dedup read, a summary, a write, a Lark post
  // that failed for one recording) names its recording; the lines carry the
  // recording's title and uuid, never a person (Y.19).
  return routineResult({
    status: "ok",
    ...result,
    failures: result.errors.map((error) => ({ subject: "Zoom recordings", step: "ingest", error })),
  });
}

// Every scheduled run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request) => withRoutineRun("/api/cron/zoom-transcripts/", req, ingestHandler);
