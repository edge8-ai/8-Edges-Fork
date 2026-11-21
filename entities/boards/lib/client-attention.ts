// Two facts about cards that Client Hubs needs to tell a real problem from
// housekeeping (AH.7.2), read here because boards owns the cards.
//
// - How many times a card's date has been moved. A date moved once is an
//   honest re-plan; a client-visible card still late after its date moved
//   twice is a promise slipping, and it goes to Dave. It is counted from the
//   audit rows the card writes already (updateCard, giveDay, bear-card), so no
//   counter has to be kept in step and the history counts from day one.
// - The open blockers waiting on one person, so a card says "Needs you" only
//   when the reader is the one holding it up (client-attention.test.ts proves
//   the read names that person and nobody else).
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { isOpen } from "./card-stage";

// Only the date is read off an audit row: the rest of it (titles, assignees,
// descriptions) never leaves the database for this count.
type DueRow = { record_id: string | null; changed_at: string; due: string | null };

/**
 * A move is a change from one date to a different date. Setting a date on a
 * card that had none is not a move, and neither is saving the same date again.
 * Pure, so the rule is tested without a database.
 */
export function countDueMoves(rows: DueRow[]): Map<string, number> {
  const byCard = new Map<string, string[]>();
  for (const r of [...rows].sort((a, b) => a.changed_at.localeCompare(b.changed_at))) {
    const due = r.due;
    if (!r.record_id || !due) continue;
    byCard.set(r.record_id, [...(byCard.get(r.record_id) ?? []), due.slice(0, 10)]);
  }
  const out = new Map<string, number>();
  for (const [id, dates] of byCard) out.set(id, dates.filter((d, i) => i > 0 && d !== dates[i - 1]).length);
  return out;
}

// One page of audit rows. A read past the API's row cap would drop rows with
// no error, and a missing row is a move not counted: a slipped promise shown
// as merely late. So the read is paged until a short page says it is done.
const PAGE = 1000;

/** How many times each card's date has moved; a card with no audited date reads 0. */
export async function dueMovesOf(taskIds: string[]): Promise<Map<string, number>> {
  if (taskIds.length === 0) return new Map();
  const rows: DueRow[] = [];
  for (let from = 0; ; from += PAGE) {
    // A failed read would show a slipped promise as merely late, which is the
    // wrong answer on the one page that decides what reaches Dave. Only rows
    // that set a date are read: every edit, reorder and snooze writes a row too.
    const page = mustRows(
      await companyOs
        .from("audit_log")
        .select("record_id, changed_at, due:new_data->>due_date")
        .eq("table_name", "tasks")
        .in("record_id", taskIds)
        .not("new_data->>due_date", "is", null)
        .order("changed_at")
        .order("id")
        .range(from, from + PAGE - 1),
      "[boards] due-date moves",
    ) as DueRow[];
    rows.push(...page);
    if (page.length < PAGE) return countDueMoves(rows);
  }
}

type BlockerOnPerson = { id: string; boardId: string; cardTitle: string; text: string };

/** The open blockers on open cards that name this person as the one to clear them. */
export async function openBlockersOn(personId: string): Promise<BlockerOnPerson[]> {
  const blockers = mustRows(
    await companyOs
      .from("tasks")
      .select("id, title, status, parent_task_id, board_id")
      .eq("assignee_id", personId)
      .eq("metadata->>kind", "blocker")
      .not("parent_task_id", "is", null)
      .is("archived_at", null),
    "[boards] blockers on a person",
  ) as { id: string; title: string; status: string; parent_task_id: string; board_id: string | null }[];
  const live = blockers.filter((b) => isOpen(b));
  if (live.length === 0) return [];
  const cards = mustRows(
    await companyOs.from("tasks").select("id, title, status").in("id", live.map((b) => b.parent_task_id)).is("archived_at", null),
    "[boards] cards held by blockers",
  ) as { id: string; title: string; status: string }[];
  const openCard = new Map(cards.filter((c) => isOpen(c)).map((c) => [c.id, c.title]));
  return live
    .filter((b) => b.board_id && openCard.has(b.parent_task_id))
    .map((b) => ({ id: b.id, boardId: b.board_id as string, cardTitle: openCard.get(b.parent_task_id) ?? "", text: b.title }));
}
