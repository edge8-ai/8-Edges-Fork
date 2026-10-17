import { companyOs } from "@/kernel/data/supabase";
import { notifyOps } from "@/kernel/messaging/lark";
import type { RoutineRunStatus } from "./routine-runs-readers";

// The repeated-failure alert for routine runs, kept apart from the recorder in
// routine-runs.ts, which calls it when a run closes as an error.

// The states a finished run can be in. Running and waiting rows are runs in
// progress, not outcomes, so a failure streak never counts them.
const OUTCOMES: RoutineRunStatus[] = ["ok", "skipped", "error", "died"];
const isFailure = (status: string | undefined) => status === "error" || status === "died";

/**
 * Post to the Operations chat when a routine has now failed twice in a row,
 * and only then: the second failure of a streak alerts, later ones stay quiet,
 * and a success in between starts a new streak. An error and a died run both
 * count as failures. One failed run is noise (a Lark hiccup, a cold start);
 * two on consecutive schedules is an outage, which is what the daily coaching
 * cycle was for five days in September 2026 with nobody reading the run
 * table. Best-effort, like the recording itself.
 */
export async function alertOnRepeatedFailure(routineId: string, runId: string | null, startedAt: Date, failure: string): Promise<void> {
  try {
    // Test doubles for the run recorder often stub only insert; without a
    // reader there is no streak to judge, and that is not an error.
    const table = companyOs.from("routine_runs") as { select?: unknown };
    if (typeof table.select !== "function") return;
    let query = companyOs
      .from("routine_runs")
      .select("status")
      .eq("routine_id", routineId)
      .in("status", OUTCOMES)
      // Runs before this one, so this run's own row never counts twice.
      .lt("started_at", startedAt.toISOString());
    if (runId) query = query.neq("id", runId);
    const { data, error } = await query.order("started_at", { ascending: false }).limit(2);
    if (error) {
      console.error(`[routine-runs] ${routineId}: streak read failed: ${error.message}`);
      return;
    }
    // This run is failure number one. The previous run makes it a streak of
    // two; the one before that decides whether the streak is new.
    const previous = ((data ?? []) as { status: string }[]).map((r) => r.status);
    const secondOfStreak = isFailure(previous[0]) && !isFailure(previous[1]);
    if (!secondOfStreak) return;
    const head = failure.split("\n")[0].slice(0, 300);
    await notifyOps(
      `Routine ${routineId} has failed on its last two runs.\n${head}\nSee Settings -> Agents for the run log.`,
    );
  } catch (err) {
    console.error(`[routine-runs] ${routineId}: alert failed`, err);
  }
}
