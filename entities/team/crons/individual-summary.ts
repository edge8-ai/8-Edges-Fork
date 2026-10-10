import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { larkOpenIdByEmail, sendLarkDm } from "@/kernel/messaging/lark-api";
import { larkDmOptedOut } from "@/kernel/messaging/dm-preference";
import { gatherIndividualSummaries, summaryDm } from "@/entities/team/lib/individual-summary";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs — an entity left out takes its crons with it.
 * Read as text by the generator, so nothing imports it.
 * @generator
 */
export const schedule = "0 9 * * 2";

/**
 * What Settings -> Agents says about this routine (Y.14). Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "Individual summary",
  description: "Tuesdays at 16:00 Vietnam time. Sends each active Product, Operations and EO member a Lark message with their own week on the board: their latest 1-1, ideas, and backlog, doing and completed counts. Honours each person's DM opt-out.",
  content: ["Workboard cards", "1-1s", "Ideas", "Team directory"],
  apps: ["Supabase", "Lark"],
};

// Vercel cron (see vercel.json): weekly, Tuesday 09:00 UTC (16:00
// Asia/Ho_Chi_Minh). DMs each active, non-contract Product, Operations and EO
// member their own week on the board: whether their most recent 1-1 is
// recorded, whether they submitted an idea, and their backlog / doing /
// completed card counts. An operational digest to the person themselves, the
// same spirit as the daily check-in. sendLarkDm honours each person's DM
// opt-out, so a miss is one person, never the run.

const ROUTINE_ID = "/api/cron/individual-summary/";

async function handler(): Promise<Response> {
  const summaries = await gatherIndividualSummaries();
  let sent = 0;
  let optedOut = 0;
  let noEmail = 0;
  let notInLark = 0;
  const failures: { subject: string; step: string; error: string }[] = [];
  for (const s of summaries) {
    if (!s.email) {
      noEmail++;
      continue;
    }
    if (await sendLarkDm(s.email, summaryDm(s), { category: "workboard" })) {
      sent++;
    } else if (await larkDmOptedOut(s.email)) {
      // The person asked for no DMs, so a refusal is the answer they chose, not a failure.
      optedOut++;
    } else if (!(await larkOpenIdByEmail(s.email))) {
      // No Lark user at that address: a fact about the person's accounts that
      // holds every week, not a failure of this run. Failing it would turn the
      // routine red every Tuesday and alert Ops about nothing they can fix here.
      notInLark++;
    } else {
      // The person is in Lark and wants DMs, and the send still did not land:
      // Lark refused it or is unreachable. It used to be counted by its absence
      // from `sent`; now the run names the person by id (Y.21).
      failures.push({ subject: `person ${s.personId}`, step: "Lark DM", error: "the Lark message was not delivered" });
    }
  }
  return routineResult({ status: summaries.length === 0 ? "skipped" : "ok", reason: summaries.length === 0 ? "no active members to summarise" : undefined, people: summaries.length, sent, optedOut, noEmail, notInLark, failures });
}

export const GET = (req: Request): Promise<Response> => withRoutineRun(ROUTINE_ID, req, handler);
