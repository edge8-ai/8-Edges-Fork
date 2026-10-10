"use server";

// Promoting a subtask to a card (W.57).
//
// Subtasks are `tasks` rows with a parent_task_id, so promotion is
// mechanically small: clear the parent, give it a board column, a sprint and
// a position. What was missing was any way to ASK for it — so a subtask that
// turned out to be a day's work got retyped as a new card by hand, and lost
// its comments, its history and its id along the way.
//
// Four things have to be true afterwards, and each is a step below:
//
//   1. the card appears in a column with its history intact (it is the same
//      row, so its comments and its stage log come with it);
//   2. the stage log gets a `create` row, because the Flow view reads that
//      log and a card without one has no age. The row is a create and not a
//      move: nothing moved, a card began;
//   3. the parent keeps a line saying where the work went and the promoted
//      card keeps a line saying where it came from — as comments, because a
//      comment is the one part of a card a person reads without looking for it;
//   4. the parent's Human Tokens are re-derived from what remains, since a
//      card with sized subtasks is worth their sum and one of the parts has
//      just left.
//
// The guard is the first statement, as in every other board action.

import { companyOs } from "@/kernel/data/supabase";
import { recordAudit } from "@/kernel/audit/audit";
import { type Result } from "@/kernel/data/result";
import { boardMutation } from "./mutation";
import { endPosition, refresh } from "./card-helpers";
import { membershipChanged } from "./card-estimate";
import { columnStatus } from "./types";

type SubtaskRow = {
  board_id: string;
  parent_task_id: string | null;
  title: string;
  human_tokens: number | null;
  metadata: Record<string, unknown> | null;
};

export async function promoteSubtask(subtaskId: string, boardSlug: string): Promise<Result> {
  const gate = await boardMutation({
    table: "tasks",
    id: subtaskId,
    select: "board_id, parent_task_id, title, human_tokens, metadata",
    label: "subtask",
  });
  if (!gate.ok) return gate;
  const { actor } = gate;
  const sub = gate.row as SubtaskRow;
  if (!sub.parent_task_id) return { ok: false, error: "That is already a card." };
  // A blocker is also a child task (BL-01). Promoting one would turn "waiting
  // on the client" into a card somebody is expected to do, which is not what
  // a blocker is — the link in W.56 is how a blocker points at real work.
  if ((sub.metadata as { kind?: string } | null)?.kind === "blocker") {
    return { ok: false, error: "A blocker is not a subtask. Point it at a card instead." };
  }
  const parentId = sub.parent_task_id;

  const { data: parentRow, error: parentErr } = await companyOs
    .from("tasks")
    .select("id, title, board_id, board_column_id, sprint_id, epic_id")
    .eq("id", parentId)
    .maybeSingle();
  if (parentErr) return { ok: false, error: `Could not load the parent card: ${parentErr.message}` };
  const parent = parentRow as { title: string; board_id: string; board_column_id: string | null; sprint_id: string | null; epic_id: string | null } | null;
  if (!parent) return { ok: false, error: "The parent card is gone." };
  if (!parent.board_column_id) return { ok: false, error: "The parent card is not in a column, so there is nowhere to put this." };

  // The column says what a card in it IS (W.141). A subtask added to a
  // finished card is born open, and promoting it used to move it into Done
  // while leaving it "open": the board drew it as done, and sprint close, the
  // team home and the weekly post counted it as work still owed.
  const { data: colRow, error: colErr } = await companyOs
    .from("board_columns")
    .select("is_done, is_not_doing")
    .eq("id", parent.board_column_id)
    .maybeSingle();
  if (colErr) return { ok: false, error: `Could not read the parent card's column: ${colErr.message}` };
  if (!colRow) return { ok: false, error: "The parent card's column is gone." };
  const status = columnStatus(colRow as { is_done: boolean; is_not_doing: boolean });

  // It starts where the parent is: the work was part of that card, so the
  // column, the sprint and the epic it was part of are the truest guesses
  // available, and all three are one click to change afterwards.
  const updates = {
    parent_task_id: null,
    board_column_id: parent.board_column_id,
    sprint_id: parent.sprint_id,
    epic_id: parent.epic_id,
    position: await endPosition(parent.board_id, parent.board_column_id),
    status,
    // completed_at means finished to every report, so only a done column sets it.
    completed_at: status === "done" ? new Date().toISOString() : null,
  };
  const { error } = await companyOs.from("tasks").update(updates).eq("id", subtaskId);
  if (error) return { ok: false, error: error.message };

  // From here the promotion has persisted. Each follow-up reports its own
  // failure and none of them undoes the card, because the card really is a
  // card now and telling the user otherwise would be a lie they would act on.
  const problems: string[] = [];

  const { error: logErr } = await companyOs.from("task_stage_log").insert({
    task_id: subtaskId,
    from_column_id: null,
    to_column_id: parent.board_column_id,
    to_sprint_id: parent.sprint_id,
    kind: "create",
    moved_by: actor.personId,
    note: `promoted from "${parent.title}"`,
  });
  if (logErr) problems.push(`its history could not be started: ${logErr.message}`);

  const { error: noteErr } = await companyOs.from("task_comments").insert([
    { task_id: parentId, author_person_id: actor.personId, author_label: actor.label, body: `Promoted “${sub.title}” out of this card's subtasks — it is its own card now.` },
    { task_id: subtaskId, author_person_id: actor.personId, author_label: actor.label, body: `Promoted from “${parent.title}”.` },
  ]);
  if (noteErr) problems.push(`the note saying where it came from could not be written: ${noteErr.message}`);

  const tokenErr = await membershipChanged(parentId, sub.human_tokens !== null);
  if (tokenErr) problems.push(tokenErr);

  await recordAudit({ table: "tasks", recordId: subtaskId, operation: "update", actor: actor.label, newData: { ...updates, promoted_from: parentId } });
  refresh(boardSlug);
  if (problems.length) return { ok: false, error: `Card promoted, but ${problems.join("; ")}.` };
  return { ok: true };
}
