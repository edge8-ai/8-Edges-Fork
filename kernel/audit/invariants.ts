import vercelConfig from "@/vercel.json";
import { companyOs } from "@/kernel/data/supabase";
import { tickKeyFor } from "./routine-tick";

// The automation watchdog's invariants (Z.15, plan Part G7). Each one is a
// read over tables that already exist with an expected answer, run once a day.
// It is the one layer that catches a routine whose code believes it
// succeeded: between 28 Sep and 7 Oct eleven failures read ok in the run log,
// and none of them would have been caught by retrying or by durable execution.
// The kernel's own invariants live here; an entity whose tables an invariant
// reads exports its check from its door, and the watchdog cron runs them all.

export type InvariantCheck = { ok: boolean; detail: string };

export type Invariant = {
  /** Stable id, the plan's card number: "Z.15.3". */
  id: string;
  name: string;
  check: (now: Date) => Promise<InvariantCheck>;
};

export type InvariantResult = InvariantCheck & { id: string; name: string };

/**
 * Run every invariant, each on its own. A check that throws is a broken
 * invariant, never a pass: a watchdog that cannot read is not watching.
 */
export async function runInvariants(list: Invariant[], now: Date = new Date()): Promise<InvariantResult[]> {
  return Promise.all(
    list.map(async (inv) => {
      try {
        const result = await inv.check(now);
        return { id: inv.id, name: inv.name, ...result };
      } catch (err) {
        return { id: inv.id, name: inv.name, ok: false, detail: `could not check: ${err instanceof Error ? err.message : String(err)}` };
      }
    }),
  );
}

// A slot this recent may still be running; the watchdog asks about the slot
// before it. Twenty minutes covers the longest maxDuration (300 s) with room.
const SLOT_GRACE_MS = 20 * 60_000;

type CronEntry = { path: string; schedule: string };

/** Each scheduled routine and the tick of its last slot that should have finished by `now`. */
export function lastSlots(crons: CronEntry[], now: Date): { path: string; tick: string }[] {
  const before = new Date(now.getTime() - SLOT_GRACE_MS);
  const out: { path: string; tick: string }[] = [];
  for (const c of crons) {
    const tick = tickKeyFor(c.schedule, before);
    if (tick) out.push({ path: c.path, tick });
  }
  return out;
}

/**
 * Z.15.3: every scheduled routine ran in its last slot, with a tick. A routine
 * that stopped being called (a cron dropped from vercel.json by a generator
 * slip, a route that 404s, a bearer that changed) writes no row at all, so no
 * error-run alert can ever fire for it: seven routines went silent that way
 * before Y.48. `exclude` leaves out the watchdog's own path, whose current run
 * is the one asking.
 */
export function routinesRanLastSlot(exclude: string[] = []): Invariant {
  return {
    id: "Z.15.3",
    name: "every scheduled routine ran in its last slot",
    check: async (now) => {
      const crons = ((vercelConfig as { crons?: CronEntry[] }).crons ?? []).filter((c) => !exclude.includes(c.path));
      const slots = lastSlots(crons, now);
      if (slots.length === 0) return { ok: true, detail: "no scheduled routines" };
      const { data, error } = await companyOs
        .from("routine_runs")
        .select("routine_id, tick_key")
        .in("routine_id", [...new Set(slots.map((s) => s.path))])
        .in("tick_key", [...new Set(slots.map((s) => s.tick))])
        .limit(5000);
      if (error) throw new Error(`routine_runs: ${error.message}`);
      const seen = new Set((data ?? []).map((r) => `${r.routine_id} ${r.tick_key}`));
      const missed = slots.filter((s) => !seen.has(`${s.path} ${s.tick}`));
      // A routine with no run at all is new: its only slot so far came before
      // the deploy that scheduled it (payment-run's first slot is the 15th).
      // That is named but not a failure; one that ran before and has now
      // stopped is the silent routine this invariant exists for.
      const stopped: typeof missed = [];
      const neverRan: string[] = [];
      for (const m of missed) {
        const { data: any, error: anyError } = await companyOs.from("routine_runs").select("id").eq("routine_id", m.path).limit(1);
        if (anyError) throw new Error(`routine_runs: ${anyError.message}`);
        if ((any ?? []).length > 0) stopped.push(m);
        else neverRan.push(m.path);
      }
      const fresh = neverRan.length > 0 ? `; not run yet, new: ${neverRan.join(", ")}` : "";
      if (stopped.length === 0) return { ok: true, detail: `${slots.length - missed.length} of ${slots.length} routines ran in their last slot${fresh}` };
      const named = stopped.slice(0, 8).map((m) => `${m.path} (${m.tick})`).join(", ");
      const more = stopped.length > 8 ? `, and ${stopped.length - 8} more` : "";
      return { ok: false, detail: `${stopped.length} of ${slots.length} routines have no run for their last slot: ${named}${more}${fresh}` };
    },
  };
}

/**
 * Every error run says why (plan G7, failures 9 and 13). An error row with no
 * error text is a failure nobody can act on: the Agents page shows a red badge
 * and nothing else, and the Ops alert carries "unknown error".
 */
export function errorRunsHaveAReason(): Invariant {
  return {
    id: "Z.15.1",
    name: "every error run in the last day names its error",
    check: async (now) => {
      const since = new Date(now.getTime() - 86_400_000).toISOString();
      const { data, error } = await companyOs
        .from("routine_runs")
        .select("routine_id")
        .eq("status", "error")
        .is("error", null)
        .gte("started_at", since)
        .limit(200);
      if (error) throw new Error(`routine_runs: ${error.message}`);
      const rows = data ?? [];
      if (rows.length === 0) return { ok: true, detail: "every error run names its error" };
      const routines = [...new Set(rows.map((r) => r.routine_id))].join(", ");
      return { ok: false, detail: `${rows.length} error run(s) with no error text: ${routines}` };
    },
  };
}
