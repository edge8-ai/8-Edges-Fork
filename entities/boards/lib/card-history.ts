"use server";

import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { boardMutation } from "./mutation";
import { BOARD_COLUMN_SELECT, type BoardColumnRow } from "./types";

/**
 * One hop in a card's life: the column it left, the column it reached, and
 * when. NOTHING ELSE.
 *
 * `task_stage_log` carries `moved_by`, and this type deliberately has no
 * field for it. The house rule is that no metric and no history describes a
 * person: the strip says WHAT moved and WHEN, which is the same line
 * flow-metrics.ts already holds. Leaving the column out of the row type is
 * where that rule is enforced — a later caller cannot render what was never
 * selected.
 */
export type CardHop = {
  id: string;
  /** The column the card left; null for the row that records its creation. */
  from: string | null;
  /** The column it reached; null when a move recorded only a sprint change. */
  to: string | null;
  /** ISO timestamp of the move. */
  at: string;
  /** What kind of move it was, as the writers record it ("move", "board", …). */
  kind: string;
  /** The note a board move leaves behind ("Moved from Acme"), when there is one. */
  note: string | null;
};

/**
 * Every column hop of one card, oldest first.
 *
 * ONE card. The query is `.eq("task_id", …)` and there is no variant that
 * takes a list: this exists so a person can inspect the card in front of
 * them, not so anything can be aggregated out of the log. The aggregate
 * reading of this table already exists and is per-column, in flow-metrics.ts.
 *
 * The guard comes first, through `boardMutation` on the card's own row, so
 * someone who cannot reach the board cannot learn its history either — and a
 * card that is missing and a card that is out of reach answer the same.
 */
export async function getCardHistory(
  taskId: string,
): Promise<{ ok: true; hops: CardHop[] } | { ok: false; error: string }> {
  const gate = await boardMutation({ table: "tasks", id: taskId, select: "board_id", label: "card" });
  if (!gate.ok) return gate;

  // mustRows, not readOr: an empty strip and a failed read look identical on
  // screen, and "this card has never moved" is a different statement from "we
  // could not find out". The throw is caught here rather than left to the
  // error boundary, because this is a server action inside an open drawer —
  // replacing the whole page over a history strip would lose the edits in it.
  try {
    const logs = mustRows(
      await companyOs
        .from("task_stage_log")
        // moved_by is not selected. See CardHop.
        .select("id, from_column_id, to_column_id, moved_at, kind, note")
        .eq("task_id", taskId)
        .order("moved_at", { ascending: true }),
      "[boards] task_stage_log for one card",
    ) as { id: string; from_column_id: string | null; to_column_id: string | null; moved_at: string; kind: string; note: string | null }[];

    const columns = mustRows(
      await companyOs.from("board_columns").select(BOARD_COLUMN_SELECT).eq("board_id", gate.row.board_id),
      "[boards] board_columns for one card's history",
    ) as BoardColumnRow[];

    // A column whose name will not resolve — it was renamed away, or the card
    // came from another board — is shown as the hop it was rather than
    // dropped: the shape of the journey is the point.
    const nameById = new Map(columns.map((c) => [c.id, c.name]));
    const named = (id: string | null) => (id === null ? null : nameById.get(id) ?? "another column");

    return {
      ok: true,
      hops: logs.map((r) => ({
        id: r.id,
        from: named(r.from_column_id),
        to: named(r.to_column_id),
        at: r.moved_at,
        kind: r.kind,
        note: r.note,
      })),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not load this card's history." };
  }
}
