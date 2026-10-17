import { companyOs } from "@/kernel/data/supabase";
import type { Result } from "@/kernel/data/result";

// A run parked on a person or a timed send (Y.16, Y.17; ADR 0015: "a run that
// waits on a person is a row in `waiting`"). The routine_runs status `waiting`
// has existed since Y.6 and the reaper never touches it, but nothing wrote it:
// a writer post at ready or a letter waiting on its approval showed on
// Settings -> Agents only as the step before it, closed ok, as if the run had
// finished. A parked run is now one `waiting` row under the agent's routine id,
// with its own tick, closed when the wait ends: ok with what decided it, or
// skipped when the wait was withdrawn.
//
// The tick is the agent's own (`<run id>:<started at>:<what it waits for>`), so
// parking twice is one row: the partial unique index on (routine, tick, mode)
// refuses a second live row, and that refusal is the park already being there.
// The wait's tick must differ from every step tick, because claim_tick refuses
// a tick a waiting row holds.

const UNIQUE_VIOLATION = "23505";

/**
 * Open the waiting row for `tick`, or leave the one already there. A wait
 * asked for again after it closed (the same version asked about once more,
 * after a withdrawal) holds the tick with its closed row, so that row is
 * reopened: Settings -> Agents must show a run that is waiting as waiting.
 */
export async function parkRun(routineId: string, tick: string, summary: string): Promise<Result> {
  const { error } = await companyOs.from("routine_runs").insert({
    routine_id: routineId,
    tick_key: tick,
    mode: "live",
    host: "vercel",
    status: "waiting",
    started_at: new Date().toISOString(),
    summary,
  });
  if (!error) return { ok: true };
  if (error.code !== UNIQUE_VIOLATION) return { ok: false, error: `routine_runs park: ${error.message}` };
  const { error: reopenError } = await companyOs
    .from("routine_runs")
    .update({ status: "waiting", summary, finished_at: null, result: null })
    .eq("routine_id", routineId)
    .eq("tick_key", tick)
    .eq("mode", "live")
    .in("status", ["ok", "skipped"]);
  if (reopenError) return { ok: false, error: `routine_runs reopen park: ${reopenError.message}` };
  return { ok: true };
}

/**
 * Close the waiting row for `tick` with how the wait ended. Fenced to a row
 * still waiting, so a wait closed once keeps its first outcome; closing a wait
 * that was never parked (a run parked before this existed) changes nothing.
 */
export async function closeParkedRun(
  routineId: string,
  tick: string,
  outcome: { status: "ok" | "skipped"; summary: string },
): Promise<Result> {
  const { error } = await companyOs
    .from("routine_runs")
    .update({ status: outcome.status, summary: outcome.summary, finished_at: new Date().toISOString(), result: { status: outcome.status, summary: outcome.summary } })
    .eq("routine_id", routineId)
    .eq("tick_key", tick)
    .eq("status", "waiting");
  if (error) return { ok: false, error: `routine_runs close park: ${error.message}` };
  return { ok: true };
}
