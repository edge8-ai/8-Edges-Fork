import { companyOs } from "@/kernel/data/supabase";

// The run table's readers for Settings -> Agents. Kept apart from the recorder
// in routine-runs.ts, which re-exports them, so each file stays one concern. The row's type lives here because the
// recorder imports it, and this file imports nothing of the recorder.

export type RoutineHost = "vercel" | "mac-mini";
export type RoutineRunStatus = "running" | "waiting" | "ok" | "skipped" | "error" | "died";

export type RoutineRun = {
  id: string;
  routine_id: string;
  host: RoutineHost;
  status: RoutineRunStatus;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  summary: string | null;
  result: unknown;
  error: string | null;
  log: string | null;
  ai_calls: number;
  ai_input_tokens: number;
  ai_output_tokens: number;
  ai_cache_read_tokens: number;
  ai_cache_write_tokens: number;
  // Since Y.6 (null on rows written before it): the tick the run claimed, and
  // when its current step must have finished before the reaper marks it died.
  tick_key: string | null;
  step_deadline_at: string | null;
  mode: "shadow" | "live";
  attempt: number;
};

/** The columns the Agents list shows of a run; the result body and the log stay on the run's own page. */
export type RecentRun = Pick<
  RoutineRun,
  "id" | "routine_id" | "status" | "started_at" | "finished_at" | "summary" | "error" | "step_deadline_at"
>;

/**
 * The newest `perRoutine` runs of each routine, newest first, for the Agents
 * list: one indexed read per routine (routine_runs_routine_started_idx). It
 * used to take the newest 2000 rows of the whole table, which the five-minute
 * reaper and the fifteen-minute send crons fill in a few days, so a weekly
 * routine read as "Never run". More than one run, because "failed twice in a
 * row" is a fact about two of them (Y.25). A routine with no run has no entry.
 */
export async function recentRunsByRoutine(routineIds: string[], perRoutine: number): Promise<Map<string, RecentRun[]>> {
  const reads = await Promise.all(
    routineIds.map((id) =>
      companyOs
        .from("routine_runs")
        .select("id, routine_id, status, started_at, finished_at, summary, error, step_deadline_at")
        .eq("routine_id", id)
        .order("started_at", { ascending: false })
        .limit(perRoutine),
    ),
  );
  const latest = new Map<string, RecentRun[]>();
  for (const { data, error } of reads) {
    if (error) throw new Error(`routine_runs: ${error.message}`);
    const rows = (data ?? []) as RecentRun[];
    if (rows.length > 0) latest.set(rows[0].routine_id, rows);
  }
  return latest;
}

/** AI tokens spent per routine over the trailing window (days). */
export async function aiTokensByRoutine(days: number): Promise<Map<string, { calls: number; input: number; output: number }>> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, error } = await companyOs
    .from("routine_runs")
    .select("routine_id, ai_calls, ai_input_tokens, ai_output_tokens")
    .gte("started_at", since)
    // A run with no model calls adds nothing to any sum, and most runs make
    // none (the reaper alone writes 288 a day), so leaving them out keeps the
    // window's AI runs inside the row limit.
    .gt("ai_calls", 0)
    .limit(5000);
  if (error) throw new Error(`routine_runs: ${error.message}`);
  const out = new Map<string, { calls: number; input: number; output: number }>();
  for (const r of data ?? []) {
    const t = out.get(r.routine_id) ?? { calls: 0, input: 0, output: 0 };
    t.calls += r.ai_calls;
    t.input += Number(r.ai_input_tokens);
    t.output += Number(r.ai_output_tokens);
    out.set(r.routine_id, t);
  }
  return out;
}

export async function listRoutineRuns(routineId: string, limit = 100): Promise<RoutineRun[]> {
  const { data, error } = await companyOs
    .from("routine_runs")
    .select("*")
    .eq("routine_id", routineId)
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`routine_runs: ${error.message}`);
  return (data ?? []) as RoutineRun[];
}
