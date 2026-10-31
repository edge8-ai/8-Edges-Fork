import { mustRows } from "@/kernel/data/read";
import { companyOs } from "@/kernel/data/supabase";
import { one } from "@/kernel/config/embedded";
import type { CardViewer } from "../slots";
import { isBoardMember } from "./access";
import { getBoardBySlug, type BoardDetail } from "./data";

// One card opened in place over another page (TH.2.6): the Inbox's rows open
// the card's own drawer without leaving the list. The board the card lives on
// is read whole, as the board page reads it, because the drawer's pickers
// (column, people, epic, sprint) are that board's.
//
// Access is the board page's rule, asked of the card's board: a surface that
// opens every board (an admin, or /admin with boards.open) sees it; anyone
// else must be a member, the same isBoardMember the team board page applies.
// The drawer's writes re-check through boardActorFor, so this decides only
// what is SHOWN.

export type CardPeek =
  | { kind: "open"; detail: BoardDetail; cardId: string }
  | { kind: "closed"; boardSlug: string | null };

type TaskRow = { id: string; parent_task_id: string | null; board_id: string | null; board: { slug: string | null } | { slug: string | null }[] | null };

export async function cardPeekFor(taskId: string, viewer: CardViewer): Promise<CardPeek> {
  // A failed read here would answer "you may not open this", which is wrong,
  // so it is raised rather than tolerated.
  const [task] = mustRows(
    await companyOs
      .from("tasks")
      .select("id, parent_task_id, board_id, board:boards!board_id(slug)")
      .eq("id", taskId)
      .is("archived_at", null)
      .limit(1),
    "[boards/card-peek] task",
  ) as unknown as TaskRow[];
  const slug = one(task?.board)?.slug ?? null;
  if (!task?.board_id || !slug) return { kind: "closed", boardSlug: null };
  if (!viewer.seesEveryBoard) {
    const member = viewer.teamMemberId ? await isBoardMember(task.board_id, viewer.personId, viewer.teamMemberId) : false;
    if (!member) return { kind: "closed", boardSlug: null };
  }
  const detail = await getBoardBySlug(slug);
  // A subtask is not a card on its board; its parent's drawer lists it, so a
  // notice about a subtask opens the card it belongs to.
  const cardId = task.parent_task_id ?? task.id;
  if (!detail || !detail.cards.some((c) => c.id === cardId)) return { kind: "closed", boardSlug: slug };
  return { kind: "open", detail, cardId };
}
