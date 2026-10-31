import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { runLarkPickup } from "@/entities/coaching/lib/lark-pickup";
import { pullLinkedTranscripts } from "@/entities/coaching/lib/cycle-minutes";
import { saigonToday } from "@/entities/coaching";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs — an entity left out takes its crons with it.
 * Read as text by the generator, so nothing imports it.
 * @generator
 */
export const schedule = "0 15 * * *";

/**
 * What Settings -> Agents says about this routine (Y.14). Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "1-1 Lark pickup",
  description: "Nightly at 22:00 +07. Files each connected coach's own 1-1 recordings with transcript and recap, then reads every pasted 1-1 link whose transcript is not loaded, as the coach when connected and as the Edge8 app otherwise.",
  content: ["Coaches' Lark Minutes", "Linked 1-1 recordings", "1-1 transcripts"],
  apps: ["Lark", "Supabase", "Claude"],
};

// Vercel cron: daily 15:00 UTC = 22:00 Saigon, after the day's 1-1s, so a
// session held today has its recap drafted before tomorrow's 07:45 prep run.
// The one nightly 1-1 transcript job, in two steps and one run row:
//   1. the pickup: for every coach who connected Lark, it files that day's
//      (and any missed) 1-1 recordings with transcript and recap
//      (lib/lark-pickup.ts);
//   2. the linked pass (K.73, folded in here on 2026-10-08): every 1-1 with a
//      pasted Minutes link whose transcript is still not loaded is read, as
//      its coach when they connected Lark and as the app otherwise
//      (lib/cycle-minutes.ts). It runs second, so whatever the pickup just
//      loaded costs it nothing, and it starts no new row once this run has
//      used 180 of the route's 300 seconds.
// Auth is the standard Vercel Cron bearer.
async function handler() {
  const startedAt = Date.now();
  const today = saigonToday();
  const pickup = await runLarkPickup(today);
  const linked = await pullLinkedTranscripts(today, startedAt);
  // The headline counters come first and flat, because the Agents page's run
  // line is built from a body's top-level numbers; the two summaries follow
  // whole.
  const body = {
    picked: pickup.picked.length,
    transcriptsPulled: linked.transcriptsPulled,
    recapsDrafted: linked.recapsDrafted,
    notShared: linked.notShared,
    pickup,
    linked,
  };
  // A dead Lark connection or a transcript or recap that could not be saved is
  // a failure, even though the rest of the night's work went through (Y.88).
  // Inside a 200 it recorded ok and nobody heard; as an error, routine_runs
  // keeps the reason and a second night of it alerts Ops. Recordings that are
  // not ready or not shared yet are normal and stay ok.
  return routineResult({
    status: "ok",
    ...body,
    failures: [
      ...(pickup.errors ?? []).map((error) => ({ subject: "Lark pickup", step: "pickup", error })),
      ...linkedFailures(linked).map((error) => ({ subject: "Lark pickup", step: "linked pass", error })),
    ],
  });
}

function linkedFailures(linked: { failedSaves?: number; failedRecaps?: number }): string[] {
  const parts: string[] = [];
  if (linked.failedSaves) parts.push(`${linked.failedSaves} transcript${linked.failedSaves === 1 ? "" : "s"} not saved`);
  if (linked.failedRecaps) parts.push(`${linked.failedRecaps} recap${linked.failedRecaps === 1 ? "" : "s"} not drafted`);
  return parts.length > 0 ? [parts.join("; ")] : [];
}

// Every scheduled run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request) => withRoutineRun("/api/cron/coaching-lark-pickup/", req, handler);
