import { driveAgents } from "@/kernel/audit/step-driver";
import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { deliverOutbox } from "@/kernel/events";
import { hiringApplicationDriven, hiringRequisitionDriven, sweepDecidedByHand } from "@/entities/hiring/lib/chain/run";
import { DRIVER_ROUTINE_ID } from "@/entities/hiring/lib/chain/steps";

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
  name: "Hiring driver",
  description: "Every five minutes. Advances every requisition and application in the hiring chain that is at a step by one step, each recorded on the Hiring chain row, and delivers any hire the decision recorded but did not announce. A step that keeps failing is backed off and, after three attempts, stopped with the reason on its requisition or application.",
  content: ["Job requisitions", "Applications", "Candidate messages", "Hiring shortlists", "Approvals", "Event outbox"],
  apps: ["Supabase"],
};

// Vercel cron: every five minutes. The tick driver (ADR 0015) for the hiring
// chain (Z.9): every requisition and application at a step advances by one
// step, recorded under /api/cron/hiring-chain/ with the step's tick, so a
// step a person runs from a button is never run twice. The chain's own switch
// decides each step's mode (live, shadow, off); this route sends nothing
// itself. Then the outbox: a hire the deciding step recorded but could not
// announce (the process died, the bus failed) is announced here.

async function handler(): Promise<Response> {
  // First, applications a person decided by hand leave the chain, so no step
  // below drafts or sends anything for them (review finding 1).
  let swept = 0;
  let sweepError: string | null = null;
  try {
    swept = await sweepDecidedByHand();
  } catch (err) {
    sweepError = err instanceof Error ? err.message : String(err);
  }
  const outcomes = await driveAgents([hiringRequisitionDriven, hiringApplicationDriven]);
  const outbox = await deliverOutbox();
  const count = (action: string) => outcomes.filter((o) => o.action === action).length;
  const idle = outcomes.length === 0 && outbox.published === 0 && outbox.failed === 0 && outbox.exhausted === 0 && swept === 0 && !sweepError;
  return routineResult({
    status: idle ? "skipped" : "ok",
    reason: idle ? "nothing in the hiring chain is at a step" : undefined,
    advanced: count("advanced"),
    waiting: count("waiting"),
    gaveUp: count("gave-up"),
    outcomes,
    swept,
    outbox: { published: outbox.published, failed: outbox.failed, exhausted: outbox.exhausted },
    failures: [
      ...outcomes
        .filter((o) => o.action === "unread" || o.action === "gave-up")
        .map((o) => ({ subject: `${o.routineId} ${o.run}`, step: o.step, error: o.detail ?? o.action })),
      ...outbox.errors.map((e) => ({ subject: "event_outbox", step: "deliver", error: e })),
      // A row out of attempts is never retried; it fails every tick until a person looks.
      ...(outbox.exhausted > 0
        ? [{ subject: "event_outbox", step: "exhausted", error: `${outbox.exhausted} event(s) ran out of delivery attempts and are not retried; read company_os.event_outbox where published_at is null.` }]
        : []),
      ...(sweepError ? [{ subject: "applications", step: "sweep", error: sweepError }] : []),
    ],
  });
}

// Every tick is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request): Promise<Response> => withRoutineRun(DRIVER_ROUTINE_ID, req, handler);
