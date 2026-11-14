import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { draftNextPendingRecap } from "@/entities/coaching/lib/recap-drafter";
import { publishDueRecaps } from "@/entities/coaching/lib/data/recap-publish";
import { saigonToday } from "@/entities/coaching";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs — an entity left out takes its crons with it.
 * Read as text by the generator, so nothing imports it.
 * @generator
 */
export const schedule = "0 * * * *";

/**
 * What Settings -> Agents says about this routine (Y.14). Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "Coaching recaps",
  description: "Hourly. Drafts the recap for one held 1-1 that has a transcript and no summary, then publishes every shared recap its coach has left untouched for 24 hours, with one Lark line to the coachee.",
  content: ["1-1 transcripts"],
  apps: ["Supabase", "Lark", "Claude"],
};

// Vercel cron (see vercel.json): hourly, on the hour (L.18.2; it was weekly,
// Wednesday 16:00 Saigon, while its description already said hourly). Two
// steps.
//
// First it drafts the recap for ONE held 1-1 that has a transcript and no
// summary, whichever route put the transcript there: the 22:00
// coaching-lark-pickup job, a paste into the coach page, or the lark-cli
// scheduled task on Dave's machine writing straight to company_os. Summarising
// is an Opus call over a long transcript, so the daily pass cannot absorb it
// inside its own 300s budget; one per run clears a backlog a 1-1 an hour. The
// coach is emailed and DMed per draft.
//
// Then it publishes every written shared recap the coach has not touched for 24
// hours (decided by Dave on 14 Oct: no coachee waits more than a day), through
// the same write and notice as the coach's Publish button, with one audit row
// each. There is no hold; an edit restarts the 24 hours.
async function handler(req: Request) {
  const result = await draftNextPendingRecap(saigonToday());
  const publish = await publishDueRecaps();
  // A transcript the model could not summarise used to ride as `error` inside a
  // 200, which recorded ok. It is the 1-1's failure, named by the 1-1's id and
  // never the member's name (Y.19).
  return routineResult({
    status: "ok",
    ...result,
    published: publish.published,
    failures: [
      ...(result.error ? [{ subject: `1-1 ${result.meetingId ?? "unknown"}`, step: "summarise transcript", error: result.error }] : []),
      ...publish.failures,
    ],
  });
}

// Every scheduled run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request) => withRoutineRun("/api/cron/coaching-recaps/", req, handler);
