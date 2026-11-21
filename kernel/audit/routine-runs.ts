import { randomUUID } from "node:crypto";
import { companyOs } from "@/kernel/data/supabase";
import type { TablesUpdate } from "@/kernel/data/supabase/database.types";
import { declaresShadow } from "./routine-config";
import { judgeResult, type RoutineVerdict } from "./routine-result";
import { outsideShadow, runStore, type RunContext, type RunMode } from "./run-context";
import { decideRunMode, otherModeHolds, type ModeDecision } from "./run-mode";
export { decideRunMode } from "./run-mode";
export type { RunMode } from "./run-context";
import type { RoutineHost } from "./routine-runs-readers";
export {
  aiTokensByRoutine,
  listRoutineRuns,
  recentRunsByRoutine,
  type RecentRun,
  type RoutineHost,
  type RoutineRunStatus,
} from "./routine-runs-readers";
import { alertOnRepeatedFailure } from "./routine-alerts";
import { byHand } from "./run-by-hand";
import { tickForRequest } from "./routine-tick";

// The typed run result lives beside this file; routines import it from here.
export {
  failuresFrom,
  judgeResult,
  routineResult,
} from "./routine-result";

// Run log for scheduled routines. Every Vercel cron wraps its handler in
// withRoutineRun, which claims the run's tick (opening a `running`
// company_os.routine_runs row before any work, Y.6), runs the handler, and
// closes the row with the outcome, the handler's JSON body and the AI
// tokens spent while it ran. Token attribution rides on AsyncLocalStorage:
// kernel/ai/response.ts reports every model call's usage into whichever run is
// active on the current async chain, so no handler has to thread a run id
// through its code. The kernel owns the table; the Settings -> Agents page
// reads it through the list helpers below. Recording is best-effort: a failed
// insert or update is logged and never changes what the routine returns.

/**
 * The usage shape both `messages.create` and a stream's final message carry.
 * It lives here rather than in kernel/ai/response.ts because it describes what
 * a run records; keeping it there made the two modules import each other.
 */
export interface AiUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

// The run context and its readers live in a leaf module so the kernel's
// senders can read the run's mode without importing this file (Z.17).
const storage = runStore();
export { currentRoutineId, currentRunId, currentRunMode } from "./run-context";

/** Called by kernel/ai/response.ts for every model call; a no-op outside a run. */
export function recordAiUsage(usage: AiUsage | null | undefined): void {
  const ctx = storage.getStore();
  if (!ctx || !usage) return;
  ctx.aiCalls += 1;
  ctx.aiInput += usage.input_tokens ?? 0;
  ctx.aiOutput += usage.output_tokens ?? 0;
  ctx.aiCacheRead += usage.cache_read_input_tokens ?? 0;
  ctx.aiCacheWrite += usage.cache_creation_input_tokens ?? 0;
}

// A one-line summary from the handler's JSON: its scalar counters, in order.
// "dueForReview 2, emailsSent 2" says more at a glance than the raw body.
export function summarizeResult(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const parts: string[] = [];
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    // The run's own status column says ok or skipped; repeating it here would
    // push a counter out of the six the line has room for.
    if (k === "status") continue;
    if (typeof v === "number" || typeof v === "boolean") parts.push(`${k} ${v}`);
    else if (typeof v === "string" && v.length <= 80 && k !== "error") parts.push(`${k} ${v}`);
    if (parts.length >= 6) break;
  }
  return parts.length ? parts.join(", ") : null;
}

/** True when the request carries the Vercel Cron bearer (Authorization: Bearer $CRON_SECRET). */
export function hasCronBearer(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && req.headers.get("authorization") === `Bearer ${secret}`;
}

/**
 * Wrap a cron handler: check the Vercel Cron bearer, then record the run. The
 * 401 an unauthorised probe gets is not a run and is not recorded; everything
 * else is. Pass the cron path from vercel.json as the routine id so the Agents
 * page can join runs to schedules.
 */
