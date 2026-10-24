import type { DrivenAgent, DrivenRun } from "@/kernel/audit/step-driver";
import { runStepNow, tickResponse, whyNotRun } from "./step-now";

// How an agent run moves through its steps (A.2), written once for every
// tick-driven chain that tells a channel when a run parks or stops: the writer
// and the letter agents (entities/campaigns) and the meeting follow-up chain
// (entities/crm, Z.13). It moved here from entities/campaigns with Z.13
// (decision 10), because crm may not import campaigns and a second copy of the
// loop is how two chains drift (rule 3); the campaigns adapter that kept the
// agents' old result shape went with A.43. Each step is one function
// invocation; when a run parks or stops, the chain's own channel hears about
// it once (`notify`: the Marketing chat for the campaigns agents).
//
// Since Y.12 no step hands the run on: the tick driver (step-driver.ts, one
// driver cron per entity) advances every run that is at a step by one step per
// tick, and a person's button runs the step it is at inline so they see
// movement at once (step-now.ts, which the chains outside this loop call too).
// Both claim the same tick, `<run id>:<started at>:<step>`, so a step never
// runs twice. A chain supplies what differs: its advance function, its routine
// id, how to find its runs, and the words for a parked or stopped run.

// What one step reports. `ok` with a `next` state means the step passed and
// says what runs next (a step id) or where the run parked (a state that is not
// a step); `ok: false` is a failed check; `skipped` is a tick with nothing to
// do: no run on this row, or a run that is already parked. `id` is the row the
// run lives on (a campaign, a broadcast, a meeting follow-up).
export type StepResult<Step extends string, State extends string> =
  | { ok: true; id: string; step: Step; next: State; summary: string }
  | { ok: false; id: string; step: Step; error: string }
  | { skipped: string; id: string };

export type RunLoopDefinition<Step extends string, State extends string> = {
  // Where each step is recorded as a routine run (Settings -> Agents).
  routineId: string;
  // Seconds one step may take: the longest a step route or the driver may run.
  stepSeconds: number;
  advance: (id: string) => Promise<StepResult<Step, State>>;
  // The step the row's run is at, or null when it is parked, stopped or finished.
  current: (id: string) => Promise<DrivenRun | null>;
  // Every run at a step, for the driver.
  dueRuns: () => Promise<DrivenRun[]>;
  // Stop the run at `step` with `error` in the chain's own error column.
  stop: (id: string, step: Step, error: string) => Promise<void>;
  // The message for the chain's channel when a passing step leaves the run
  // parked at `next`, or null when `next` is a step the driver will advance to.
  parked: (result: Extract<StepResult<Step, State>, { ok: true }>) => Promise<string | null> | string | null;
  // The message for the chain's channel when a step's check fails.
  stopped: (result: Extract<StepResult<Step, State>, { ok: false }>) => string;
  // Where those two messages go.
  notify: (message: string) => Promise<unknown>;
  // The chain honours shadow mode (Z.17). The driver and a person's button
  // both pass it on, so the switch decides the mode of every step either runs.
  shadow?: boolean;
};

export function runLoop<Step extends string, State extends string>(def: RunLoopDefinition<Step, State>) {
  /** Run the step the row is at, and tell the chain's channel if the run parked or stopped. */
  async function run(id: string): Promise<StepResult<Step, State>> {
    const result = await def.advance(id);
    if ("skipped" in result) return result;
    if (result.ok) {
      const parked = await def.parked(result);
      if (parked) await def.notify(parked);
      return result;
    }
    await def.notify(def.stopped(result));
    return result;
  }

  /**
   * Run the step the row is at now, from a person's button or a cron that
   * opened the run, recorded under the step's own tick. A step that did not
   * run answers skipped, saying why: its tick is held, or the switch said not
   * to run it.
   */
  async function runNow(id: string): Promise<StepResult<Step, State>> {
    const outcome = await runStepNow({ ...def, advance: run }, id);
    return outcome.kind === "ran" ? outcome.result : { skipped: whyNotRun(outcome), id };
  }

  /** The chain as the tick driver drives it. */
  const driven: DrivenAgent = {
    routineId: def.routineId,
    stepSeconds: def.stepSeconds,
    shadow: def.shadow === true,
    dueRuns: def.dueRuns,
    runStep: async (id) => tickResponse(await run(id)),
    giveUp: async (id, step, error) => {
      await def.stop(id, step as Step, error);
      await def.notify(def.stopped({ ok: false, id, step: step as Step, error }));
    },
  };

  return { run, runNow, driven };
}
