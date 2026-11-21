import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { flushNotifications } from "@/kernel/messaging/notification-flush";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs. Read as text by the generator.
 * @generator
 */
export const schedule = "0 2-10 * * 1-5";

/**
 * What Settings -> Agents says about this routine (Y.14). Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "Notification flush",
  description: "Working mornings at 09:00 Saigon time, then hourly until 17:00. Sends the Lark notices the notification router held through quiet hours, and each recipient's morning digest as one message, each claimed once in the effect ledger so a retry never sends twice. In shadow it records what it would have sent and leaves the queue as it is.",
  content: ["Notification queue", "Automation effects"],
  apps: ["Supabase", "Lark"],
  shadow: true,
};

// Vercel cron: 02:00 to 10:00 UTC on weekdays, which is 09:00 to 17:00 in
// Saigon. The first run sends what waited overnight and the morning digests;
// the hourly runs retry a send that failed, and send nothing twice because
// every send claims its key first (Z.7). The kernel holds the logic
// (kernel/messaging/notification-flush.ts); this entity only mounts it, as
// it mounts the routine reaper.

const ROUTINE_ID = "/api/cron/notification-flush/";

async function handler(): Promise<Response> {
  const out = await flushNotifications();
  const idle = out.due === 0 && out.failures.length === 0;
  return routineResult({
    status: idle ? "skipped" : "ok",
    reason: idle ? "nothing in the notification queue is due" : undefined,
    due: out.due,
    sent: out.sent,
    digests: out.digests,
    skipped: out.skipped,
    carried: out.carried,
    shadow: out.shadow,
    failures: out.failures,
  });
}

// Every run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request): Promise<Response> => withRoutineRun(ROUTINE_ID, req, handler);
