import { driveAgents } from "@/kernel/audit/step-driver";
import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { discover, proposalDriven } from "@/entities/crm/lib/proposal-chain";
import { PROPOSAL_ROUTINE_ID } from "@/entities/crm/lib/proposal-types";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs. Read as text by the generator.
 * @generator
 */
export const schedule = "*/5 * * * *";

/**
 * What Settings -> Agents says about this routine (Y.14, Z.17). Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "Proposal chain",
  description: "Every five minutes. Opens a run for each new sales call with a summary, then advances every proposal run by one step: gather the call, extract what it said, draft the proposal, ask the Revenue approver, publish the approved version to the client's portal, record it. Each step is a row here. Until this switch is set to Live by a person, every run is a shadow draft: nothing is asked for, sent or published.",
  content: ["Meetings", "Call transcripts", "Companies", "Deals", "Proposal drafts", "Approvals", "Routine runs (this page)"],
  apps: ["Supabase", "Anthropic", "Lark"],
  shadow: true,
};

// Vercel cron: every five minutes. Discovery opens a proposal_drafts row for
// each due sales meeting (the unique company and meeting makes a second open a
// no-op), then the tick driver (ADR 0015) advances every run at a step by one
// step, each recorded under this routine with the step's tick. A step that
// keeps failing is backed off and, after three attempts, the run stops with
// the reason on its row. Most ticks find nothing to do; the run says so.

async function handler(): Promise<Response> {
  const opened = await discover();
  const outcomes = await driveAgents([proposalDriven]);
  const count = (action: string) => outcomes.filter((o) => o.action === action).length;
  return routineResult({
    status: opened === 0 && outcomes.length === 0 ? "skipped" : "ok",
    reason: opened === 0 && outcomes.length === 0 ? "no sales call is due and no run is at a step" : undefined,
    opened,
    advanced: count("advanced"),
    waiting: count("waiting"),
    gaveUp: count("gave-up"),
    outcomes,
    failures: outcomes
      .filter((o) => o.action === "unread" || o.action === "gave-up")
      .map((o) => ({ subject: `${o.routineId} ${o.run}`, step: o.step, error: o.detail ?? o.action })),
  });
}

// Every tick is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request): Promise<Response> => withRoutineRun(PROPOSAL_ROUTINE_ID, req, handler);
