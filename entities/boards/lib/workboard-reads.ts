// The row reads behind getWorkboard: which boards a scope names, and their
// tasks in pages (PostgREST caps a read at 1000 rows and the company-wide task
// set outgrows that). Split out of workboard.ts for the file-size gate (WB-01).

import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { BOARD_SELECT, TASK_SELECT, type BoardRow, type TaskRow } from "./types";
import type { WorkboardScope } from "./workboard";

const PAGE = 1000;

export async function hasClientBoard(companyIds: string[]): Promise<boolean> {
  if (companyIds.length === 0) return false;
  const { data, error } = await companyOs
    .from("boards")
    .select("id")
    .in("client_company_id", companyIds)
    .eq("status", "active")
    .is("archived_at", null)
    .limit(1);
  if (error) console.error("[boards] boards", error);
  return (data ?? []).length > 0;
}

/** Every client with a live board: the order the client colours are handed out in. */
export async function readClientIdsWithBoards(): Promise<string[]> {
  const { data, error } = await companyOs
    .from("boards")
    .select("client_company_id")
    .is("archived_at", null)
    .not("client_company_id", "is", null);
  if (error) {
    console.error("[boards] client boards", error);
    return [];
  }
  return ((data ?? []) as { client_company_id: string | null }[]).map((b) => b.client_company_id).filter(Boolean) as string[];
}

export async function readBoards(scope: WorkboardScope): Promise<BoardRow[]> {
  if (scope.kind !== "all" && scope.ids.length === 0) return [];
  let qb = companyOs.from("boards").select(BOARD_SELECT).is("archived_at", null);
  if (scope.kind === "boards") qb = qb.in("id", scope.ids);
  else {
    qb = qb.eq("status", "active");
    if (scope.kind === "companies") {
      qb = qb.in("client_company_id", scope.ids);
      if (scope.untaggedOnly) qb = qb.is("ai_program_id", null);
    }
  }
  // Raises on failure: every board surface renders this list, and an empty one
  // reads as "this client has no board" rather than as an outage.
  return mustRows(await qb.order("sort_order"), "[boards] boards") as BoardRow[];
}

// Raises on failure, including a failure after the first page: returning the
// pages read so far would draw a board that silently lacks cards, and every
// count over it (waiting, moved, open) would be wrong without saying so.
export async function readTasks(boardIds: string[]): Promise<TaskRow[]> {
  const out: TaskRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const rows = mustRows(
      await companyOs
        .from("tasks")
        .select(TASK_SELECT)
        .in("board_id", boardIds)
        .is("archived_at", null)
        .order("position")
        .order("id")
        .range(from, from + PAGE - 1),
      "[boards] tasks",
    ) as TaskRow[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

// Item ids that already have a live (non-archived) board card, for the roadmap
// editor's "on the board" markers.
export async function getLiveCardItemIds(itemIds: string[]): Promise<Set<string>> {
  if (itemIds.length === 0) return new Set();
  const { data, error: cardsErr } = await companyOs.from("tasks").select("subject_id")
    .eq("subject_type", "client_backlog_item")
    .in("subject_id", itemIds)
    .is("archived_at", null);
  if (cardsErr) console.error("[boards] tasks", cardsErr);
  return new Set(((data ?? []) as { subject_id: string }[]).map((r) => r.subject_id));
}
