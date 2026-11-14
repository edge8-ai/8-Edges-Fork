// The quest clock states the moment a fire is held (ADR 0023). A fire is held
// only once its session ends, and nothing else happens at that moment: the
// Host's last register mark usually lands while the session is still on, and a
// recompute then finds no fire yet. So each tick asks Training which sessions
// ended in a window that overlaps the last tick, keeps the Raids among them,
// judges each with the one held rule (evolve-model.isHeld), and states
// quest.fire.held for each held one. The ladders recompute the Host on it.
//
// Stated without a record that it was: the window overlaps the last tick, so
// a fire may be stated twice, and every ladders handler is a recompute, so a
// second statement writes the same rows. A tick missed outright is repaired by
// the nightly replay. A failed read is this step's failure and stops nothing
// else the clock does.
import { mustPagesIn } from "@/kernel/data/read";
import type { RoutineFailure } from "@/kernel/audit/routine-result";
import { sessionsEndedBetween } from "@/entities/training";
import { announce } from "./announce";
import { isHeld } from "./evolve-model";
import { fireSessions } from "./lighthouses-read";
import { selectQuests } from "./reads";

/** How far back each tick looks for a session's end: two ticks of the ten-minute clock, so one running late is covered by the next. */
export const FIRE_HELD_WINDOW_MS = 20 * 60_000;

export type FiresRun = { held: number; failures: RoutineFailure[] };

type RaidRow = { id: string; host_id: string | null; training_id: string };

/** States quest.fire.held for every Raid whose session ended in the window before `now` and was held. */
export async function stateHeldFires(now: Date): Promise<FiresRun> {
  const run: FiresRun = { held: 0, failures: [] };
  let raids: RaidRow[];
  let sessions: Awaited<ReturnType<typeof fireSessions>>;
  try {
    const ended = await sessionsEndedBetween(new Date(now.getTime() - FIRE_HELD_WINDOW_MS), now);
    if (ended.length === 0) return run;
    raids = await mustPagesIn<RaidRow>(ended, "[quests/fire-clock] raids", (ids, from, to) => selectQuests("id, host_id, training_id").eq("kind", "raid").in("training_id", ids).order("id").range(from, to));
    sessions = await fireSessions(raids.map((r) => r.training_id));
  } catch (err) {
    run.failures.push({ subject: "held fires", step: "read", error: err instanceof Error ? err.message : String(err) });
    return run;
  }
  for (const raid of raids) {
    if (!raid.host_id || !isHeld(raid.host_id, sessions.get(raid.training_id), now)) continue;
    const failed = await announce("quest.fire.held", { questId: raid.id, hostId: raid.host_id });
    if (failed) run.failures.push({ subject: `quest ${raid.id}`, step: "announce held fire", error: failed });
    else run.held += 1;
  }
  return run;
}
