import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import type { RoutineFailure } from "@/kernel/audit/routine-result";
import { syncQboInvoices } from "@/entities/company-os/lib/qbo-invoice-sync";
import type { QboEntity } from "@/entities/company-os/lib/qbo";
import { saigonToday } from "@/kernel/config/dates";
import { failureOf, notify } from "@/kernel/messaging/router";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs — an entity left out takes its crons with it.
 * Read as text by the generator, so nothing imports it.
 * @generator
 */
export const schedule = "30 5 * * 1";

/**
 * What Settings -> Agents says about this routine (Y.14). Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "QuickBooks invoice sync",
  description: "Weekly read-from-QBO, upsert-into-Supabase invoice mirror for Edge8 (AIO is entered by hand). Never deletes. Runs after the token keepalive.",
  content: ["QBO invoices"],
  apps: ["QuickBooks", "Supabase", "Lark"],
};

// Edge8 only. The AIO connection was saved on 2026-10-07 with Edge8's realm
// id and mirrored every Edge8 invoice a second time as AIO, doubling revenue
// on the dashboard. AIO's invoices are entered by hand from now on, so the
// routine no longer reads that connection at all.
const ENTITIES: QboEntity[] = ["edge8"];

// Vercel cron (see vercel.json): weekly QuickBooks invoice mirror for every
// connected company. Read-from-QBO, upsert-into-Supabase; never deletes. Runs
// after the token keepalive so tokens are fresh. Lark-warns on hard failures;
// unmapped customers are reported but are not failures (expected for AIO until
// its customers are mapped).
async function handler(req: Request) {
  const results = [];
  for (const entity of ENTITIES) results.push(await syncQboInvoices(entity));

  // A disconnected company degrades quietly (normal until connected); only a
  // real API/DB error alarms.
  const failed = results.filter((r) => !r.ok && r.error && !/not connected/i.test(r.error));
  // A company whose sync hit a real error is a failure the run names; the
  // kernel turns it into the 500 this handler used to build by hand (Y.13).
  const failures: RoutineFailure[] = failed.map((r) => ({ subject: r.entity, step: "invoice sync", error: r.error ?? "sync failed" }));
  // The alert is an ops alert through the router (Z.7): urgent, claimed once
  // per company per day, and one Lark refused is named beside the sync failure.
  for (const r of failed) {
    const warned = await notify({
      kind: "ops.alert",
      to: { chat: "ops" },
      message: `⚠️ QuickBooks (${r.entity}) invoice sync failed: ${r.error}. Ledger may be stale: ${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/admin/revenue/invoices`,
      dedupeKey: `company-os:qbo-invoice-sync-failed:${r.entity}:${saigonToday()}`,
    });
    failures.push(...failureOf(warned, r.entity, "warn Operations"));
  }
  return routineResult({ status: "ok", results, failures });
}

// Every scheduled run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request) => withRoutineRun("/api/cron/qbo-invoice-sync/", req, handler);
