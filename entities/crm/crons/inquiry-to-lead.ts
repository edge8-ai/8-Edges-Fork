import { driveAgents } from "@/kernel/audit/step-driver";
import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { chainIsOff, inquiryDriven, inquiryDrivenWhileOff } from "@/entities/crm/lib/inquiry-chain";
import { DUE_PER_TICK, INQUIRY_CHAIN_ROUTINE_ID } from "@/entities/crm/lib/inquiry-chain-types";
import { countWaitingInquiryRuns } from "@/entities/crm/lib/inquiry-triage-view";

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
  name: "Inquiry to lead",
  description: "Every five minutes. Advances each contact-form inquiry's run by one step: qualify (one model read of the message against the contact page's fit), file (a sales inquiry to the Leads queue with its company linked, spam held on the Inquiries board, a job seeker or vendor kept there, a current client named to the deal owner), notify (one line to the Operations chat). Until this switch is set to Live by a person, every inquiry takes the path it always took and the chain only records what it would have done. Off stops new inquiries reaching the chain; the ones it already took Live still finish.",
  content: ["Inquiries", "People", "Companies", "Deals", "Leads", "Inquiry triage", "Routine runs (this page)"],
  apps: ["Supabase", "Anthropic", "Lark"],
  shadow: true,
};

// Vercel cron: every five minutes. The tick driver (ADR 0015) advances every
// inquiry run at a step by one step, at most twenty per tick, each recorded
// under this routine with the step's tick. A step that keeps failing is backed
// off and, after three attempts, falls back (qualify) or stops (file, notify).
// Most ticks find nothing to do; the run says so.
//
// Off is the chain's to interpret, so the schedule runs it whatever the switch
// says: Off stops the contact route handing new inquiries over, and here it
// drives only the runs already opened Live, which the route left to the chain
// without promoting or posting. Runs opened in shadow wait.

async function handler(): Promise<Response> {
  const off = await chainIsOff();
  const outcomes = await driveAgents([off ? inquiryDrivenWhileOff : inquiryDriven]);
  const count = (action: string) => outcomes.filter((o) => o.action === action).length;
  // A bot wave cannot spend more than twenty model calls a tick; the rest wait
  // for the next one, and the run says how many.
  const waiting = outcomes.length >= DUE_PER_TICK ? Math.max(0, (await countWaitingInquiryRuns()) - DUE_PER_TICK) : 0;
  return routineResult({
    status: outcomes.length === 0 ? "skipped" : "ok",
    reason: outcomes.length === 0 ? (off ? "off: no run opened Live is waiting" : "no inquiry run is at a step") : undefined,
    off,
    advanced: count("advanced"),
    waiting: count("waiting"),
    gaveUp: count("gave-up"),
    beyondThisTick: waiting,
    outcomes,
    failures: outcomes
      .filter((o) => o.action === "unread" || o.action === "gave-up")
      .map((o) => ({ subject: `${o.routineId} ${o.run}`, step: o.step, error: o.detail ?? o.action })),
  });
}

// Every tick is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request): Promise<Response> => withRoutineRun(INQUIRY_CHAIN_ROUTINE_ID, req, handler, "vercel", { honourPause: false });
