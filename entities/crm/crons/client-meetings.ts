import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { fileClientMeetings } from "@/entities/crm/lib/client-meetings-filing";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs. Read as text by the generator.
 * @generator
 */
export const schedule = "30 22 * * *";

/**
 * What Settings -> Agents says about this routine. Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "Client meetings",
  description: "Daily at 05:30 GMT+7, after the Mac mini's nightly Lark sync. Puts every client's meetings on their portal, published: each client with an active AI program gets its own slice of the internal Weekly Sprint Planning call (only their part, written for them, nothing when they were not discussed), and a direct client call such as a weekly sync becomes that client's meeting with its summary. Looks back eight days and never files a client's meeting twice.",
  content: ["Call transcripts", "Meetings", "AI programs"],
  apps: ["Supabase", "Anthropic"],
};

// 22:30 UTC = 05:30 GMT+7, an hour after the Mac mini's 03:30 sync lands the
// day's Lark transcripts in call_transcripts.
async function handler(): Promise<Response> {
  const out = await fileClientMeetings();
  const idle = out.filed.length === 0 && out.failures.length === 0;
  return routineResult({
    status: idle ? "skipped" : "ok",
    reason: idle ? "no new client meeting in the last eight days" : undefined,
    filed: out.filed.length,
    meetings: out.filed,
    notDiscussed: out.skipped,
    failures: out.failures,
  });
}

// Every tick is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request): Promise<Response> => withRoutineRun("/api/cron/client-meetings/", req, handler);
