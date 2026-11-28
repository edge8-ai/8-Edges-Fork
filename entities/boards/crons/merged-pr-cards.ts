import { failuresFrom, routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { landCardsWithMergedStamps } from "@/entities/boards/lib/pr-done";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs. Read as text by the generator.
 * @generator
 */
export const schedule = "15 2 * * 1-5";

/**
 * What Settings -> Agents says about this routine (Y.14). Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "Merged PR cards",
  description: "Weekdays at 09:15. Moves an open card to Done when the PR it links has merged and its last subtask or blocker has since closed, the same move the nightly PR sync makes. A card a person moved back after that move stays where they put it.",
  content: ["Board cards"],
  apps: ["Supabase"],
};

// Vercel cron: weekdays 02:15 UTC (09:15 Asia/Ho_Chi_Minh). Z.22: the nightly
// PR sync lands a card when it names the card's merged PR, but names each PR
// once, and passes by a card whose subtasks were still open that night. This
// reads the merged stamps the sync left on the cards and lands the ones whose
// children have closed since (pr-done.ts says why the stamp, not an event).
// Landing a card publishes `board.card.completed`, which reaches people through
// their inbox and the notification router, so the run sits inside the team's
// working window (WORKING_HOURS in kernel/messaging/business-hours.ts).

const ROUTINE_ID = "/api/cron/merged-pr-cards/";

async function handler(): Promise<Response> {
  // A failed read throws, and the run is recorded as an error rather than as
  // a quiet morning with nothing to land.
  const report = await landCardsWithMergedStamps();
  return routineResult({
    status: report.landed === 0 && report.failed.length === 0 ? "skipped" : "ok",
    reason: report.landed === 0 && report.failed.length === 0 ? "no open card with a merged PR has all its subtasks closed" : undefined,
    landed: report.landed,
    waiting: report.waiting,
    failures: failuresFrom(report.failed, "landing", "merged PR cards"),
  });
}

// Every run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request): Promise<Response> => withRoutineRun(ROUTINE_ID, req, handler, "vercel", { stepSeconds: 60 });
