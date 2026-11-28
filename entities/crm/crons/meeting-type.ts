import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { typeUntypedMeetings } from "@/entities/crm/lib/meeting-type";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs. Read as text by the generator.
 * @generator
 */
export const schedule = "25 * * * *";

/**
 * What Settings -> Agents says about this routine. Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "Meeting type",
  description: "Hourly. Types each meeting that landed without a type, at most twenty a run: a transcript tagged sales is Sales; otherwise one model read of the transcript's opening chooses Sales or AI Program Review for a client call, and any type for the rest. A meeting with no transcript is typed from its title alone, and one with neither is left untyped. It only fills a blank, never changes a type a person set, and audits every change. Meetings booked counts the Sales meetings it types.",
  content: ["Meetings", "Call transcripts", "Audit log"],
  apps: ["Supabase", "Anthropic"],
};

// Hourly at :25. Most runs find nothing untyped and say so; a failed read
// throws, so Settings -> Agents shows a failed run rather than an empty one.
async function handler(): Promise<Response> {
  const outcomes = await typeUntypedMeetings();
  const typed = outcomes.filter((o) => o.action === "typed");
  return routineResult({
    status: outcomes.length === 0 ? "skipped" : "ok",
    reason: outcomes.length === 0 ? "no untyped meeting" : undefined,
    typed: typed.length,
    byTag: typed.filter((o) => o.by === "tag").length,
    byModel: typed.filter((o) => o.by === "model").length,
    skipped: outcomes.filter((o) => o.action === "skipped").length,
    outcomes,
    failures: outcomes.flatMap((o) => (o.action === "failed" ? [{ subject: `meeting ${o.id}`, step: "type", error: o.error }] : [])),
  });
}

// Every run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request): Promise<Response> => withRoutineRun("/api/cron/meeting-type/", req, handler);
