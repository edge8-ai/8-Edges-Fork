import { companyOs } from "@/kernel/data/supabase";
import { readRoutineMode } from "./routine-config";
import type { RunMode } from "./run-context";

// How a routine's run goes, from its switch (Y.7, Z.17). routine-runs.ts asks
// this before it claims a tick, because the tick is claimed per mode, and the
// agent driver asks it before it drives a step, so a paused agent's step is
// left waiting rather than claimed.

export type ModeDecision = { run: RunMode } | { skip: string };

/** What a skipped run says when the switch could not be read. */
const SWITCH_UNREAD = "the switch could not be read";

/**
 * How this run goes: live, shadow, or not at all. `honourPause` is true for
 * the schedule and the agent driver, false for a person's button.
 *
 * - live: runs live.
 * - paused: the schedule skips the run with the reason; a person's button
 *   runs it live, as it always has (Y.25).
 * - shadow: a routine that honours shadow runs in shadow, from the schedule
 *   or a button. One that does not would send for real, so every run is
 *   skipped, saying so, until someone turns it on or off.
 * - a switch that cannot be read: a routine that honours shadow skips the
 *   run. Neither guess is safe for it: run live and it may send what nobody
 *   approved; run in shadow and a live routine may lose a send for good,
 *   because its run can still write state (a period marked done, an agent's
 *   step advanced) that stops the next run from sending. A skipped tick
 *   changes nothing, and the next tick reads the switch again. A routine that
 *   cannot honour shadow runs live, as before (Y.7): stopping every routine on
 *   a database hiccup is worse than a paused one running once.
 */
export async function decideRunMode(
  routineId: string,
  opts: { honourPause: boolean; shadowCapable: boolean },
): Promise<ModeDecision> {
  const read = await readRoutineMode(routineId);
  if (!read.ok) {
    console.error(`[routine-runs] ${routineId}: the switch could not be read: ${read.error}`);
    return opts.shadowCapable ? { skip: SWITCH_UNREAD } : { run: "live" };
  }
  if (read.mode === "paused") return opts.honourPause ? { skip: `paused: ${read.reason ?? "paused"}` } : { run: "live" };
  if (read.mode === "shadow") {
    return opts.shadowCapable ? { run: "shadow" } : { skip: "set to shadow, which this routine does not support; nothing was run" };
  }
  return { run: "live" };
}

const HOLDING = ["running", "waiting", "ok", "skipped"];

/**
 * Whether the other mode holds a run of this tick, checked after this run's
 * own claim (`runId`). Ticks are claimed per mode (routine_runs_one_tick), so
 * without this a person's live Run now and the driver's shadow step could both
 * run one step. Checked after the claim, two racing claims cannot both miss
 * each other: at worst both stand down and the next tick runs it.
 *
 * When the tick is held, or the check fails, this run stands down: its row is
 * closed as skipped with the reason and without its tick, so it neither keeps
 * the tick in its own mode nor counts as a failed attempt. Answers the reason,
 * or null when the run may go ahead.
 */
export async function otherModeHolds(routineId: string, runId: string, tick: string, mode: RunMode): Promise<string | null> {
  const other: RunMode = mode === "live" ? "shadow" : "live";
  let reason: string | null = null;
  try {
    const { data, error } = await companyOs
      .from("routine_runs")
      .select("id")
      .eq("routine_id", routineId)
      .eq("tick_key", tick)
      .eq("mode", other)
      .in("status", HOLDING)
      .limit(1);
    if (error) reason = `the ${other} run of this tick could not be checked (${error.message})`;
    else if (data && data.length > 0) reason = `a ${other} run holds this tick`;
  } catch (err) {
    reason = `the ${other} run of this tick could not be checked (${err instanceof Error ? err.message : String(err)})`;
  }
  if (!reason) return null;
  const { error } = await companyOs
    .from("routine_runs")
    .update({ status: "skipped", tick_key: null, finished_at: new Date().toISOString(), summary: reason })
    .eq("id", runId)
    .eq("status", "running");
  if (error) console.error(`[routine-runs] ${routineId}: could not stand run ${runId} down: ${error.message}`);
  return reason;
}
