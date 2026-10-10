"use server";

import { companyOs } from "@/kernel/data/supabase";
import { type Result } from "@/kernel/data/result";
import { boardActorFor } from "./access";
import { boardMutation } from "./mutation";
import { DENIED } from "./card-helpers";
import { landCard } from "./land-card";
import { SUBJECT_BACKLOG_ITEM } from "./types";

// Move a card to another board: the Workboard list's "client" edit (WB-03).
// The card lands in the target's same-named column (its first column when the
// name is missing). Sprint and epic belong to the old board and are cleared;
// a roadmap link is cleared when the boards serve different clients, because
// the item belongs to the old client. What landing means — the done state, the
// children, the log, the audit row naming both boards, the completion event —
// is lib/land-card.ts's, shared with the same-board move (W.8 made the two
// match; now they cannot differ). Both boards are gated: the source through
// boardMutation, the target through boardActorFor.
export async function moveCardToBoard(taskId: string, toBoardId: string): Promise<Result> {
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
  return landCard({
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
}
