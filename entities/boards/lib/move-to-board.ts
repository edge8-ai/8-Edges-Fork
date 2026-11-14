"use server";

import { recordAuditMany } from "@/kernel/audit/audit";
import { companyOs } from "@/kernel/data/supabase";
import { boardActorFor } from "./access";
import { boardMutation } from "./mutation";
import { DENIED } from "./card-helpers";
import { landCard, type CardMoveOutcome } from "./land-card";
import { SUBJECT_BACKLOG_ITEM } from "./types";
import { updateTasks } from "./writes";

// Move a card to another board: the Workboard list's "client" edit (WB-03).
// The card lands in the target's same-named column (its first column when the
// name is missing). Sprint and epic belong to the old board and are cleared;
// a roadmap link is cleared when the boards serve different clients, because
// the item belongs to the old client. What landing means — the done state, the
// children, the log, the audit row naming both boards, the completion event —
// is lib/land-card.ts's, shared with the same-board move (W.8 made the two
// match; now they cannot differ). Both boards are gated: the source through
// boardMutation, the target through boardActorFor. What only a board change
// owes — the card's subtasks and blockers going with it (A.50) — follows the
// landing here.
// A CardMoveOutcome, so a failure after the move can say the move persisted.
export async function moveCardToBoard(taskId: string, toBoardId: string): Promise<CardMoveOutcome> {
  const gate = await boardMutation({
    table: "tasks",
    id: taskId,
    select: "board_id, board_column_id, sprint_id, epic_id, subject_type, subject_id, status",
    label: "card",
  });
  if (!gate.ok) return gate;
  const { actor } = gate;
  const t = gate.row as { board_id: string; board_column_id: string | null; sprint_id: string | null; epic_id: string | null; subject_type: string | null; subject_id: string | null; status: string };
  if (t.board_id === toBoardId) return { ok: true };
  if (!(await boardActorFor(toBoardId))) return { ok: false, error: DENIED };

  const [boardsRes, columnsRes] = await Promise.all([
    companyOs.from("boards").select("id, slug, client_company_id").in("id", [t.board_id, toBoardId]).is("archived_at", null),
    companyOs.from("board_columns").select("id, board_id, name, position, is_done, is_not_doing").in("board_id", [t.board_id, toBoardId]).order("position"),
  ]);
  if (boardsRes.error) return { ok: false, error: boardsRes.error.message };
  if (columnsRes.error) return { ok: false, error: columnsRes.error.message };
  const boards = (boardsRes.data ?? []) as { id: string; slug: string; client_company_id: string | null }[];
  const from = boards.find((b) => b.id === t.board_id);
  const to = boards.find((b) => b.id === toBoardId);
  if (!from || !to) return { ok: false, error: "That board is not available." };
  const columns = (columnsRes.data ?? []) as { id: string; board_id: string; name: string; is_done: boolean; is_not_doing: boolean }[];
  const fromColumn = columns.find((c) => c.id === t.board_column_id);
  const fromName = fromColumn?.name;
  const targetColumns = columns.filter((c) => c.board_id === toBoardId);
  const toColumn = targetColumns.find((c) => c.name === fromName) ?? targetColumns[0];
  if (!toColumn) return { ok: false, error: "The target board has no columns." };

  const sameClient = from.client_company_id === to.client_company_id;
  const landed = await landCard({
    taskId,
    actor,
    // The origin's done state is already in hand, so landCard need not read it.
    from: { boardId: t.board_id, columnId: t.board_column_id, isDone: fromColumn?.is_done, status: t.status },
    to: { boardId: toBoardId, boardSlug: to.slug, columnId: toColumn.id, isDone: Boolean(toColumn.is_done), isNotDoing: Boolean(toColumn.is_not_doing) },
    subject: { type: t.subject_type, id: t.subject_id },
    also: {
      sprint_id: null,
      epic_id: null,
      ...(t.subject_type === SUBJECT_BACKLOG_ITEM && !sameClient ? { subject_type: null, subject_id: null } : {}),
    },
    logNote: `Moved from board ${from.slug} to ${to.slug}`,
    auditExtra: { from_board_id: t.board_id },
    refreshSlugs: [from.slug, to.slug],
  });
  // The card's own write failed: it has not moved, so neither do its children.
  if (!landed.ok && !landed.persisted) return landed;

  const childErr = await moveChildren(taskId, toBoardId, sameClient, actor.label);
  if (!childErr) return landed;
  // Reported after the landing's own follow-ups, the way landCard reports its
  // own: the card has moved, and saying otherwise would send the user to move
  // it again.
  const message = `its blockers and subtasks stayed on the old board: ${childErr}`;
  return { ok: false, persisted: true, error: landed.ok ? `Card moved, but ${message}.` : `${landed.error} Also, ${message}.` };
}

/**
 * Take a card's children (its subtasks and blockers: every row whose
 * parent_task_id is the card) to the board it moved to (A.50).
 *
 * Until this, a cross-board move left them behind. They kept the old board's
 * id, so the new board's drawer showed a card whose subtasks were gated
 * against a board the reader might not reach, and promoting one wrote it into
 * a column on a board its own row did not name.
 *
 * Each child gets what the card's landing cleared, for the same reason: the
 * sprint and the epic belong to the old board, and a roadmap item to the old
 * client. Its column is cleared rather than set, because a child has no
 * column of its own — subtasks and blockers are born with none (createSubtask
 * and addBlocker) — and a column id from the old board would be a reference
 * to another board. No stage-log row is written: a subtask does not travel
 * between columns, so it has no move to record.
 *
 * Returns null, or what went wrong.
 */
async function moveChildren(taskId: string, toBoardId: string, sameClient: boolean, actorLabel: string): Promise<string | null> {
  const moved = { board_id: toBoardId, board_column_id: null, sprint_id: null, epic_id: null };
  const { data, error } = await updateTasks(moved).eq("parent_task_id", taskId).select("id");
  if (error) return error.message;
  const ids = ((data ?? []) as { id: string }[]).map((c) => c.id);
  if (!ids.length) return null;
  // A child linked to the old client's roadmap item loses the link, as the card did.
  if (!sameClient) {
    const { error: subjErr } = await updateTasks({ subject_type: null, subject_id: null })
      .eq("parent_task_id", taskId)
      .eq("subject_type", SUBJECT_BACKLOG_ITEM);
    if (subjErr) return `their roadmap links could not be cleared: ${subjErr.message}`;
  }
  await recordAuditMany(
    ids.map((id) => ({ table: "tasks", recordId: id, operation: "update" as const, actor: actorLabel, newData: { ...moved, moved_with: taskId } })),
  );
  return null;
}
