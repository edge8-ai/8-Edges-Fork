import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { once } from "@/kernel/audit/effects";
import { notifyOps } from "@/kernel/messaging/lark";
import { activeClientCompanies } from "../lib/active-clients";
import { OWN_COMPANIES } from "../lib/client-status/own-companies";
import { supersedeBefore } from "../lib/client-status/run-step";
import { CLIENT_STATUS_ROUTINE_ID } from "../lib/client-status/steps";
import { openReports, reportsOfWeek } from "../lib/client-status/store";
import { FIRST_STATUS_WEEK, statusWeek } from "../lib/client-status/week";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs. Read as text by the generator.
 * @generator
 */
export const schedule = "0 3 * * 5";

/**
 * What Settings -> Agents says about this routine (Y.14). Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "Weekly client status",
  description: "Fridays at 10:00 Vietnam time. Opens one weekly status report per active client; the client status driver gathers, drafts and checks each into a draft on the client's Weekly status page in the team hub. The account owner reads it, edits it and shares it with the client themselves: nothing is asked for approval and nothing is published. Last week's runs that never produced a draft are superseded.",
  content: ["AI programs", "Client boards", "Client roadmaps", "Client status reports"],
  apps: ["Supabase", "Anthropic", "Lark"],
};

// Vercel cron: Fridays 03:00 UTC, 10:00 in Vietnam (Z.12, Automation Plan R4).
// The weekly opener. It replaced the library's customer-status routine, which
// published a gated page before anyone read it (spec §0, finding 1): this one
// publishes nothing. It opens one report row per active client company for the
// ISO week, and the tick driver (crons/client-status-driver) takes each from
// there to a draft the account owner shares themselves (Z.12.1). The unique
// (company_id, week) row is the run's idempotency key, so a second run in the
// same week, by schedule or Run now, opens nothing new.
//
// Before opening, every earlier week whose run never produced a draft is
// superseded, so the driver stops running it. A ready draft is left alone.
//
// No week before 2026-W41 is ever opened here: those weeks belonged to the
// library's routine (lib/client-status/week.ts, FIRST_STATUS_WEEK).

async function handler(): Promise<Response> {
  const week = statusWeek(new Date());
  const active = await activeClientCompanies(OWN_COMPANIES);
  if (!active.ok) {
    await once(`client-status:open-failed-note:${week}`, "lark", async () =>
      (await notifyOps(`Weekly client status, week ${week}: no report was opened, because the active clients could not be read (${active.error}).`))
        ? { ok: true }
        : { ok: false, error: "the Ops note did not go through" },
    );
    return routineResult({ status: "ok", week, failures: [{ subject: "active clients", step: "read", error: active.error }] });
  }

  // The library's routine held the weeks up to 2026-W40; a page for one of them
  // from this chain would be a client's second page for that week.
  if (week < FIRST_STATUS_WEEK) {
    return routineResult({ status: "skipped", reason: `${week} belongs to the library's customer-status pages; the first week here is ${FIRST_STATUS_WEEK}`, week });
  }

  const superseded = await supersedeBefore(week);
  const companyIds = [...active.clients.keys()];
  const failures = superseded.failures.map((f) => ({ ...f, step: "supersede" }));
  if (companyIds.length === 0) {
    return routineResult({ status: "skipped", reason: "no client has an active AI program", week, superseded: superseded.superseded, failures });
  }
  const opened = await openReports(companyIds, week);
  if (!opened.ok) failures.push({ subject: "client status reports", step: "open", error: opened.error });
  // Done is what this week now has, however many this run opened: a re-run
  // that opens nothing because the rows exist has still done its work.
  const rows = opened.ok ? await reportsOfWeek(week) : [];
  const open = new Set(rows.map((r) => r.companyId));
  return routineResult({
    status: "ok",
    week,
    clients: companyIds.length,
    opened: opened.ok ? opened.opened : 0,
    superseded: superseded.superseded,
    outcome: { expected: companyIds.length, done: companyIds.filter((id) => open.has(id)).length, unit: "client reports" },
    failures,
  });
}

// Every run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request): Promise<Response> => withRoutineRun(CLIENT_STATUS_ROUTINE_ID, req, handler);
