import { runInvariants } from "@/kernel/audit/invariants";
import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { saigonToday } from "@/kernel/config/dates";
import { deliveriesReachedSubscribers } from "@/kernel/events/deliveries";
import { subscribersOf } from "@/kernel/events/bus";
import { failureOf, notify, type NotifyResult } from "@/kernel/messaging/router";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs. A
 * kernel routine is in every deployment. Read as text by the generator.
 * @generator
 */
export const schedule = "15 23 * * *";

/**
 * What Settings -> Agents says about this routine (Y.14). Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "Event delivery watchdog",
  description: "Daily at 06:15 Vietnam time. Reads the last day's event deliveries and checks that every event reached every subscriber it has and that none failed. A broken result goes to Operations in one message.",
  content: ["Event deliveries"],
  apps: ["Supabase", "Lark"],
};

// Vercel cron: daily at 23:15 UTC, 06:15 in Vietnam, before the working day.
// The delivery watchdog (ADR 0027 rule 1, A.86). The bus writes one
// company_os.event_deliveries row per subscriber run, and this reads the last
// day of them through the Z.15.7 invariant, so an event nobody heard, or a
// handler that failed, is something Operations is told. It is the kernel's: it
// ran inside company-os's automation watchdog until A.86, and a deployment
// without company-os would have recorded deliveries nobody read.

const ROUTINE_ID = "/api/cron/event-deliveries/";

async function handler(): Promise<Response> {
  const results = await runInvariants([deliveriesReachedSubscribers(subscribersOf)]);
  const broken = results.filter((r) => !r.ok);
  let told: NotifyResult | null = null;
  if (broken.length > 0) {
    const lines = broken.map((r) => `- ${r.id} ${r.name}: ${r.detail}`).join("\n");
    // An ops alert through the router (Z.7), keyed on the day, so a second
    // run the same day repeats nothing.
    told = await notify({
      kind: "ops.alert",
      to: { chat: "ops" },
      message: `Event delivery watchdog: an event missed a subscriber or a delivery failed.\n${lines}\nRows: company_os.event_deliveries. Run log: Settings -> Agents.`,
      dedupeKey: `kernel:event-deliveries-broken:${saigonToday()}`,
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
      ...(told ? failureOf(told, "delivery alert", "tell Operations") : []),
    ],
  });
}

// Every run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request): Promise<Response> => withRoutineRun(ROUTINE_ID, req, handler);
