import { getWorkboard } from "@/entities/boards";
import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { driveAgents } from "@/kernel/audit/step-driver";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { clientStatusDriven, type ClientStatusDeps } from "../lib/client-status/run-step";

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
  name: "Client status driver",
  description: "Every five minutes. Advances every weekly client status report that is at a step by one step: gather, draft and check. A page that passes the check is the account owner's draft on the client's Weekly status page; nothing is asked for approval or released. Each step is recorded on the Weekly client status row here. A step that keeps failing is backed off and, after three attempts, the report stops with the reason on its Weekly status page.",
  content: ["Client status reports", "Client boards", "Client roadmaps", "Routine runs (this page)"],
  apps: ["Supabase", "Anthropic", "Lark"],
};

// Vercel cron: every five minutes. The tick driver (ADR 0015) for the weekly
// client status run (Z.12): its own route in client-programs (spec decision 7:
// one scheduled route per entity). Most ticks find nothing to do and say so.

const ROUTINE_ID = "/api/cron/client-status-driver/";

// The board is read through the boards entity, which a cron may import and this
// entity's lib may not; the run takes it as a dependency.
const deps: ClientStatusDeps = {
  readBoard: (companyId) => getWorkboard({ scope: { kind: "companies", ids: [companyId] }, clientSafe: true }),
  origin: getSiteOrigin,
};

async function handler(): Promise<Response> {
  const outcomes = await driveAgents([clientStatusDriven(deps)]);
  const count = (action: string) => outcomes.filter((o) => o.action === action).length;
  return routineResult({
    status: outcomes.length === 0 ? "skipped" : "ok",
    reason: outcomes.length === 0 ? "no report is at a step" : undefined,
    advanced: count("advanced"),
    waiting: count("waiting"),
    gaveUp: count("gave-up"),
    outcomes,
    // A run the driver could not read, or one it gave up on, is a failure of
    // this tick; a step that ran and failed is the step's own run.
    failures: outcomes
      .filter((o) => o.action === "unread" || o.action === "gave-up")
      .map((o) => ({ subject: `${o.routineId} ${o.run}`, step: o.step, error: o.detail ?? o.action })),
  });
}

// Every tick is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request): Promise<Response> => withRoutineRun(ROUTINE_ID, req, handler);
