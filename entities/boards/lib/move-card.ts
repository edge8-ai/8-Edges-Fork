"use server";

// The same-board half of a card move: gate the card, validate the target
// column, then land the card (lib/land-card.ts owns what landing means — the
// position, the done state, the children, the log, the audit, the event). Every
// write is to a table this entity owns (tasks, board_columns, task_stage_log),
// which is why the mechanics live in the boards entity rather than the caller.
import { companyOs } from "@/kernel/data/supabase";
import { boardMutation } from "./mutation";
import { landCard, type CardMoveOutcome } from "./land-card";

export type { CardMoveOutcome };

export async function moveCardColumn(taskId: string, toColumnId: string, boardSlug: string): Promise<CardMoveOutcome> {
  const gate = await boardMutation({
    table: "tasks",
    id: taskId,
    select: "id, board_id, board_column_id, subject_type, subject_id, status",
    label: "card",
  });
  if (!gate.ok) return gate;
  const { actor } = gate;
  const t = gate.row as {
    id: string;
    board_id: string;
    board_column_id: string | null;
    subject_type: string | null;
    subject_id: string | null;
    status: string;
  };

  const { data: col, error: columnError } = await companyOs
    .from("board_columns")
    .select("id, is_done, is_not_doing")
    .eq("id", toColumnId)
    .eq("board_id", t.board_id)
    .maybeSingle();
  // A failed lookup is not a missing column: the message says what happened,
  // so a transient database error does not read as a bad drop target.
  if (columnError) return { ok: false, error: columnError.message };
  if (!col) return { ok: false, error: "That column is not on this board." };
  if (t.board_column_id === toColumnId) return { ok: true };

  return landCard({
    taskId,
    actor,
    from: { boardId: t.board_id, columnId: t.board_column_id, status: t.status },
    to: { boardId: t.board_id, boardSlug, columnId: toColumnId, isDone: (col as { is_done: boolean }).is_done, isNotDoing: (col as { is_not_doing: boolean }).is_not_doing },
    subject: { type: t.subject_type, id: t.subject_id },
    logNote: null,
    refreshSlugs: [boardSlug],
  });
}