export async function withRoutineRun(
  routineId: string,
  req: Request,
  handler: (req: Request) => Promise<Response>,
  host: RoutineHost = "vercel",
  opts: Pick<RecordOptions, "stepSeconds" | "honourPause"> = {},
): Promise<Response> {
  // The bearer gate for every wrapped entry point. Vercel Cron sends
  // Authorization: Bearer $CRON_SECRET; anything else is not a run and is not
  // recorded. It lives here rather than in each handler because every handler
  // carried a byte-identical copy of it, and a copy is how one of them ends up
  // missing the check. Run now on Settings -> Agents calls the handler
  // in-process after its own guard (run-by-hand.ts), so it carries no bearer.
  const hand = byHand();
  if (!hand && !hasCronBearer(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Vercel Cron's delivery claims its schedule slot; a run by hand (the
  // runbook's curl, the Mac mini's in-process GET, a POST, Run now) claims a
  // tick of its own. Run now runs a routine that is off, as any button does;
  // every other call honours the pause. Run now runs inside the agents page's
  // server action (maxDuration 300), not the route's own, so its step deadline
  // is the default whatever the route declares: a 60 s deadline would have the
  // reaper mark a run died while the action still runs it.
  return recordRoutineRun(routineId, () => handler(req), host, {
    tick: tickForRequest(routineId, req),
    ...opts,
    // A scheduled run honours the pause unless its routine says otherwise (a
    // driver whose handler decides what Off means for it, Z.11); a run by hand
    // never does.
    honourPause: hand ? false : (opts.honourPause ?? true),
    ...(hand ? { stepSeconds: DEFAULT_STEP_SECONDS, startedBy: hand.actor } : {}),
  });
}

// The longest maxDuration any route declares (entities/*/mounts.ts), and
// Vercel's default for a route that declares none. A run's step deadline is its
// claim time plus its route's maxDuration, so the reaper marks a killed function
// died as soon as Vercel has killed it and never while it may still run. A route
// with a shorter maxDuration passes it as stepSeconds; the test beside this file
// holds every cron to its mount (Y.13).
const DEFAULT_STEP_SECONDS = 300;

/** A throw or a non-2xx is an error; otherwise the outcome rule decides. */
function outcomeOf(response: Response, body: unknown): RoutineVerdict {
  const verdict = judgeResult(body);
  if (!response.ok) return { status: "error", error: verdict.error };
  return verdict;
}

export type RecordOptions = {
  /** The tick this run claims: a schedule slot for a cron; omitted, a fresh UUID, for a button. */
  tick?: string;
  /** Seconds the run may take before the reaper marks it died. */
  stepSeconds?: number;
  /**
   * Skip the work when routine_config pauses this routine (Y.7). Set for every
   * scheduled entry point by withRoutineRun; a person's button runs what they
   * asked for.
   */
  honourPause?: boolean;
  /** Who pressed Run now; written into the row's log as soon as it is claimed (Y.25). */
  startedBy?: string;
  /** Honours shadow mode (Z.17): by default its cron's `automation` block says; the agent driver passes its own. */
  shadowCapable?: boolean;
  /** The mode already decided by the caller (the agent driver), so the switch is not read twice. */
  decided?: { mode: RunMode };
};

type RunOutcome = TablesUpdate<{ schema: "company_os" }, "routine_runs">;

/**
 * Record one execution of a routine without a bearer gate: for work that is
 * already inside an authenticated request (a server action running the writer
 * agent's first step) and still belongs in Settings -> Agents with its tokens.
 * The handler's JSON body becomes the run's result and summary, as for a cron.
 *
 * The row opens before the handler runs (Y.6): claim_tick inserts a `running`
 * row for the tick, and a tick that is already running, waiting, ok or skipped
 * is not run again — the call answers `{ status: "skipped", reason:
 * "tick-taken" }` without calling the handler. The close is fenced to a row
 * still running or waiting, so a run the reaper already marked died stays
 * died and the late result is logged instead. The status is explicit (Y.34):
 * `status: "skipped"` in the body is a skipped run, a throw or a non-2xx is an
 * error, and anything else is ok — a counter named `skipped` is only a counter.
 */
export async function recordRoutineRun(
  routineId: string,
  handler: () => Promise<Response>,
  host: RoutineHost = "vercel",
  opts: RecordOptions = {},
): Promise<Response> {
  const startedAt = new Date();
  const tick = opts.tick ?? randomUUID();
  // The mode is decided before the claim, because the tick is claimed per
  // mode: a shadow run and a live run of the same slot are different rows
  // (routine_runs_one_tick), and the row says which one it was from its first
  // moment. A skipped run claims as live, as a paused one always has.
  const shadowCapable = opts.shadowCapable ?? declaresShadow(routineId);
  let decision: ModeDecision = opts.decided
    ? { run: opts.decided.mode }
    : await decideRunMode(routineId, { honourPause: Boolean(opts.honourPause), shadowCapable });
  // A run started inside a shadow run (background work, a nested handler)
  // stays in shadow whatever its own switch says, or does not run at all: a
  // shadow parent must not reach the world through a live child.
  if (storage.getStore()?.mode === "shadow" && "run" in decision) {
    decision = shadowCapable ? { run: "shadow" } : { skip: "started inside a shadow run, and this routine does not support shadow" };
  }
  const mode: RunMode = "run" in decision ? decision.run : "live";
  const ctx: RunContext = { routineId, runId: null, mode, aiCalls: 0, aiInput: 0, aiOutput: 0, aiCacheRead: 0, aiCacheWrite: 0, withheld: [] };

  const claim = await claimTick(routineId, tick, mode, host, opts.stepSeconds ?? DEFAULT_STEP_SECONDS);
  // Until the migration lands the function does not exist. Recording has
  // always been best-effort and must never stop a routine, so a failed claim
  // runs the work and writes one closed row at the end, as before Y.6. That
  // loses the one-run-per-tick guarantee for as long as the claim fails,
  // which is the behaviour every routine had before it existed.
  const runId: string | null = claim.error ? null : claim.id;
  ctx.runId = runId;
  if (claim.error) {
    console.error(`[routine-runs] ${routineId}: tick claim failed, recording at the end: ${claim.error}`);
  } else if (!runId) {
    console.log(`[routine-runs] ${routineId}: tick ${tick} is already taken; not running it again`);
    return Response.json({ status: "skipped", reason: "tick-taken" });
  }
  // Who started a run by hand is on the row from its first moment, so a run
  // that never closes, or an audit insert that failed, still names them.
  const startLog = opts.startedBy ? `Run now by ${opts.startedBy}` : null;
  if (runId && startLog) {
    const { error } = await companyOs.from("routine_runs").update({ log: startLog }).eq("id", runId);
    if (error) console.error(`[routine-runs] ${routineId}: could not note who started run ${runId}: ${error.message}`);
  }

  // One tick, one run, whatever the mode (Z.17): the claim is per mode, so a
  // routine that can run in shadow checks the other mode holds no run of this
  // tick (a person's live Run now beside the driver's shadow step). A tick
  // held, or not checkable, releases this claim without running.
  if (runId && shadowCapable && opts.tick) {
    const held = await otherModeHolds(routineId, runId, tick, mode);
    if (held) {
      console.log(`[routine-runs] ${routineId}: tick ${tick}: ${held}; not running it`);
      return Response.json({ status: "skipped", reason: "tick-taken", detail: held });
    }
  }

  // A paused routine records a skipped run naming the reason, once per tick,
  // and does none of the work.
  if ("skip" in decision) {
    const reason = decision.skip;
    const finishedAt = new Date();
    const outcome = {
      status: "skipped" as const,
      finished_at: finishedAt.toISOString(),
      duration_ms: finishedAt.getTime() - startedAt.getTime(),
      summary: reason,
      result: { status: "skipped", reason } as never,
      error: null,
    };
    if (runId) await closeRun(routineId, runId, outcome);
    else {
      const { error } = await companyOs
        .from("routine_runs")
        .insert({ routine_id: routineId, host, started_at: startedAt.toISOString(), log: startLog, ...outcome });
      if (error) console.error(`[routine-runs] ${routineId}: ${error.message}`);
    }
    console.log(`[routine-runs] ${routineId}: ${reason}`);
    return Response.json({ status: "skipped", reason });
  }

  return storage.run(ctx, async () => {
    let response: Response;
    let failure: string | null = null;
    try {
      response = await handler();
    } catch (err) {
      // Next signals "this route cannot be prerendered" by throwing while it
      // probes the handler at build time. That is not a run: close the claimed
      // row as skipped and let the signal through, or the build records a
      // phantom error and may freeze the probe's response as the route's
      // static output.
      if ((err as { digest?: string })?.digest === "DYNAMIC_SERVER_USAGE") {
        if (runId) {
          await closeRun(routineId, runId, {
            status: "skipped",
            finished_at: new Date().toISOString(),
            summary: "prerender probe, not a run",
          });
        }
        throw err;
      }
      failure = err instanceof Error ? (err.stack ?? err.message) : String(err);
      response = Response.json({ error: failure.split("\n")[0] }, { status: 500 });
    }

    // Read the body off a clone so the caller's response stream is untouched.
    let body: unknown = null;
    try {
      body = await response.clone().json();
    } catch {
      body = null;
    }
    const finishedAt = new Date();
    const verdict = failure ? null : outcomeOf(response, body);
    const status = verdict ? verdict.status : ("error" as const);
    const said = failure ? failure.split("\n")[0] : summarizeResult(body);
    const held = ctx.withheld.length ? `${ctx.withheld.length} send${ctx.withheld.length === 1 ? "" : "s"}` : null;
    const outcome = {
      status,
      finished_at: finishedAt.toISOString(),
      duration_ms: finishedAt.getTime() - startedAt.getTime(),
      // A shadow run says so first, so its line on Settings -> Agents is never
      // read as a run that sent something, and its log lists what it held back.
      summary: mode === "shadow" ? `shadow${held ? ` (held back ${held})` : ""}: ${said ?? "nothing to report"}` : said,
      ...(ctx.withheld.length ? { log: [startLog, ...ctx.withheld.map((w) => `held back ${w.channel}: ${w.what}`)].filter(Boolean).join("\n") } : {}),
      result: body as never,
      error:
        failure ??
        ((body as Record<string, unknown> | null)?.error as string | undefined) ??
        verdict?.error ??
        null,
      ai_calls: ctx.aiCalls,
      ai_input_tokens: ctx.aiInput,
      ai_output_tokens: ctx.aiOutput,
      ai_cache_read_tokens: ctx.aiCacheRead,
      ai_cache_write_tokens: ctx.aiCacheWrite,
    };
    if (runId) {
      await closeRun(routineId, runId, outcome);
    } else {
      const { data, error } = await companyOs
        .from("routine_runs")
        .insert({ routine_id: routineId, host, mode, started_at: startedAt.toISOString(), log: startLog, ...outcome })
        .select("id")
        .single();
      if (error) console.error(`[routine-runs] ${routineId}: ${error.message}`);
      else console.log(`[routine-runs] ${routineId}: ${status} run ${data.id}`);
    }
    if (status === "error") {
      // On the shadow allowlist: Operations hears a routine is failing in any mode.
      await outsideShadow("the alert about the run's own repeated failure", () =>
        alertOnRepeatedFailure(routineId, runId, startedAt, outcome.error ?? outcome.summary ?? "unknown error"),
      );
    }
    return response;
  });
}

// The claim, with a throw folded into the error arm: a client that throws
// (a network failure, or a test double without rpc) must not stop the run
// any more than a returned error does.
async function claimTick(
  routineId: string,
  tick: string,
  mode: RunMode,
  host: RoutineHost,
  stepSeconds: number,
): Promise<{ id: string | null; error: null } | { id: null; error: string }> {
  try {
    const { data, error } = await companyOs.rpc("claim_tick", {
      p_routine: routineId,
      p_tick: tick,
      p_mode: mode,
      p_host: host,
      p_step_s: stepSeconds,
    });
    if (error) return { id: null, error: error.message };
    return { id: data ?? null, error: null };
  } catch (err) {
    return { id: null, error: err instanceof Error ? err.message : String(err) };
  }
}

// The fenced close: only a row still running or waiting takes the outcome.
// Zero rows means the reaper marked the run died while it worked, and the
// late result is logged rather than applied, so `died` stays the record.
async function closeRun(routineId: string, runId: string, outcome: RunOutcome): Promise<void> {
  const { data, error } = await companyOs
    .from("routine_runs")
    .update(outcome)
    .eq("id", runId)
    .in("status", ["running", "waiting"])
    .select("id");
  if (error) {
    console.error(`[routine-runs] ${routineId}: closing run ${runId} failed: ${error.message}`);
  } else if (!data || data.length === 0) {
    console.warn(
      `[routine-runs] ${routineId}: late result for run ${runId}, which is no longer running; not applied: ${outcome.status} ${outcome.summary ?? ""}`,
    );
  } else {
    console.log(`[routine-runs] ${routineId}: ${outcome.status} run ${runId}`);
  }
}

