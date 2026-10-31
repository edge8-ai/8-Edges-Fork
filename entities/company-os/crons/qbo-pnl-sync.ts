import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import type { RoutineFailure } from "@/kernel/audit/routine-result";
import { syncQboPnl } from "@/entities/company-os/lib/qbo-pnl-sync";
import type { QboEntity } from "@/entities/company-os/lib/qbo";
import { saigonToday } from "@/kernel/config/dates";
import { failureOf, notify } from "@/kernel/messaging/router";

/**
 * The Vercel cron schedule this routine runs on: 06:00 UTC on the 3rd, after
 * the month's expenses are in (Dave, 2026-10-24). Read as text by
 * scripts/gen-deployment.mjs, so nothing imports it.
 * @generator
 */
export const schedule = "0 6 3 * *";

/**
 * What Settings -> Agents says about this routine. Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "QuickBooks P&L sync",
  description: "Monthly read-from-QBO mirror of the Profit and Loss by month for Edge8, every account from January 2024, rewritten each run. Never deletes.",
  content: ["QBO profit and loss"],
  apps: ["QuickBooks", "Supabase", "Lark"],
};

// Edge8 only, for the reason the invoice sync gives: the AIO connection holds
// Edge8's realm, so reading it would book Edge8's P&L twice.
const ENTITIES: QboEntity[] = ["edge8"];

async function handler(req: Request) {
  const results = [];
  for (const entity of ENTITIES) results.push(await syncQboPnl(entity));

  // A disconnected company degrades quietly; only a real API or database error alarms.
  const failed = results.filter((r) => !r.ok && r.error && !/not connected/i.test(r.error));
  const failures: RoutineFailure[] = failed.map((r) => ({ subject: r.entity, step: "P&L sync", error: r.error ?? "sync failed" }));
  for (const r of failed) {
    const warned = await notify({
      kind: "ops.alert",
      to: { chat: "ops" },
      message: `⚠️ QuickBooks (${r.entity}) P&L sync failed: ${r.error}. The P&L may be stale: ${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/team/finance/pnl`,
      dedupeKey: `company-os:qbo-pnl-sync-failed:${r.entity}:${saigonToday()}`,
    });
    failures.push(...failureOf(warned, r.entity, "warn Operations"));
  }
  return routineResult({ status: "ok", results, failures });
}

// Every scheduled run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request) => withRoutineRun("/api/cron/qbo-pnl-sync/", req, handler);
