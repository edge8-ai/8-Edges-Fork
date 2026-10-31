import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { stateHeldFires } from "@/entities/quests/lib/fire-clock";
import { runQuestClock } from "@/entities/quests/lib/quest-clock";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs. Read as text by the generator.
 * @generator
 */
export const schedule = "*/10 * * * *";

/**
 * What Settings -> Agents says about this routine (Y.14). Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "Quest clock",
  description: "Every ten minutes. Closes each Bounty head whose due time has passed, marks Missed only the people a close owes one, and closes a quest with its last head. Two hours before a head is due, sends each person still out on it one private email and Lark DM, once per person per head. States each fire held once its session has ended, so the Host's ladder climbs.",
  content: ["Quests"],
  apps: ["Supabase", "Resend", "Lark"],
};

// QS.2. The clock that the page's "a head past its due time reads as closed"
// stood in for until now. Quests owns the rows, so it decides and writes them
// (lib/quest-clock.ts, lib/clock-rules.ts) and states the facts; its own
// subscriber sends the reminders (lib/quest-messages.ts). Each tick also
// states the fires held since the last one (lib/fire-clock.ts, ADR 0023),
// after the Bounties and whatever they did.
const ROUTINE_ID = "/api/cron/quest-clock/";

async function handler(): Promise<Response> {
  const now = new Date();
  const run = await runQuestClock(now);
  const fires = await stateHeldFires(now);
  const failures = [...run.failures, ...fires.failures];
  const acted = run.closedHeads + run.closedQuests + run.reminded + fires.held > 0;
  return routineResult({
    status: acted || failures.length > 0 ? "ok" : "skipped",
    reason: acted ? undefined : "no head was due to close or to be reminded, and no fire was held",
    closedHeads: run.closedHeads,
    missed: run.missed,
    closedQuests: run.closedQuests,
    reminded: run.reminded,
    firesHeld: fires.held,
    failures,
  });
}

// Every run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request): Promise<Response> => withRoutineRun(ROUTINE_ID, req, handler, "vercel", { stepSeconds: 60 });
