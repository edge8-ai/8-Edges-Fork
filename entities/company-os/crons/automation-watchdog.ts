import { letterReachedReady } from "@/entities/campaigns";
import { salesCallsHaveProposals } from "@/entities/crm";
import { inquiriesReachedTheChain } from "@/entities/crm";
import { callsCarryACost, siteModelsMatch } from "@/kernel/ai/site-model-invariant";
import { deliveriesReachedSubscribers, subscribersOf } from "@/kernel/events";
import {
  errorRunsHaveAReason,
  routinesRanLastSlot,
  runInvariants,
  type Invariant,
} from "@/kernel/audit/invariants";
import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { emailLinksAreWhole } from "@/kernel/messaging/email-link-invariant";
import { saigonToday } from "@/kernel/config/dates";
import { failureOf, notify, type NotifyResult } from "@/kernel/messaging/router";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs. Read as text by the generator.
 * @generator
 */
export const schedule = "30 23 * * *";

/**
 * What Settings -> Agents says about this routine (Y.14). Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "Automation watchdog",
  description: "Daily at 06:30 Vietnam time. Checks what the routines actually did: every error run names its error, every scheduled routine ran in its last slot, every AI call carries a cost and called the model it should, and the weekly letter reached ready. Anything broken goes to Operations in one message.",
  content: ["Routine runs (this page)", "AI calls", "Email campaigns"],
  apps: ["Supabase", "Lark"],
};

// Vercel cron: daily at 23:30 UTC, 06:30 in Vietnam, so a broken invariant is
// in the Operations chat before the working day. The automation watchdog
// (Z.15, plan Part G7) checks what the routines actually did, not what they
// said: each invariant is a read with an expected answer. A broken one is
// named in one Ops note and makes this run an error, so the run log keeps it
// and a second day of it alerts again through the failure streak. The weekly
// client status check (Z.15.2) runs beside the run it checks, in the
// client-programs entity (crons/client-status-check), two hours after it opens.

const ROUTINE_ID = "/api/cron/automation-watchdog/";

/** The invariants this deployment checks, in plan order. */
export function invariants(): Invariant[] {
  return [
    errorRunsHaveAReason(),
    routinesRanLastSlot([ROUTINE_ID]),
    callsCarryACost(),
    siteModelsMatch(),
    letterReachedReady(),
    deliveriesReachedSubscribers(subscribersOf),
    emailLinksAreWhole(),
    salesCallsHaveProposals(),
    inquiriesReachedTheChain(),
  ];
}

async function handler(): Promise<Response> {
  const results = await runInvariants(invariants());
  const broken = results.filter((r) => !r.ok);
  let told: NotifyResult | null = null;
  if (broken.length > 0) {
    const lines = broken.map((r) => `- ${r.id} ${r.name}: ${r.detail}`).join("\n");
    // An ops alert through the router (Z.7): urgent, so it goes at 06:30 as
    // before. Keyed on the day and the set broken, so a second run the same
    // day repeats nothing, while a different invariant breaking is news.
    told = await notify({
      kind: "ops.alert",
      to: { chat: "ops" },
      message: `Automation watchdog: ${broken.length} of ${results.length} invariants broken.\n${lines}\nRun log: Settings -> Agents.`,
      dedupeKey: `company-os:watchdog-broken:${saigonToday()}:${broken.map((r) => r.id).sort().join(",")}`,
    });
  }
  return routineResult({
    status: "ok",
    checked: results.length,
    broken: broken.length,
    opsNotified: told === null ? null : told.status === "sent",
    results,
    failures: [
      ...broken.map((r) => ({ subject: r.id, step: r.name, error: r.detail })),
      ...(told ? failureOf(told, "watchdog alert", "tell Operations") : []),
    ],
  });
}

// Every run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request): Promise<Response> => withRoutineRun(ROUTINE_ID, req, handler);
