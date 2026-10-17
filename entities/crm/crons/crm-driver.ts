import { driveAgents } from "@/kernel/audit/step-driver";
import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { expireUndecided, meetingActionsDriven, openReadyRuns } from "@/entities/crm/lib/meeting-actions/run";
import { dismissArchivedMeetingActions } from "@/entities/crm/lib/meeting-actions/filing";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs. Read as text by the generator.
 * @generator
 */
export const schedule = "*/5 * * * *";

/**
 * What Settings -> Agents says about this routine (Y.14). Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "CRM driver",
  description: "Every five minutes. Opens a meeting follow-up run for up to five client meetings whose summary is ready, advances every run that is at a step by one step (each recorded on the Meeting follow-up row), expires a draft nobody decided within seven days, unsent, and sets aside the waiting actions of an archived meeting.",
  content: ["Meetings", "Meeting follow-ups", "Meeting action items", "Approvals", "Routine runs (this page)"],
  apps: ["Supabase", "Anthropic", "Resend", "Lark"],
  shadow: true,
};

// Vercel cron: every five minutes. The crm entity's tick driver (ADR 0015).
// It opens runs for ready client meetings (spec section 2), then drives every
// run at a step by one step through driveAgents, each recorded under the
// meeting-actions routine id with the step's tick, so a step a person is
// running from the meeting page is never run twice. The chain's own switch is
// that routine's: in shadow every step records what it would have done and
// sends nothing. Most ticks find nothing to do and say so in one line.

const ROUTINE_ID = "/api/cron/crm-driver/";

async function handler(): Promise<Response> {
  const opening = await openReadyRuns();
  const expiry = await expireUndecided();
  const dismissed = await dismissArchivedMeetingActions();
  const outcomes = await driveAgents([meetingActionsDriven]);
  const count = (action: string) => outcomes.filter((o) => o.action === action).length;
  const idle = outcomes.length === 0 && opening.opened.length === 0 && expiry.expired.length === 0 && dismissed === 0;
  return routineResult({
    status: idle && expiry.failures.length === 0 ? "skipped" : "ok",
    reason: idle ? (opening.skipped ?? "no meeting is ready and no run is at a step") : undefined,
    opened: opening.opened.length,
    expired: expiry.expired.length,
    dismissed,
    advanced: count("advanced"),
    waiting: count("waiting"),
    gaveUp: count("gave-up"),
    outcomes,
    // A run the driver could not read, one it gave up on, or a draft it could
    // not expire is a failure of this tick; a step that ran and failed its own
    // check is the step's run.
    failures: [
      ...outcomes
        .filter((o) => o.action === "unread" || o.action === "gave-up")
        .map((o) => ({ subject: `${o.routineId} ${o.run}`, step: o.step, error: o.detail ?? o.action })),
      ...expiry.failures.map((f) => ({ subject: `meeting follow-up ${f.id}`, step: "expire", error: f.error })),
    ],
  });
}

// Every tick is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request): Promise<Response> => withRoutineRun(ROUTINE_ID, req, handler);
