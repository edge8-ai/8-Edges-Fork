// Closing a sprint, written once: roll its unfinished cards (and subtasks) on
// to the next sprint or the backlog, then mark it closed. Two callers decide
// WHO may do it. `closeSprint` (sprint-actions.ts, a server action) gates a
// person through boardMutation and keeps that guard inline (ADR 0007). The
// Finish sprints routine calls `closeSprintAsSystem` in-process on Wednesday
// morning (W.207.1). This file is deliberately not a "use server" module:
// nothing a browser can reach may close a sprint without passing the board's gate.
import { recordAudit } from "@/kernel/audit/audit";
import { companyOs } from "@/kernel/data/supabase";
import type { BoardActor } from "./access";
import { refresh } from "./card-helpers";
import { OPEN_STATUS } from "./card-stage";
import type { CardMoveOutcome } from "./land-card";
import { landInSprint } from "./land-in-sprint";

export type SprintClose = {
  sprintId: string;
  boardId: string;
  boardSlug: string;
  // The sprint the unfinished cards land in; null sends them to the backlog.
  rolloverToSprintId: string | null;
};

// How many cards moved, so a routine can say what it carried.
export type SprintCloseOutcome = Exclude<CardMoveOutcome, { ok: true }> | { ok: true; carried: number };

/** Already-gated close: the caller has decided that `actor` may close this sprint. */
export async function closeSprintFor(c: SprintClose & { actor: BoardActor }): Promise<SprintCloseOutcome> {
  const { sprintId, boardId, boardSlug, rolloverToSprintId, actor } = c;
  const { data: openCards, error: openErr } = await companyOs
    .from("tasks")
    .select("id")
    .eq("sprint_id", sprintId)
    .eq("status", OPEN_STATUS)
    .is("archived_at", null);
  // If this read fails we must not go on to close the sprint: an empty list
  // here would silently strand every unfinished card in a closed sprint.
  if (openErr) return { ok: false, error: `Could not load the sprint's open cards: ${openErr.message}` };
  const ids = ((openCards ?? []) as { id: string }[]).map((t) => t.id);
  // The rollover is one landing for every unfinished card. It runs even when
  // there are none, because it is also where the target is checked against
  // this board: a close naming another board's sprint is refused either way.
  const rolled = await landInSprint({
    taskIds: ids,
    actor,
    boardId,
    from: sprintId,
    to: rolloverToSprintId,
    kind: "sprint_rollover",
    logNote: null,
    refreshSlugs: [boardSlug],
  });
  // On a failure after the cards rolled over, the sprint stays open so the
  // state is visibly half-applied and can be closed again once the history
  // writes; the rolled cards are already audited. The rollover's `persisted`
  // mark is dropped on purpose (A.54): what was asked for is a closed sprint,
  // and it is still open, so this is a refusal to retry.
  if (!rolled.ok) return { ok: false, error: rolled.error };
  const { error } = await companyOs
    .from("sprints")
    .update({ status: "closed", closed_at: new Date().toISOString() })
    .eq("id", sprintId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({
    table: "sprints",
    recordId: sprintId,
    operation: "update",
    actor: actor.label,
    newData: { status: "closed", rolled: ids.length, to: rolloverToSprintId },
  });
  refresh(boardSlug);
  return { ok: true, carried: ids.length };
}

// A sprint closed by a routine rather than a person. The label names the
// routine on the audit rows and in the history's actor, and there is no person
// to record. Same landing as a manual close, so the history rows (kind
// sprint_rollover) and the audit rows are identical; only the actor differs.
export function closeSprintAsSystem(c: SprintClose & { label: string }): Promise<SprintCloseOutcome> {
  return closeSprintFor({ ...c, actor: { label: c.label, personId: null, isAdmin: true } });
}
