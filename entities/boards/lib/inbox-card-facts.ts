import { readOr } from "@/kernel/data/read";
import { companyOs } from "@/kernel/data/supabase";
import { one } from "@/kernel/config/embedded";
import type { InboxCardFact } from "@/kernel/shell/page-slots";
import { isOpen, laneStage, type ColumnFlags } from "./card-stage";

// What the team Inbox needs to know about the cards its due reminders name
// (TH.8), through the inboxCardFacts slot: notifications does not require
// boards, so it cannot see a card for itself.
//
//  - Whether the card is still work. A reminder about a card that has since
//    been finished, set aside or archived says nothing true any more, so the
//    Inbox leaves it out: on 18 Oct 2026, 5 of one person's 22 "Was due" rows
//    were about cards already done. The lane decides, as everywhere on the
//    board (laneStage), not the stored status alone.
//  - The card it belongs to, so a parent's subtasks sit under it rather than
//    as fourteen loose rows.
//
// The ids come from the person's own reminders (the page reads them for its
// own viewer), which the routine wrote only for cards assigned to them, and a
// subtask's parent sits on the same board. Only titles and a stage leave here,
// and only for those cards.

type TaskRow = { id: string; title: string | null; status: string; parent_task_id: string | null; archived_at: string | null; column: ColumnFlags | ColumnFlags[] | null };

/** The facts, from the rows read: pure, so the rule is tested without a database. */
export function inboxFactsFrom(tasks: TaskRow[], parents: { id: string; title: string | null }[]): Map<string, InboxCardFact> {
  const parentTitle = new Map(parents.map((p) => [p.id, p.title ?? "Untitled card"]));
  const facts = new Map<string, InboxCardFact>();
  for (const t of tasks) {
    const stage = laneStage(t.status, one(t.column));
    facts.set(t.id, {
      id: t.id,
      title: t.title ?? "Untitled card",
      open: t.archived_at === null && isOpen({ status: stage }),
      parent: t.parent_task_id && parentTitle.has(t.parent_task_id) ? { id: t.parent_task_id, title: parentTitle.get(t.parent_task_id) as string } : null,
    });
  }
  return facts;
}

/**
 * The facts for these cards, or null when they could not be read. A card the
 * read does not return (deleted) is absent from the map, which the Inbox reads
 * as no longer work. Null is the tolerant answer: the Inbox then shows every
 * reminder flat, as it did before, rather than hiding any on a failed read.
 */
export async function inboxCardFacts(ids: string[]): Promise<Map<string, InboxCardFact> | null> {
  if (ids.length === 0) return new Map();
  const tasks = readOr(
    await companyOs
      .from("tasks")
      .select("id, title, status, parent_task_id, archived_at, column:board_columns!board_column_id(is_done, is_not_doing)")
      .in("id", ids),
    "[boards/inbox-card-facts] tasks",
    null,
  ) as TaskRow[] | null;
  if (tasks === null) return null;
  const parentIds = [...new Set(tasks.map((t) => t.parent_task_id).filter((id): id is string => id !== null))];
  const parents = parentIds.length
    ? (readOr(await companyOs.from("tasks").select("id, title").in("id", parentIds), "[boards/inbox-card-facts] parents", null) as { id: string; title: string | null }[] | null)
    : [];
  if (parents === null) return null;
  return inboxFactsFrom(tasks, parents);
}
