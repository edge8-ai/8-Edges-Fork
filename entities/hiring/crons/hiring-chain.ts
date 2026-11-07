import { driveAgents } from "@/kernel/audit/step-driver";
import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { hiringApplicationDriven, hiringRequisitionDriven } from "@/entities/hiring/lib/chain/run";
import { CHAIN_ROUTINE_ID } from "@/entities/hiring/lib/chain/steps";

/**
 * What Settings -> Agents says about this routine (Y.14). Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * `shadow: true`: the chain honours shadow mode (Z.17), so its switch offers
 * Live, Shadow and Off, and it starts in shadow (20261009200500).
 * @generator
 */
export const automation = {
  name: "Hiring chain",
  description: "One step of the hiring chain per row: screen an application, ask to open a requisition, propose a shortlist, draft a candidate message, send an approved one, record an approved hire or rejection. Every decision and every message waits on a holder of Hiring approver. In shadow it screens and proposes and drafts, and asks, sends and moves nothing. Driven by the Hiring driver every five minutes and by the requisition and application pages' buttons.",
  content: ["Applications", "Job requisitions", "Candidate messages", "Hiring shortlists", "Approvals"],
  apps: ["Supabase", "Anthropic", "Resend"],
  shadow: true,
};

// Not scheduled: every step of the chain is recorded under this routine id,
// whether the hiring driver or a person's button ran it, and this module is
// what puts the chain on Settings -> Agents with its own switch. A call by
// hand (the runbook's curl) runs one tick of the chain's steps, as the driver
// would; the steps it starts run in the mode this switch says.

async function handler(): Promise<Response> {
  const outcomes = await driveAgents([hiringRequisitionDriven, hiringApplicationDriven]);
  return routineResult({
    status: outcomes.length === 0 ? "skipped" : "ok",
    reason: outcomes.length === 0 ? "nothing in the hiring chain is at a step" : undefined,
    outcomes,
    failures: outcomes
      .filter((o) => o.action === "unread" || o.action === "gave-up")
      .map((o) => ({ subject: `${o.routineId} ${o.run}`, step: o.step, error: o.detail ?? o.action })),
  });
}

export const GET = (req: Request): Promise<Response> => withRoutineRun(CHAIN_ROUTINE_ID, req, handler);
