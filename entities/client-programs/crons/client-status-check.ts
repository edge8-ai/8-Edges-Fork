import { runInvariants, type Invariant } from "@/kernel/audit/invariants";
import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { notifyOps } from "@/kernel/messaging/lark";
import { activeClientCompanies } from "../lib/active-clients";
import { OWN_COMPANIES } from "../lib/client-status/own-companies";
import { reportsOfWeek } from "../lib/client-status/store";
import { statusWeek } from "../lib/client-status/week";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs. Read as text by the generator.
 * @generator
 */
export const schedule = "0 5 * * 5";

/**
 * What Settings -> Agents says about this routine (Y.14). Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "Client status check",
  description: "Fridays, two hours after the weekly client status opens. Checks every active client got this week's report and that each reached a draft on its Weekly status page, and tells Operations about any that did not.",
  content: ["Client status reports"],
  apps: ["Supabase", "Lark"],
};

// Vercel cron: Fridays at 05:00 UTC, two hours after the weekly client status
// opener. The automation watchdog's check on that run (Z.15.2, plan G7), moved
// to the report table with Z.12: it reads what the run left behind, not what it
// said. Two hours is a dozen driver ticks, so every report should be a ready
// draft by now, or stopped saying why.

const ROUTINE_ID = "/api/cron/client-status-check/";

// The opener runs Fridays at 03:00 UTC; by 05:00 its reports are drafts.
const OPENER_DONE_HOURS = 2;

/** The ISO week of the last Friday whose opener should have settled by `now`. */
export function lastStatusWeek(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 3));
  for (let i = 0; i < 8; i++) {
    if (d.getUTCDay() === 5 && d.getTime() + OPENER_DONE_HOURS * 3_600_000 <= now.getTime()) return statusWeek(d);
    d.setUTCDate(d.getUTCDate() - 1);
  }
  throw new Error("no Friday in the last eight days");
}

/**
 * Z.15.2: every active client has last Friday's report, and each is a ready
 * draft (Z.12.1: the run ends there, with the account owner). A client with no
 * row, a row stopped without a plain report, or a row still being written two
 * hours later, is one whose account owner has nothing to share.
 */
export function clientStatusReports(): Invariant {
  return {
    id: "Z.15.2",
    name: "every active client got last Friday's status report as a ready draft",
    check: async (now) => {
      const active = await activeClientCompanies(OWN_COMPANIES);
      if (!active.ok) throw new Error(`ai_programs: ${active.error}`);
      const week = lastStatusWeek(now);
      const byCompany = new Map((await reportsOfWeek(week)).map((r) => [r.companyId, r]));
      const missing: string[] = [];
      for (const [companyId, { company }] of active.clients) {
        const report = byCompany.get(companyId);
        if (!report) {
          missing.push(`${company}: no report`);
          continue;
        }
        if (report.step === "ready") continue;
        if (report.step === "stopped") {
          missing.push(`${company}: stopped (${report.error ?? "no reason"}); use the plain report or draft again`);
          continue;
        }
        missing.push(`${company}: still at ${report.step}`);
      }
      const n = active.clients.size;
      if (missing.length === 0) return { ok: true, detail: `${n} client(s) have the ${week} report as a ready draft` };
      return { ok: false, detail: `week ${week}, ${missing.length} of ${n} client(s): ${missing.join("; ")}` };
    },
  };
}

async function handler(): Promise<Response> {
  const [result] = await runInvariants([clientStatusReports()]);
  let opsNotified: boolean | null = null;
  if (!result.ok) {
    opsNotified = await notifyOps(`Automation watchdog: ${result.id} ${result.name} is broken.\n${result.detail}`);
  }
  return routineResult({
    status: "ok",
    ...result,
    opsNotified,
    failures: result.ok ? [] : [{ subject: result.id, step: result.name, error: result.detail }],
  });
}

// Every run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request): Promise<Response> => withRoutineRun(ROUTINE_ID, req, handler);
