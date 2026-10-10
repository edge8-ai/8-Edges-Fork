import { companyOs } from "@/kernel/data/supabase";
import { notifyOps } from "@/kernel/messaging/lark";

// The other half of the run record opening at the start (Y.6): a run whose
// function was killed, timed out or crashed never closes its own row, so
// something else has to say it died. kernel/audit/routine-runs.ts opens and
// closes rows; this marks the ones left open past their step deadline. The
// routine-reaper cron (entities/company-os) calls it every five minutes.

// A run the reaper may mark died: past its step deadline by this much.
const REAP_GRACE_MS = 60_000;

export type DiedRun = { id: string; routine_id: string; started_at: string };

/**
 * Mark every running row whose step deadline passed more than a minute ago as
 * died, and tell Operations. A waiting row is parked on an approval or a
 * delayed send with its own time limit and is never reaped. The update is
 * fenced on status, so a run that closed itself between the read and the
 * write keeps its outcome. `alerted` is false when Lark did not take the alert.
 */
export async function reapDiedRuns(now: Date = new Date()): Promise<{ died: DiedRun[]; alerted: boolean } | { error: string }> {
  const cutoff = new Date(now.getTime() - REAP_GRACE_MS).toISOString();
  const { data, error } = await companyOs
    .from("routine_runs")
    .update({
      status: "died",
      finished_at: now.toISOString(),
      error: "The run stopped reporting before it finished: its step deadline passed with the row still running (killed, timed out or crashed).",
      summary: "died: no result before the step deadline",
    })
    .eq("status", "running")
    .lt("step_deadline_at", cutoff)
    .select("id, routine_id, started_at");
  if (error) return { error: `routine_runs reap: ${error.message}` };
  const died = (data ?? []) as DiedRun[];
  if (died.length === 0) return { died, alerted: true };
  const lines = died.map((r) => `- ${r.routine_id} (started ${r.started_at})`).join("\n");
  const alerted = await notifyOps(
    `${died.length} routine run${died.length === 1 ? "" : "s"} died before finishing:\n${lines}\nSee Settings -> Agents for the run log.`,
  );
  return { died, alerted };
}
