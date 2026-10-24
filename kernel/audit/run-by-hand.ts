import { AsyncLocalStorage } from "node:async_hooks";

// A run a person started from Settings -> Agents (Y.25). Run now calls the
// routine's own cron handler in-process, not over HTTP (the letter's call to
// its own site came back 508, loop detected, Y.75), so withRoutineRun needs
// another way to know that this call is a person's and not a delivery of the
// schedule: it is made inside runByHand, and withRoutineRun asks byHand().
//
// Only server code can enter this context, after the action's own guard, so
// a run inside it needs no cron bearer. It claims a fresh tick, like any call
// outside the schedule, and it runs even when the routine is off: a person's
// button runs what they asked for (routine_config, Y.7), and the pause stops
// the schedule only.
//
// Keyed on globalThis with Symbol.for, because Next gives instrumentation,
// pages and server actions their own copy of each module (W.170): the action
// enters the context from its copy of this file, and the cron handler, which
// the composition root registered from instrumentation, reads it from
// another.

export type ByHand = {
  /** Who pressed Run now, for the log line. */
  actor: string;
};

const KEY = Symbol.for("edge8.audit.run-by-hand");

function storage(): AsyncLocalStorage<ByHand> {
  const g = globalThis as unknown as Record<symbol, AsyncLocalStorage<ByHand> | undefined>;
  return (g[KEY] ??= new AsyncLocalStorage<ByHand>());
}

/** Run `fn` as a person's run: withRoutineRun inside it skips the bearer and the pause. */
export function runByHand<T>(by: ByHand, fn: () => Promise<T>): Promise<T> {
  return storage().run(by, fn);
}

/** The person whose Run now this call is part of; null for every other call. */
export function byHand(): ByHand | null {
  return storage().getStore() ?? null;
}
