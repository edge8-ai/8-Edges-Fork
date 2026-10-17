import { companyOs } from "@/kernel/data/supabase";
import { decideRunMode, recordRoutineRun } from "./routine-runs";

// The tick driver (Y.12, plan decision Y.81, ADR 0015). A multi-step routine
// keeps its step in its own table (marketing_campaigns.writer_step,
// email_campaigns.agent_step); each tick of one scheduled route advances every
// run that is at a step by exactly one step. Nothing hands itself on over
// HTTP: the old run loop POSTed the next step to the app's own URL, and in the
// writer's first real run one hand-off of six never arrived, with nothing
// logged on either side.
//
// Each step is a routine run of its own, recorded under the agent's routine id
// with the tick `<run id>:<started at>:<step>`. claim_tick refuses a tick that is running,
// waiting, ok or skipped, so a step a person started from a button (which
// claims the same tick) is never run twice, and a step that passed is never
// repeated. An errored or died step may be claimed again: that is a retry,
// counted from the run log and backed off, and after MAX_ATTEMPTS the driver
// stops the run with the last failure as its error, which the agent's own
// screen shows. Its Retry button gives the run a new start time, so a retried
// step is a new tick and its count starts again.
//
// The driver gives up only from inside a claim it won, so a step a person is
// retrying at that moment is never stopped under them. A paused agent
// (routine_config, Y.7) is left alone without a claim: a claim closed as
// skipped would refuse that tick for good, and the run would stay stuck after
// the pause was lifted.

/**
 * One run at one step. `epoch` is when the run started (the agent's
 * *_started_at): a run stopped and started again reaches its first step anew,
 * and a tick without the epoch would find the old run's passed step and refuse.
 */
export type DrivenRun = { id: string; epoch: string | null; step: string };

export type DrivenAgent = {
  /** Where each step's run is recorded, e.g. "/api/cron/writer-agent/". */
  routineId: string;
  /** Seconds one step may take: the driver route's maxDuration. */
  stepSeconds: number;
  /** Every run at a step: not parked, not stopped, not finished. */
  dueRuns: () => Promise<DrivenRun[]>;
  /** Run the one step the run is at, and answer as a step route would. */
  runStep: (id: string) => Promise<Response>;
  /** Stop the run at `step` with `error` (the agent's own error column). */
  giveUp: (id: string, step: string, error: string) => Promise<void>;
  /** The agent honours shadow mode (Z.17): its steps record what they would send and send nothing. */
  shadow?: boolean;
  /**
   * False drives these runs while the switch is Off (default true). For runs a
   * routine has already taken over from a caller that would otherwise have done
   * the work itself (Z.11: inquiries the contact route left to the chain), so
   * an Off switch stops new work without stranding what was handed over.
   */
  honourPause?: boolean;
};

/** Failed attempts at one step before the driver stops the run. */
export const MAX_ATTEMPTS = 3;

// The wait after the n-th failure before the next attempt: 5, 10, 20 minutes.
// A step usually fails on a model or network error, and retrying it on the
// very next tick mostly meets the same outage.
const BACKOFF_BASE_MS = 5 * 60_000;

/** The tick one step of one run claims. */
export function stepTick(run: DrivenRun): string {
  return `${run.id}:${run.epoch ?? "-"}:${run.step}`;
}

export function backoffMs(failures: number): number {
  return failures <= 0 ? 0 : BACKOFF_BASE_MS * 2 ** (failures - 1);
}

type Failures = { count: number; last: string | null; lastError: string | null };

async function failuresOf(routineId: string, tick: string): Promise<Failures> {
  const { data, error } = await companyOs
    .from("routine_runs")
    .select("started_at, error, summary")
    .eq("routine_id", routineId)
    .eq("tick_key", tick)
    .in("status", ["error", "died"])
    .order("started_at", { ascending: false })
    .limit(MAX_ATTEMPTS + 1);
  // A driver that cannot count a step's failures must not retry it blind,
  // nor give it up on a guess: it leaves the run for the next tick.
  if (error) throw new Error(`routine_runs: ${error.message}`);
  const rows = data ?? [];
  return {
    count: rows.length,
    last: rows[0]?.started_at ?? null,
    lastError: rows[0]?.error ?? rows[0]?.summary ?? null,
  };
}

export type DriveOutcome = {
  routineId: string;
  run: string;
  step: string;
  action: "advanced" | "waiting" | "gave-up" | "unread";
  detail?: string;
};

/**
 * One tick: every agent's due runs, one step each, the runs of all agents in
 * parallel (they are different rows and different model calls). Returns what
 * happened to each run, for the driver route's own run record.
 */
export async function driveAgents(agents: DrivenAgent[], now: Date = new Date()): Promise<DriveOutcome[]> {
  const work: Promise<DriveOutcome>[] = [];
  for (const agent of agents) {
    let due: DrivenRun[];
    try {
      due = await agent.dueRuns();
    } catch (err) {
      work.push(
        Promise.resolve({
          routineId: agent.routineId,
          run: "*",
          step: "*",
          action: "unread",
          detail: err instanceof Error ? err.message : String(err),
        }),
      );
      continue;
    }
    for (const run of due) work.push(driveOne(agent, run, now));
  }
  return Promise.all(work);
}

async function driveOne(agent: DrivenAgent, run: DrivenRun, now: Date): Promise<DriveOutcome> {
  const base = { routineId: agent.routineId, run: run.id, step: run.step };
  const tick = stepTick(run);
  let failures: Failures;
  try {
    failures = await failuresOf(agent.routineId, tick);
  } catch (err) {
    return { ...base, action: "unread", detail: err instanceof Error ? err.message : String(err) };
  }
  const exhausted = failures.count >= MAX_ATTEMPTS;
  if (!exhausted && failures.last && now.getTime() - new Date(failures.last).getTime() < backoffMs(failures.count)) {
    return { ...base, action: "waiting", detail: `backing off after ${failures.count} failure(s)` };
  }
  // The switch is read here, before any claim, so a paused agent's step is
  // left waiting rather than closed as skipped; the mode decided here is the
  // one the step runs in.
  const decision = await decideRunMode(agent.routineId, { honourPause: agent.honourPause !== false, shadowCapable: agent.shadow === true });
  if ("skip" in decision) return { ...base, action: "waiting", detail: decision.skip };
  // recordRoutineRun claims the tick; a claim already held answers
  // tick-taken without calling the step, which is the button's run in flight.
  let gaveUp: string | null = null;
  const res = await recordRoutineRun(
    agent.routineId,
    async () => {
      if (!exhausted) return agent.runStep(run.id);
      gaveUp = `Stopped after ${failures.count} failed attempts at this step. Last: ${failures.lastError ?? "no error recorded"}`;
      await agent.giveUp(run.id, run.step, gaveUp);
      return Response.json({ error: gaveUp }, { status: 500 });
    },
    "vercel",
    { tick, stepSeconds: agent.stepSeconds, shadowCapable: agent.shadow === true, decided: { mode: decision.run } },
  );
  if (gaveUp) return { ...base, action: "gave-up", detail: gaveUp };
  let body: { status?: string; reason?: string; error?: string } | null = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (body?.reason === "tick-taken") return { ...base, action: "waiting", detail: "the step is already running" };
  return { ...base, action: "advanced", detail: res.ok ? undefined : (body?.error ?? `answered ${res.status}`) };
}
