import { companyOs } from "@/kernel/data/supabase";
import { recordAudit } from "@/kernel/audit/audit";
import { cleanTokens, DERIVED_TOKENS_ERROR, subtaskRowsOnly, sumSubtaskTokens } from "./tokens";

// The card estimate, owned in one place (A.29.2).
//
// A card with sized subtasks is worth their sum (the additive scale in
// .claude/skills/workboard-cards/SKILL.md). The rule used to be enforced by
// whoever happened to write the column: updateCard refused a typed figure on
// such a parent, but setTaskTokens wrote any row, so only the List's disabled
// input stood between a person and a parent figure that disagreed with its
// subtasks. Every app write of tasks.human_tokens now comes through here.
//
// A plain module, not "use server": the actions keep their guard inline
// (ADR-0007) and call this once the guard has passed. The rule lives here; the
// sentence an action says about a half-done write ("Card archived, but …")
// stays with the action, because only the action knows its own verb.
//
// ACCEPTED RACE. The refusal reads the subtasks and then writes the parent,
// with no lock between the two, so a subtask sized in that gap can leave the
// parent disagreeing until the next save. Both writes are human-paced, the
// workboard-cards skill's guard query finds any disagreement, and closing the
// gap properly is a trigger's job — the premise for which is the guard ever
// returning a row again (W.97 was the one known break, made by SQL outside the
// app).

/** What happened to an estimate write. `stage` says how far it got. */
export type EstimateOutcome =
  | { ok: true }
  // Nothing was written: the figure was refused, or the row or its subtasks
  // could not be read, or the write itself failed.
  | { ok: false; stage: "refused" | "read" | "write"; error: string }
  // The row's own estimate was written; its parent could not be re-derived.
  | { ok: false; stage: "parent"; error: string }
  // The parent could not be re-derived after a sized subtask was cleared, so
  // the subtask's figure was put back: net, nothing changed, and saving again
  // retries from the same state.
  | { ok: false; stage: "reverted"; error: string };

/** An estimate that may be written: the value, and what writing it means for a parent. */
export type EstimatePlan = {
  ok: true;
  taskId: string;
  /** The snapped value to write. */
  human_tokens: number | null;
  parentId: string | null;
  /** What the row held before this write, so a clear whose parent fails can be put back. */
  previous: number | null;
};

/** What went wrong after the write, in words, and whether the row's own estimate was put back. */
export type EstimateProblem = { error: string; reverted: boolean };

/**
 * Decide an estimate WITHOUT writing it (W.130). Refuses a typed figure on a
 * parent whose subtasks are sized — unless it IS their sum, so a form that
 * always sends the field can still save — and snaps the value to the 0.05
 * grid. A caller writing other fields too (updateCard) puts `human_tokens` in
 * its one write, so a failed write leaves no estimate behind and one save is
 * one audit row; then it calls `estimateWritten`.
 */
export async function planEstimate(taskId: string, typed: number | null): Promise<EstimatePlan | { ok: false; stage: "refused" | "read"; error: string }> {
  const { data: row, error: rowErr } = await companyOs.from("tasks").select("parent_task_id, human_tokens").eq("id", taskId).maybeSingle();
  if (rowErr) return { ok: false, stage: "read", error: rowErr.message };
  const { data: children, error: childErr } = await companyOs
    .from("tasks")
    .select("human_tokens, metadata")
    .eq("parent_task_id", taskId)
    .is("archived_at", null);
  if (childErr) return { ok: false, stage: "read", error: childErr.message };

  const derived = sumSubtaskTokens(subtaskRowsOnly(children ?? []));
  const human_tokens = cleanTokens(typed);
  if (derived !== null && human_tokens !== derived) return { ok: false, stage: "refused", error: DERIVED_TOKENS_ERROR };
  const r = row as { parent_task_id: string | null; human_tokens: number | null } | null;
  return { ok: true, taskId, human_tokens, parentId: r?.parent_task_id ?? null, previous: r?.human_tokens ?? null };
}

