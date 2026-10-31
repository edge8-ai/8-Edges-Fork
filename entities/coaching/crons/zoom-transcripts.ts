import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { ingestZoomCoachingSessions, type ZoomSessionHint } from "@/entities/coaching/lib/zoom-ingest";
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
  description: "Hourly. Writes each new group coaching session into meetings in two stages: Zoom's own summary and the card to the coaching Lark group as soon as Zoom has written it, then the transcript, our actionable summary and its action items once Zoom has processed the recording. Also puts each session's key learnings on its learning platform session. The Zoom webhook runs the same ingest the moment Zoom has either; this is the fallback.",
  content: ["Zoom cloud recordings", "Group coaching sessions"],
  apps: ["Zoom", "Supabase", "Claude", "Lark", "Learning platform"],
};

// Vercel cron (see vercel.json): hourly, at :40. Writes each new group
// coaching session (the weekly cohort call) into company_os.meetings in two
// stages (lib/zoom-ingest-write.ts): Zoom's own AI Companion summary, which
// exists within a minute of the call ending, with the card to the coaching
// Lark group linking /team/coaching-sessions; then the transcript, our own
// actionable summary and its action items once Zoom has processed the
// recording, which takes up to an hour. Dedup on the recording UUID and the
// stage on the row make every run idempotent, so a session is never written
// or announced twice.
//
// The Zoom webhook (api/webhooks/zoom) runs this same ingest the moment Zoom
// reports a summary or a transcript, with the meeting it names as a hint, so
// in the normal week the crons find everything already done. They stay as the
// fallback for a delivery Zoom never made: hourly here, and every 15 minutes
// after the Thursday session (zoom-transcripts-thursday).
//
// Before this route the same work was scripts/crm/zoom-ingest.mjs, run by hand
// from an operator's laptop after each session. Off entirely (a clean run with
// enabled: false) until ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET and
// ZOOM_HOST_EMAIL are set on the deployment.
export async function ingestHandler(hint?: ZoomSessionHint) {
  const result = await ingestZoomCoachingSessions(saigonToday(), await getSiteOrigin(), hint);
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
export const GET = (req: Request) => withRoutineRun("/api/cron/zoom-transcripts/", req, () => ingestHandler());
