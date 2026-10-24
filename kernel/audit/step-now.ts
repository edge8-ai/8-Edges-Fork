import { companyOs } from "@/kernel/data/supabase";
import { decideRunMode, recordRoutineRun } from "./routine-runs";
import { currentRunId } from "./run-context";
import { stepTick, type DrivenRun } from "./step-driver";

// A person's button on a tick-driven chain (ADR 0015, A.43): run the step the
// row is at now, under the same tick the driver claims, so the two never both
// run it. Every chain has this button, and five of them wrote it out: find the
// step, claim its tick through the run recorder, run the chain's advance, and
// say what happened when the step did not run. The copies drifted. One counted
// a step that waits for the switch as a failed attempt, which spends one of the
// three the driver allows a live run; one said "already running" whatever kept
// the step from running, because it never read the recorder's answer. Here it
// is written once, and its answer is one of four things a person can be told.
//
// A chain keeps its own steps: `advance` is the chain's, and so is the result
// it returns. This module only needs to tell four answers apart, which every
// chain's result already does by shape.

/** A step's answer, whatever else its chain puts on it. */
export type StepAnswer = { ok: true } | { ok: false; error: string } | { skipped: string } | { waiting: string };

/** A step that ran: it passed or it failed, in the chain's own shape. */
export type Ran<R extends StepAnswer> = Exclude<R, { skipped: string } | { waiting: string }>;

/**
 * What a person's button did.
 *
 * - ran: the step ran; `result` says whether it passed.
 * - waiting: the step cannot run in this mode (a live run's outward step in a
 *   shadow tick) and waits for the switch. Not a failure, and not an attempt.
 * - held: another run holds the step's tick, the driver's or another person's;
 *   `holder` is what the run recorder said about it.
 * - refused: nothing ran: the row is not at a step, the switch says not to run,
 *   or the step found nothing to do.
 */
export type StepNowOutcome<R extends StepAnswer> =
  | { kind: "ran"; result: Ran<R> }
  | { kind: "waiting"; why: string }
  | { kind: "held"; holder: string }
  | { kind: "refused"; error: string };

export type StepNowDefinition<R extends StepAnswer> = {
  /** Where each step is recorded as a routine run (Settings -> Agents). */
  routineId: string;
  /** Seconds one step may take. */
  stepSeconds: number;
  /** The chain honours shadow mode (Z.17), so the switch decides the step's mode. */
  shadow?: boolean;
  /** The step the row's run is at, or null when it is parked, stopped or finished. */
  current: (id: string) => Promise<DrivenRun | null>;
  /** Run the step the row is at, once. */
  advance: (id: string) => Promise<R>;
};

/**
 * Close the claimed tick of a step that waits without keeping it. The recorder
 * keeps the tick of a run that closes skipped, and claim_tick then refuses that
 * tick for good; worse, the other mode's run of it stands down while this one
 * holds it (run-mode.ts, otherModeHolds), so the live step it waits for would
 * never run. Releasing the tick first lets the row close as a skipped run that
 * says why, holding nothing. Answers the error when it could not be released.
 */
async function releaseTick(): Promise<string | null> {
  const runId = currentRunId();
  // No claim was made (the recorder's best-effort path): there is no tick to keep.
  if (!runId) return null;
  try {
    const { error } = await companyOs.from("routine_runs").update({ tick_key: null }).eq("id", runId).eq("status", "running");
    return error ? error.message : null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

/**
 * A step's answer inside its claimed tick, as the run recorder reads it (Y.34).
 * A failed check is a 422, so the run records as an error and the driver
 * retries it. A step with nothing to do must not close the tick as skipped
 * (claim_tick would refuse it for good), so it is a 409 that says why. A step
 * that waits closes as skipped once its tick is released, so it is neither an
 * error nor a held tick; if the release fails it is a 409 instead, which costs
 * an attempt but never strands the step.
 */
export async function tickResponse(result: StepAnswer): Promise<Response> {
  if ("waiting" in result) {
    const kept = await releaseTick();
    if (!kept) return Response.json({ ...result, status: "skipped", reason: result.waiting });
    return Response.json({ ...result, error: `Nothing run: ${result.waiting} (the tick could not be released: ${kept})` }, { status: 409 });
  }
  if ("skipped" in result) return Response.json({ ...result, error: `Nothing run: ${result.skipped}` }, { status: 409 });
  if (!result.ok) return Response.json(result, { status: 422 });
  return Response.json(result);
}

/** Why the recorder did not run the step, from its own answer. */
async function notRun(res: Response): Promise<StepNowOutcome<never>> {
  let body: { reason?: unknown; detail?: unknown } | null = null;
  try {
    body = (await res.json()) as { reason?: unknown; detail?: unknown };
  } catch {
    body = null;
  }
  const reason = typeof body?.reason === "string" ? body.reason : null;
  if (!reason) return { kind: "refused", error: "Not run: the run recorder did not say why." };
  if (reason === "tick-taken") {
    // The recorder names the holder when it is the other mode's run (Z.17);
    // a plain tick-taken is a run of this step in this mode, already running.
    const detail = typeof body?.detail === "string" ? body.detail : null;
    return { kind: "held", holder: detail ? `Not run: ${detail}.` : "The step is already running." };
  }
  return { kind: "refused", error: `Not run: ${reason}.` };
}

/**
 * Run the step a row is at now, from a person's button, under that step's tick.
 *
 * The switch is read before the tick is claimed, in the driver's order
 * (step-driver.ts, A.49). Left to the recorder, a switch that says not to run
 * would still claim the tick and close it skipped, and claim_tick refuses a
 * skipped tick for good: the step could never run again under that tick, from
 * the driver or the button. Read first, a refusal opens no row and claims
 * nothing. A person's button does not honour a pause (Y.25): a paused routine
 * still runs the step a person asked for, live, as Run now on Settings ->
 * Agents does. What it refuses is what the recorder would have skipped: a
 * shadow chain whose switch cannot be read, or a switch set to shadow on a
 * chain that cannot run in shadow.
 */
export async function runStepNow<R extends StepAnswer>(def: StepNowDefinition<R>, id: string): Promise<StepNowOutcome<R>> {
  const at = await def.current(id);
  if (!at) return { kind: "refused", error: "The run is not at a step." };
  const shadowCapable = def.shadow === true;
  const decision = await decideRunMode(def.routineId, { honourPause: false, shadowCapable });
  if ("skip" in decision) return { kind: "refused", error: `Not run: ${decision.skip}.` };
  const answered: { result: R | null } = { result: null };
  const res = await recordRoutineRun(
    def.routineId,
    async () => {
      answered.result = await def.advance(id);
      return tickResponse(answered.result);
    },
    "vercel",
    { tick: stepTick(at), stepSeconds: def.stepSeconds, shadowCapable, decided: { mode: decision.run } },
  );
  const result: StepAnswer | null = answered.result;
  if (!result) return notRun(res);
  if ("waiting" in result) return { kind: "waiting", why: result.waiting };
  if ("skipped" in result) return { kind: "refused", error: result.skipped };
  return { kind: "ran", result: result as Ran<R> };
}

/** A step that did not run, as the one sentence a button shows. */
export function whyNotRun(outcome: Exclude<StepNowOutcome<StepAnswer>, { kind: "ran" }>): string {
  if (outcome.kind === "waiting") return outcome.why;
  if (outcome.kind === "held") return outcome.holder;
  return outcome.error;
}
