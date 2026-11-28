// When a person's cards were finished, for the finishedCardDates slot (TR.10):
// the personal read sets their training beside the work they finished, and only
// they see it. Top-level cards only, because a card and its subtasks are one
// piece of work. A failed read raises (rule 2): zero cards would read as a
// member who finished nothing.
import { companyOs } from "@/kernel/data/supabase";
import { mustPages } from "@/kernel/data/read";
import { DONE_STATUS } from "./card-stage";

export async function finishedCardDates(personId: string, since: string): Promise<string[]> {
  const rows = await mustPages<{ completed_at: string }>("[boards] finished card dates", (from, to) =>
    companyOs
      .from("tasks")
      .select("completed_at")
      .eq("assignee_id", personId)
      .eq("status", DONE_STATUS)
      .is("parent_task_id", null)
      .is("archived_at", null)
      .gte("completed_at", since)
      .order("completed_at")
      .order("id")
      .range(from, to),
  );
  return rows.map((r) => r.completed_at);
}
