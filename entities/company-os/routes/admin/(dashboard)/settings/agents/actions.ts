"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit } from "@/kernel/audit/audit";
import { settleUnknownEffect } from "@/kernel/audit/effects";
import { PAUSE_REASON_MAX, pauseRoutine, resumeRoutine, shadowRoutine } from "@/kernel/audit/routine-config";
import { runRoutineByHand } from "@/kernel/audit/routine-entry-points";
import { recentRunsByRoutine } from "@/kernel/audit/routine-runs";
import { zodIssuesToMessage } from "@/kernel/config/schemas";
import type { Result } from "@/kernel/data/result";
import { requirePermission } from "@/kernel/identity/access-request";
import { findRoutine } from "@/entities/company-os/lib/agent-management";

// The controls on Settings -> Agents (Y.25): the switch, Run now, and a
// person's answer to a send nobody can vouch for. Each is the runbook's step
// made a click (docs/operations/routines-runbook.md), guarded first and
// audited. The kernel owns the tables, so the writes go through it.

const PAGE = "/admin/settings/agents";

const routineId = z.string().min(1).max(200);
const pauseInput = z.object({
  routineId,
  reason: z.string().trim().min(1, "Say why it is off: every skipped run repeats the reason.").max(PAUSE_REASON_MAX),
});
const settleInput = z.object({ effectId: z.string().uuid(), outcome: z.enum(["done", "released"]) });

/** Turn a routine off. Every scheduled tick then records a skipped run saying why. */
export async function turnRoutineOff(raw: { routineId: string; reason: string }): Promise<Result> {
  const { user, personId } = await requirePermission("company-os.routine-control");
  const parsed = pauseInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const routine = findRoutine(parsed.data.routineId);
  if (!routine?.controls.pause) return { ok: false, error: "That routine has no switch: nothing on its path reads one." };
  const saved = await pauseRoutine(routine.id, parsed.data.reason, personId);
  if (!saved.ok) return saved;
  // routine_config is keyed by the routine's path, not a uuid, so the path
  // goes in the context and the row names no record id (B.13).
  await recordAudit({
    table: "routine_config",
    recordId: null,
    operation: "update",
    actor: user.email,
    newData: { mode: "paused", paused_reason: parsed.data.reason },
    context: { routine: routine.id, trigger: "settings-agents-switch" },
  });
  revalidatePath(PAGE);
  return { ok: true };
}

/** Turn a routine back on. */
export async function turnRoutineOn(raw: { routineId: string }): Promise<Result> {
  const { user, personId } = await requirePermission("company-os.routine-control");
  const parsed = routineId.safeParse(raw?.routineId);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const routine = findRoutine(parsed.data);
  if (!routine?.controls.pause) return { ok: false, error: "That routine has no switch: nothing on its path reads one." };
  const saved = await resumeRoutine(routine.id, personId);
  if (!saved.ok) return saved;
  await recordAudit({
    table: "routine_config",
    recordId: null,
    operation: "update",
    actor: user.email,
    newData: { mode: "live", paused_reason: null },
    context: { routine: routine.id, trigger: "settings-agents-switch" },
  });
  revalidatePath(PAGE);
  return { ok: true };
}

/**
 * Put a routine into shadow (Z.17): it runs, records what it would have sent,
 * and sends nothing. Offered only for a routine whose automation block
 * declares shadow; any other would send for real, so this refuses it.
 */
export async function turnRoutineShadow(raw: { routineId: string }): Promise<Result> {
  const { user, personId } = await requirePermission("company-os.routine-control");
  const parsed = routineId.safeParse(raw?.routineId);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const routine = findRoutine(parsed.data);
  if (!routine?.controls.pause || !routine.controls.shadow) {
    return { ok: false, error: "That routine does not support shadow: it would send for real." };
  }
  const saved = await shadowRoutine(routine.id, personId);
  if (!saved.ok) return saved;
  await recordAudit({
    table: "routine_config",
    recordId: null,
    operation: "update",
    actor: user.email,
    newData: { mode: "shadow", paused_reason: null },
    context: { routine: routine.id, trigger: "settings-agents-switch" },
  });
  revalidatePath(PAGE);
  return { ok: true };
}

/**
 * Run a scheduled routine now, in this process, through its own handler: the
 * same claim, effect keys and outcome rule as the schedule's run, in a fresh
 * tick. It runs even when the routine is off (a person's button runs what
 * they asked for). The run's own row is the record; the answer is for the
 * button.
 */
export async function runRoutineNow(raw: { routineId: string }): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const { user } = await requirePermission("company-os.routine-control");
  const parsed = routineId.safeParse(raw?.routineId);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const routine = findRoutine(parsed.data);
  if (!routine?.controls.runNow) return { ok: false, error: "That routine has no schedule this button can repeat." };
  // One run at a time: a run by hand claims a fresh tick, so the tick cannot
  // stop a second one starting beside a run still in flight. A failed read
  // refuses rather than starting blind.
  let latest: { status: string } | undefined;
  try {
    latest = (await recentRunsByRoutine([routine.id], 1)).get(routine.id)?.[0];
  } catch (err) {
    return { ok: false, error: `Its last run could not be read, so nothing was started: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (latest?.status === "running" || latest?.status === "waiting") {
    return { ok: false, error: `It is ${latest.status} already. Run now starts another only once that run has ended.` };
  }
  // Audited before the run, so a run that never returns (killed at the
  // route's maxDuration) still says who started it.
  await recordAudit({
    table: "routine_runs",
    recordId: null,
    operation: "insert",
    actor: user.email,
    context: { trigger: "run-now", routine: routine.id },
  });
  const run = await runRoutineByHand(routine.id, user.email);
  revalidatePath(PAGE);
  revalidatePath(`${PAGE}/${encodeURIComponent(routine.id)}`);
  if (!run.ok) return run;
  if (run.status === "error") return { ok: false, error: `The run failed: ${run.summary ?? "no reason given"}` };
  const said = run.summary ? `: ${run.summary}` : ".";
  return { ok: true, message: run.status === "skipped" ? `Ran, and skipped${said}` : `Ran${said}` };
}

/**
 * Settle a send whose outcome is unknown: `done` when it did happen, so no run
 * repeats it; `released` when it did not, so the next run sends it.
 */
export async function settleSend(raw: { effectId: string; outcome: "done" | "released" }): Promise<Result> {
  const { user } = await requirePermission("company-os.routine-control");
  const parsed = settleInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const settled = await settleUnknownEffect(parsed.data.effectId, parsed.data.outcome);
  if (!settled.ok) return settled;
  await recordAudit({
    table: "automation_effects",
    recordId: parsed.data.effectId,
    operation: "update",
    actor: user.email,
    oldData: { status: "unknown" },
    newData: { status: parsed.data.outcome },
    context: { key: settled.key, routine: settled.routineId, trigger: "settings-agents-settle" },
  });
  revalidatePath(PAGE);
  return { ok: true };
}
