import { recordAudit } from "@/kernel/audit/audit";
import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import type { RoutineFailure } from "@/kernel/audit/routine-result";
import { isoWeekKey, isoWeekMonday, saigonToday } from "@/kernel/config/dates";
import { companyOs } from "@/kernel/data/supabase";
import { failureOf, notify } from "@/kernel/messaging/router";
import { loadAgentManagement } from "@/entities/company-os";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs — an entity left out takes its crons with it.
 * Read as text by the generator, so nothing imports it.
 * @generator
 */
export const schedule = "0 23 * * *";

/**
 * What Settings -> Agents says about this routine (Y.14). Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "Key result sync",
  description: "Nightly. Refreshes the key results whose number the company's own systems can read off (today: workflows built, counted from this page's routines) and logs each value to kr_logs.",
  content: ["Key results", "Managed routines (this page)"],
  apps: ["Supabase"],
};

// Vercel cron (see vercel.json): nightly. Refreshes the key results whose
// number the company's own systems can read off, so a KR marked source=agent
// never depends on someone remembering to check it in. Each entry names the KR
// row it keeps and how its value is computed; the run writes current_value and
// appends a kr_logs row for the week, the same trail a human check-in leaves.
// When a value actually changes, the operations Lark channel is told.
const AGENT = "devops-agent";

const COMPUTED_KRS: { id: string; label: string; compute: () => Promise<{ value: number; note: string }> }[] = [
  {
    // O4 · "Build 88 workflows into the 8 Edges Open Source System by Dec 31".
    id: "bf0cf73e-8322-4c12-a6fb-5006331f0b30",
    label: "workflows built",
    // The number is exactly what Settings -> Agents lists: every managed
    // routine across Vercel crons, on-demand routines and Mac mini jobs.
    compute: async () => {
      const view = loadAgentManagement();
      const crons = view.vercel.filter((r) => r.cron).length;
      const onDemand = view.vercel.length - crons;
      return {
        value: view.routines.length,
        note: `${view.routines.length} managed routines on Settings → Agents: ${crons} Vercel crons, ${onDemand} on-demand routines, ${view.macMini.length} Mac mini jobs.`,
      };
    },
  },
];

// Monday of the business week (Vietnam time) the run belongs to, as the
// YYYY-MM-DD kr_logs.week_start wants (Y.40). The run fires at 20:45 UTC, which
// is already the next morning in Vietnam: in UTC, Sunday night's run filed
// Monday's reading under the week before.
function weekStart(): string {
  return isoWeekMonday(isoWeekKey(saigonToday())) ?? saigonToday();
}

async function handler(_req: Request) {
  const now = new Date();
  const results: { id: string; label: string; value?: number; previous?: number | null; error?: string }[] = [];
  const failures: RoutineFailure[] = [];

  for (const kr of COMPUTED_KRS) {
    const { data: row, error: readError } = await companyOs
      .from("key_results")
      .select("id, current_value")
      .eq("id", kr.id)
      .maybeSingle();
    if (readError) {
      results.push({ id: kr.id, label: kr.label, error: readError.message });
      failures.push({ subject: kr.label, step: "read key result", error: readError.message });
      continue;
    }
    if (!row) {
      // The KR was deleted or replaced; nothing to keep, but say so rather than
      // silently doing nothing forever.
      results.push({ id: kr.id, label: kr.label, error: "key result not found" });
      failures.push({ subject: kr.label, step: "find key result", error: "key result not found" });
      continue;
    }

    const { value, note } = await kr.compute();
    const { error: writeError } = await companyOs
      .from("key_results")
      .update({ current_value: value, updated_at: now.toISOString() })
      .eq("id", kr.id);
    if (writeError) {
      results.push({ id: kr.id, label: kr.label, error: writeError.message });
      failures.push({ subject: kr.label, step: "update key result", error: writeError.message });
      continue;
    }
    // The same audit row a human check-in leaves (K.43). An agent-kept key
    // result moves without anyone pressing anything, so without this row the
    // trail would show the company number standing still between check-ins and
    // the coaching ladder's company rung would have nothing to compare against.
    await recordAudit({
      table: "key_results",
      recordId: kr.id,
      operation: "update",
      actor: AGENT,
      oldData: { current_value: row.current_value },
      newData: { current_value: value },
    });
    const { error: logError } = await companyOs.from("kr_logs").insert({
      key_result_id: kr.id,
      week_start: weekStart(),
      value,
      note_md: note,
      author_kind: "agent",
      author_agent: AGENT,
    });
    if (logError) {
      results.push({ id: kr.id, label: kr.label, value, previous: row.current_value, error: `log: ${logError.message}` });
      failures.push({ subject: kr.label, step: "write kr_logs row", error: logError.message });
      continue;
    }
    results.push({ id: kr.id, label: kr.label, value, previous: row.current_value });
  }

  // A KR kept by an agent moves with nobody watching, so when the number
  // actually changes the operations channel hears it — the same nudge a human
  // check-in would prompt. Unchanged values stay quiet; a first-ever value
  // (previous null) counts as a move. It is news that can wait for the morning,
  // so it goes in the Operations chat's working-morning digest (Z.7) rather
  // than at 06:00; a weekend's moves arrive in Monday's. Keyed on the day and
  // the values, so a retried run queues nothing twice.
  const moved = results.filter((r) => r.error === undefined && r.value !== r.previous);
  if (moved.length > 0) {
    const lines = moved.map((r) => `• ${r.label}: ${r.previous ?? "—"} → ${r.value}`);
    const told = await notify({
      kind: "ops.digest",
      to: { chat: "ops" },
      message: [`📈 Key results updated (${moved.length})`, ...lines].join("\n"),
      dedupeKey: `org:kr-moved:${saigonToday()}:${moved.map((r) => `${r.id}=${r.value}`).sort().join(",")}`,
    });
    failures.push(...failureOf(told, "key result change notice", "tell Operations"));
  }

  const failed = results.filter((r) => r.error).length;
  return routineResult({ status: "ok", updated: results.length - failed, failed, moved: moved.length, results, failures });
}

// Every scheduled run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request) => withRoutineRun("/api/cron/kr-agent-sync/", req, handler);
