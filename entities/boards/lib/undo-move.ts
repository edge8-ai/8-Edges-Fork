"use server";

// Putting a card back where it was (W.50).
//
// A move is one gesture, and until now the only way back from a wrong drop was
// another drag — the person had to remember which column the card came from.
// The board already knows: every move writes a `task_stage_log` row carrying
// `from_column_id` (move-card.ts and move-to-board.ts through land-card.ts) or
// `from_sprint_id` (setCardSprint). So the inverse is READ from that row, never
// guessed from what the browser happened to be showing — a tab that has been
// open since yesterday, or a second person's move in between, would otherwise
// send the card somewhere it has never been.
//
// Two consequences follow from that, and both are deliberate:
//
//   1. The undo is a MOVE, not a rewrite of history. It goes through the same
//      landCard path as a drag, so it writes its own stage-log row and the Flow
//      view keeps telling the truth about what happened to this card.
//   2. It refuses when the card has moved on since. The latest row's `to` must
//      still be where the card is; if it is not, someone (or something) has
//      moved it after the move being undone, and reversing that older move
//      would both land the card in the wrong place and break the stage log's
//      chain — each row's `from` is the previous row's `to`, which the board
//      audit counts as `chain_breaks` and expects to be zero.
import { companyOs } from "@/kernel/data/supabase";
import { recordAudit } from "@/kernel/audit/audit";
import { type Result } from "@/kernel/data/result";
import { refresh } from "./card-helpers";
import { landCard } from "./land-card";
import { boardMutation } from "./mutation";
import { insertTaskStageLog } from "./writes";

/** Shown when the card has been moved again since the move being undone. */
const MOVED_ON = "This card has moved since — there is nothing left to undo.";
/** Shown when the stage log has no move of that kind to reverse. */
const NOTHING = "There is no earlier move on this card to undo.";

type StageRow = {
  from_column_id: string | null;
  to_column_id: string | null;
  from_sprint_id: string | null;
  to_sprint_id: string | null;
};

/**
 * The latest stage-log row of one kind for a card. A failed read is returned as
 * a failure rather than as "no rows": treating it as absence would tell the
 * person there is nothing to undo when the move they just made is sitting in
 * the table (CLAUDE.md rule 2).
 */
async function lastStageRow(taskId: string, kind: "move" | "sprint_move"): Promise<{ ok: true; row: StageRow | null } | { ok: false; error: string }> {
  const { data, error } = await companyOs
    .from("task_stage_log")
    .select("from_column_id, to_column_id, from_sprint_id, to_sprint_id")
    .eq("task_id", taskId)
    .eq("kind", kind)
    .order("moved_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { ok: false, error: `Could not read the card's history: ${error.message}` };
  return { ok: true, row: (data as StageRow | null) ?? null };
}

/**
 * Put a card back in the column it was moved out of. The target column is the
 * `from_column_id` of the card's latest move row, re-checked against the board
 * so an undo cannot land a card in a column that has since been deleted.
 */
export async function undoCardMove(taskId: string, boardSlug: string): Promise<Result> {
  const gate = await boardMutation({
    table: "tasks",
    id: taskId,
    select: "id, board_id, board_column_id, subject_type, subject_id, status",
    label: "card",
  });
  if (!gate.ok) return gate;
  const t = gate.row as {
    id: string;
    board_id: string;
    board_column_id: string | null;
    subject_type: string | null;
    subject_id: string | null;
    status: string;
  };

  const last = await lastStageRow(taskId, "move");
  if (!last.ok) return last;
  if (!last.row) return { ok: false, error: NOTHING };
  if (last.row.to_column_id !== t.board_column_id) return { ok: false, error: MOVED_ON };
  const backTo = last.row.from_column_id;
  // A card's first landing has no `from`: it was created into that column, and
  // "no column" is not a place the board can put it back into.
  if (!backTo) return { ok: false, error: "That was this card's first column, so there is nowhere to put it back." };

  const { data: col, error: columnError } = await companyOs
    .from("board_columns")
    .select("id, is_done, is_not_doing")
    .eq("id", backTo)
    .eq("board_id", t.board_id)
    .maybeSingle();
  if (columnError) return { ok: false, error: columnError.message };
  if (!col) return { ok: false, error: "The column that card came from is no longer on this board." };

  return landCard({
    taskId,
    actor: gate.actor,
    from: { boardId: t.board_id, columnId: t.board_column_id, status: t.status },
    to: { boardId: t.board_id, boardSlug, columnId: backTo, isDone: (col as { is_done: boolean }).is_done, isNotDoing: (col as { is_not_doing: boolean }).is_not_doing },
    subject: { type: t.subject_type, id: t.subject_id },
    logNote: "undo",
    refreshSlugs: [boardSlug],
  });
}

/**
 * Put a card back in the sprint it was committed out of — including back to no
 * sprint at all, which is what `from_sprint_id: null` means and is a perfectly
 * good destination (the backlog).
 */
export async function undoCardSprint(taskId: string, boardSlug: string): Promise<Result> {
  const gate = await boardMutation({ table: "tasks", id: taskId, select: "board_id, sprint_id", label: "card" });
  if (!gate.ok) return gate;
  const { actor } = gate;
  const t = gate.row as { board_id: string; sprint_id: string | null };

  const last = await lastStageRow(taskId, "sprint_move");
  if (!last.ok) return last;
  if (!last.row) return { ok: false, error: NOTHING };
  if (last.row.to_sprint_id !== t.sprint_id) return { ok: false, error: MOVED_ON };
  const backTo = last.row.from_sprint_id;

  if (backTo) {
    const { data: sprint, error: sprintErr } = await companyOs
      .from("sprints")
      .select("id")
      .eq("id", backTo)
      .eq("board_id", t.board_id)
      .maybeSingle();
    if (sprintErr) return { ok: false, error: sprintErr.message };
    if (!sprint) return { ok: false, error: "The sprint that card came from is no longer on this board." };
  }

  const { error } = await companyOs.from("tasks").update({ sprint_id: backTo }).eq("id", taskId);
  if (error) return { ok: false, error: error.message };
  // The undo is its own move: a new row whose `from` is where the card was, so
  // the chain holds and the history shows the card went there and came back.
  const { error: logErr } = await insertTaskStageLog({
    task_id: taskId,
    from_sprint_id: t.sprint_id,
    to_sprint_id: backTo,
    kind: "sprint_move",
    moved_by: actor.personId,
    note: "undo",
  });
  if (logErr) {
    refresh(boardSlug);
    return { ok: false, error: `Sprint changed back, but the stage history could not be written: ${logErr.message}` };
  }
  await recordAudit({ table: "tasks", recordId: taskId, operation: "update", actor: actor.label, newData: { sprint_id: backTo } });
  refresh(boardSlug);
  return { ok: true };
}
