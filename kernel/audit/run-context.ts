import { AsyncLocalStorage } from "node:async_hooks";

// The routine run on the current async chain (routine-runs.ts opens it) and
// what the kernel's senders ask it (Z.17). A leaf: it imports nothing of the
// app, so kernel/messaging and kernel/events can read the run's mode without
// importing routine-runs.ts, which imports kernel/messaging itself.
//
// Keyed on globalThis with Symbol.for, because Next gives instrumentation,
// routes and actions their own copy of each module (W.170): a cron handler
// registered from instrumentation and the sender it calls must see one store.

/**
 * Whether a run acts (live) or only records what it would have done (shadow,
 * Z.17). The same two values as routine_runs.mode.
 */
export type RunMode = "live" | "shadow";

/** A send a shadow run held back, for the run's log. Never a body, an address or a person's name. */
export type Withheld = { channel: "email" | "lark" | "lark-dm" | "lark-card" | "telegram" | "event"; what: string };

export type RunContext = {
  /** The routine this run belongs to. */
  routineId: string;
  /** The run's routine_runs row, once its tick is claimed; null when the claim failed. */
  runId: string | null;
  mode: RunMode;
  aiCalls: number;
  aiInput: number;
  aiOutput: number;
  aiCacheRead: number;
  aiCacheWrite: number;
  /** What the kernel's senders held back in shadow. */
  withheld: Withheld[];
};

const KEY = Symbol.for("edge8.audit.run-context");

/** The store routine-runs.ts runs each routine inside. */
export function runStore(): AsyncLocalStorage<RunContext> {
  const g = globalThis as unknown as Record<symbol, AsyncLocalStorage<RunContext> | undefined>;
  return (g[KEY] ??= new AsyncLocalStorage<RunContext>());
}

/** The routine run on the current async chain, for the AI call ledger (Y.72.1); null outside a run. */
export function currentRunId(): string | null {
  return runStore().getStore()?.runId ?? null;
}

/** The routine on the current async chain, for the effect ledger (Z.1); null outside a run. */
export function currentRoutineId(): string | null {
  return runStore().getStore()?.routineId ?? null;
}

/**
 * Whether the run on the current async chain acts or only records (Z.17).
 * Outside a run (a person's button) it is live. The kernel's senders already
 * hold back in shadow (heldInShadow); a routine asks this before any other
 * outward effect: a write to another system, or a state change a live run
 * would make because it sent something.
 */
export function currentRunMode(): RunMode {
  return runStore().getStore()?.mode ?? "live";
}

const WHAT_MAX = 160;

/**
 * Called by each kernel sender first. In a shadow run it notes what would have
 * been sent, for the run's log, and answers true: the caller sends nothing and
 * reports the send as not delivered, which is the truth. Outside shadow it
 * answers false and the send goes ahead.
 */
export function heldInShadow(channel: Withheld["channel"], what: string): boolean {
  const ctx = runStore().getStore();
  if (!ctx || ctx.mode !== "shadow") return false;
  const line = what.replace(/\s+/g, " ").trim().slice(0, WHAT_MAX);
  ctx.withheld.push({ channel, what: line });
  console.log(`[shadow] ${ctx.routineId}: held back ${channel}: ${line}`);
  return true;
}

/**
 * Run `fn` as shadow, whatever mode the current run is in: every kernel sender
 * holds back and `once` records instead of acting. For a run whose own record
 * was opened in shadow (Z.11: an inquiry the contact route already handled the
 * old way while the chain only watched), when the routine's switch has since
 * moved and the run itself is live. The opposite of `outsideShadow`, and safe
 * in the direction that matters: it can only stop a send, never make one.
 * Outside any run it opens a shadow context of its own under `routineId`.
 */
export function insideShadow<T>(routineId: string, fn: () => T): T {
  const ctx = runStore().getStore();
  if (ctx?.mode === "shadow") return fn();
  if (!ctx) return runStore().run({ routineId, runId: null, mode: "shadow", aiCalls: 0, aiInput: 0, aiOutput: 0, aiCacheRead: 0, aiCacheWrite: 0, withheld: [] }, fn);
  const shadow: RunContext = { ...ctx, mode: "shadow" };
  // The copy's AI counters go back to the run they belong to when fn ends.
  const settle = () => {
    ctx.aiCalls = shadow.aiCalls;
    ctx.aiInput = shadow.aiInput;
    ctx.aiOutput = shadow.aiOutput;
    ctx.aiCacheRead = shadow.aiCacheRead;
    ctx.aiCacheWrite = shadow.aiCacheWrite;
  };
  const out = runStore().run(shadow, fn);
  if (out && typeof (out as { then?: unknown }).then === "function") {
    return (out as unknown as Promise<unknown>).finally(settle) as unknown as T;
  }
  settle();
  return out;
}

/**
 * Run `fn` as live inside a shadow run. The allowlist of sends that go out in
 * shadow is every call of this, each with its reason; today the only one is
 * the alert about the run's own repeated failure (routine-runs.ts), because
 * Operations must hear that a routine is failing whatever mode it is in.
 */
export function outsideShadow<T>(reason: string, fn: () => T): T {
  const ctx = runStore().getStore();
  if (!ctx || ctx.mode !== "shadow") return fn();
  console.log(`[shadow] ${ctx.routineId}: sent although in shadow: ${reason}`);
  return runStore().run({ ...ctx, mode: "live" }, fn);
}
