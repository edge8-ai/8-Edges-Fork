"use server";

import { companyOs } from "@/kernel/data/supabase";
import { recordAudit } from "@/kernel/audit/audit";
import { type Result } from "@/kernel/data/result";
import { boardMutation } from "./mutation";
import { refresh } from "./card-helpers";

/**
 * Set — or clear — a column's work-in-progress limit (W.31).
 *
 * The limit is INFORMATION. Nothing reads it to refuse a move: `move-card.ts`
 * does not know it exists, and the board draws "7 / 5" in amber and takes the
 * drop anyway. That is the whole design, and the one genuinely agile idea
 * worth taking here is why — it asks whether we are DOING too much at once,
 * which is a question about the work in a column, not about a person. There
 * is no per-person equivalent of this setting and there is not going to be
 * one.
 *
 * `limit` of null clears it. Zero and negatives are refused: a column nobody
 * may put anything into is a different idea, and the board does not have it.
 */
export async function setColumnWipLimit(columnId: string, limit: number | null, boardSlug: string): Promise<Result> {
  const gate = await boardMutation({ table: "board_columns", id: columnId, select: "board_id, name", label: "column" });
  if (!gate.ok) return gate;
  const column = gate.row as { board_id: string; name: string };

  if (limit !== null && (!Number.isInteger(limit) || limit < 1)) {
    return { ok: false, error: "A work-in-progress limit is a whole number of cards, or nothing at all." };
  }

  const { error } = await companyOs.from("board_columns").update({ wip_limit: limit }).eq("id", columnId);
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    table: "board_columns",
    recordId: columnId,
    operation: "update",
    actor: gate.actor.label,
    newData: { wip_limit: limit },
    context: { column: column.name, board_id: column.board_id },
  });
  refresh(boardSlug);
  return { ok: true };
}
