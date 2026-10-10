import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { getQboConnectionStatus, refreshQboTokens, type QboEntity } from "@/entities/company-os/lib/qbo";
import { saigonToday } from "@/kernel/config/dates";
import { failureOf, notify, type NotifyResult } from "@/kernel/messaging/router";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs — an entity left out takes its crons with it.
 * Read as text by the generator, so nothing imports it.
 * @generator
 */
export const schedule = "0 5 * * 1";

/**
 * What Settings -> Agents says about this routine (Y.14). Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "QuickBooks token refresh",
  description: "Weekly QuickBooks token keepalive per connected company, so a connection never idles out. Lark-warns on failure or near-expiry.",
  content: ["QBO connections"],
  apps: ["QuickBooks", "Lark"],
};

const QBO_SETTINGS_URL = `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/admin/settings/quickbooks`;

const ENTITIES: QboEntity[] = ["edge8", "aio"];

// Vercel cron (see vercel.json): weekly QuickBooks token keepalive, run for
// every connected company. Intuit refresh tokens die ~100 days after issue;
// refreshing weekly means a connection never idles out between invoices.
// Lark-warns per company when a refresh fails or the expiry is inside 14 days.
// Both warnings are ops alerts through the notification router (Z.7): urgent,
// so never held, claimed once per company per day, and a warning Lark did not
// take fails the run, because the warning is the only way anyone hears that
// invoicing is about to stop.
async function keepalive(entity: QboEntity) {
  const status = await getQboConnectionStatus(entity);
  if (!status.connected) {
    // Not connected is a normal state until the connect flow is run once for
    // this company — no alarm, just report.
    return { entity, connected: false as const, warned: null };
  }

  const result = await refreshQboTokens(entity);
  if (!result.ok) {
    const warned = await notify({
      kind: "ops.alert",
      to: { chat: "ops" },
      message: `⚠️ QuickBooks (${entity}) token refresh failed (${result.error}). Invoicing degrades to manual until reconnected: ${QBO_SETTINGS_URL}`,
      dedupeKey: `company-os:qbo-refresh-failed:${entity}:${saigonToday()}`,
    });
    return { entity, connected: true as const, refreshed: false as const, error: result.error, warned };
  }

  const after = await getQboConnectionStatus(entity);
  let warned: NotifyResult | null = null;
  if (after.connected) {
    const daysLeft = (new Date(after.refreshTokenExpiresAt).getTime() - Date.now()) / 86_400_000;
    if (daysLeft < 14) {
      warned = await notify({
        kind: "ops.alert",
        to: { chat: "ops" },
        message: `⚠️ QuickBooks (${entity}) refresh token expires in ${Math.floor(daysLeft)} days — reconnect at ${QBO_SETTINGS_URL}`,
        dedupeKey: `company-os:qbo-token-expiring:${entity}:${saigonToday()}`,
      });
    }
  }
  return { entity, connected: true as const, refreshed: true as const, warned };
}

async function handler(req: Request) {
  const results = [];
  for (const entity of ENTITIES) results.push(await keepalive(entity));
  // A connected company whose refresh failed is named; the kernel makes it the
  // 500 this handler used to build by hand (Y.13).
  const failures = results.flatMap((r) => [
    ...(r.connected && r.refreshed === false ? [{ subject: r.entity, step: "token refresh", error: r.error ?? "refresh failed" }] : []),
    // A warning Lark refused is its own failure (Z.7): before, the near-expiry
    // warning could be rejected and the run still read ok.
    ...(r.warned ? failureOf(r.warned, r.entity, "warn Operations") : []),
  ]);
  return routineResult({ status: "ok", results, failures });
}

// Every scheduled run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request) => withRoutineRun("/api/cron/qbo-refresh/", req, handler);
