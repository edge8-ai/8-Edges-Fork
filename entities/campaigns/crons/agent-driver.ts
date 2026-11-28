import { driveAgents } from "@/kernel/audit/step-driver";
import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { letterDriven } from "@/entities/campaigns/lib/letter/run-step";
import { writerDriven } from "@/entities/campaigns/lib/writer/run-step";

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
  name: "Agent driver",
  description: "Every five minutes. Advances every writer and letter agent run that is at a step by one step, each recorded on its agent's row here. A step that keeps failing is backed off and, after three attempts, the run is stopped with the reason on its campaign.",
  content: ["Marketing campaigns", "Email campaigns", "Routine runs (this page)"],
  apps: ["Supabase"],
};

// Vercel cron: every five minutes. The tick driver (Y.12, ADR 0015) for the
// writer and letter agents: every run that is at a step advances by one step,
// recorded under the agent's own routine id with the step's tick, so a step a
// person is running from a button is never run twice and Settings -> Agents
// shows each step with its tokens. A step that keeps failing is backed off and,
// after three attempts, stopped with the reason on the campaign. Most ticks
// find nothing to do; the run says so in one line.

const ROUTINE_ID = "/api/cron/agent-driver/";

async function handler(): Promise<Response> {
  const outcomes = await driveAgents([writerDriven, letterDriven]);
  const count = (action: string) => outcomes.filter((o) => o.action === action).length;
  return routineResult({
    status: outcomes.length === 0 ? "skipped" : "ok",
    reason: outcomes.length === 0 ? "no run is at a step" : undefined,
    advanced: count("advanced"),
    waiting: count("waiting"),
    gaveUp: count("gave-up"),
    outcomes,
    // A run the driver could not read, or one it gave up on, is a failure of
    // this tick; a step that ran and failed its own check is the step's run.
    failures: outcomes
      .filter((o) => o.action === "unread" || o.action === "gave-up")
      .map((o) => ({ subject: `${o.routineId} ${o.run}`, step: o.step, error: o.detail ?? o.action })),
  });
}

// Every tick is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request): Promise<Response> => withRoutineRun(ROUTINE_ID, req, handler);