/**
 * After the estimate is written: re-derive the parent when the row is a
 * subtask. Clearing a subtask that WAS sized takes sized work out of the
 * parent's sum, exactly as archiving it does, so a parent left with no sized
 * subtask is cleared rather than keeping the sum of work it no longer holds
 * (W.130). Returns what went wrong, or null.
 *
 * A clear is the one write a retry cannot repair: the retry finds the row
 * already empty, cannot tell that it was ever sized, and leaves the parent's
 * stale sum alone. So when the parent fails after a clear, the subtask's
 * figure is put back and the save is reported as not having changed the
 * estimate; saving again starts from the same state. "Always re-derive on an
 * empty subtask" would also repair it, but would wipe the typed figure of a
 * parent whose subtasks are all unsized whenever one of them is saved empty.
 */
export async function estimateWritten(plan: EstimatePlan, actorLabel: string): Promise<EstimateProblem | null> {
  if (!plan.parentId) return null;
  const cleared = plan.previous !== null && plan.human_tokens === null;
  const parentErr = await membershipChanged(plan.parentId, cleared);
  if (!parentErr) {
    await recordAudit({ table: "tasks", recordId: plan.parentId, operation: "update", actor: actorLabel, newData: { rederived_from_subtasks: true } });
    return null;
  }
  if (!cleared) return { error: parentErr, reverted: false };
  // Only while the row still holds the empty value this save wrote: a figure
  // someone else saved in between is newer than ours, and their save
  // re-derived the parent itself, so it is left alone.
  const { data: undone, error: undoErr } = await companyOs
    .from("tasks")
    .update({ human_tokens: plan.previous })
    .eq("id", plan.taskId)
    .is("human_tokens", null)
    .select("id");
  if (undoErr) return { error: `${parentErr}, and the subtask's estimate could not be put back: ${undoErr.message}`, reverted: false };
  if (!undone || undone.length === 0) return { error: parentErr, reverted: false };
  await recordAudit({ table: "tasks", recordId: plan.taskId, operation: "update", actor: actorLabel, newData: { human_tokens: plan.previous, reason: "put back: parent re-derive failed" } });
  return { error: parentErr, reverted: true };
}

/** Plan, write, audit and re-derive: the estimate on its own, as setTaskTokens sets it. */
export async function setEstimate(taskId: string, typed: number | null, actorLabel: string): Promise<EstimateOutcome> {
  const plan = await planEstimate(taskId, typed);
  if (!plan.ok) return plan;
  const { human_tokens } = plan;
  const { error: writeErr } = await companyOs.from("tasks").update({ human_tokens }).eq("id", taskId);
  if (writeErr) return { ok: false, stage: "write", error: writeErr.message };
  await recordAudit({ table: "tasks", recordId: taskId, operation: "update", actor: actorLabel, newData: { human_tokens } });
  const problem = await estimateWritten(plan, actorLabel);
  if (!problem) return { ok: true };
  return { ok: false, stage: problem.reverted ? "reverted" : "parent", error: problem.error };
}

/**
 * A parent's set of subtasks changed — one was archived, restored or promoted
 * out — or a member's size changed. The parent becomes the sum of the sized
 * subtasks it still has.
 *
 * The subtle case is a parent left with no SIZED subtask at all. If the part
 * that left was sized, the parent's figure was derived from work no longer
 * under it, so it is cleared and a person re-estimates; inheriting the number
 * would count the departed work twice. If nothing sized changed, the figure is
 * left exactly as it was. Returns what went wrong, in words, or null.
 */
export async function membershipChanged(parentId: string, leaverWasSized: boolean): Promise<string | null> {
  const { data: remaining, error: readErr } = await companyOs
    .from("tasks")
    .select("human_tokens, metadata")
    .eq("parent_task_id", parentId)
    .is("archived_at", null);
  if (readErr) return `the parent card's estimate could not be re-read: ${readErr.message}`;
  const derived = sumSubtaskTokens(subtaskRowsOnly(remaining ?? []));
  if (derived === null && !leaverWasSized) return null;
  const { error: writeErr } = await companyOs.from("tasks").update({ human_tokens: derived }).eq("id", parentId);
  if (writeErr) return `the parent card's estimate was not updated: ${writeErr.message}`;
  return null;
}
