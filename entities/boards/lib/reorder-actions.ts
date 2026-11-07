"use server";

// Within-column card reordering, split from actions.ts for the file-size gate
// (RE-01). The guard (`boardMutation`) is the first statement, so
// check-action-auth treats this like every other board action.

import { companyOs } from "@/kernel/data/supabase";
import { recordAudit } from "@/kernel/audit/audit";
import { type Result } from "@/kernel/data/result";
import { boardMutation } from "./mutation";
import { refresh } from "./card-helpers";

// Re-rank cards within one column for priority. The client hands the lane's card
// ids in their new top-to-bottom order; `position` is rewritten to that order
// (readTasks orders non-done lanes by position). Only cards on the dragged
// card's own board are re-ranked, so a merged multi-board lane never lets one
// board's write touch another's rows; the gate is that one board.
export async function reorderCard(draggedId: string, orderedIds: string[], boardSlug: string): Promise<Result> {
  const gate = await boardMutation({ table: "tasks", id: draggedId, select: "board_id", label: "card" });
  if (!gate.ok) return gate;
  const { actor } = gate;
  const boardId = gate.row.board_id;
  // Which of the handed ids are on this board, and in the requested order.
  const { data, error } = await companyOs.from("tasks").select("id").eq("board_id", boardId).in("id", orderedIds);
  if (error) return { ok: false, error: error.message };
  const onBoard = new Set(((data ?? []) as { id: string }[]).map((r) => r.id));
  const ranked = orderedIds.filter((id) => onBoard.has(id));
  const results = await Promise.all(
    ranked.map((id, i) => companyOs.from("tasks").update({ position: i }).eq("id", id)),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return { ok: false, error: failed.error.message };
  await recordAudit({ table: "tasks", recordId: draggedId, operation: "update", actor: actor.label, newData: { reordered: ranked.length } });
  refresh(boardSlug);
  return { ok: true };
}
