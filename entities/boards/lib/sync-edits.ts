import { companyOs } from "@/kernel/data/supabase";
import type { TablesUpdate } from "@/kernel/data/supabase/database.types";

// The edits a routine makes to the cards it keeps in step with another
// entity's records (A.68, ADR 0018): the content sync's day cards, post
// subtasks and campaign cards on the Revenue board (campaigns). Until A.68 the
// door handed out `updateTasks(patch)` and the caller chained its own filter.
//
// A move between columns is not one of these edits: it goes through
// landCardAsSystem (system-moves.ts), which writes the stage history. What is
// left is the card's own text and bookkeeping, the parent a subtask sits
// under, and a subtask's tick, which has no column of its own to land in.

/** The fields a sync may set on a card it keeps, and nothing else. */
type SyncedCardEdit = Pick<
  TablesUpdate<{ schema: "company_os" }, "tasks">,
  "metadata" | "description" | "priority" | "assignee_id" | "due_date" | "parent_task_id" | "title" | "status" | "archived_at" | "completed_at"
>;

/** Edits one card by id; resolves to PostgREST's `{ error }`, which the caller reports. */
export function editSyncedCard(taskId: string, edit: SyncedCardEdit) {
  return companyOs.from("tasks").update(edit).eq("id", taskId);
}
