import { TASK_PRIORITIES, type TaskPriority } from "@/entities/boards/lib/types";
import type { GroupingId, SortId } from "./workboard-filter-params";

// The order inside a column (W.27). A column could only be in manual order —
// the within-lane drag of RE-01, plus the forced newest-first on Done — so
// "show me Review with the oldest at the top" had no answer.
//
// The fiddly part is not the comparator, it is what a sort does to the DRAG.
// A manual rank is a `position` within a lane, so it is only meaningful when
// the columns ARE the lanes and no sort is overriding them. Under any other
// grouping, or under any sort, a within-column drag would write a rank nobody
// would ever see again and the card would spring straight back to where the
// sort puts it. So manual order is switched off in both cases — visibly, by the
// board dropping its reorder handler and each column saying it is sorted,
// rather than silently, by a drag that does nothing.

export const SORT_LABEL: Record<SortId, string> = {
  manual: "Manual order",
  due: "Due date, soonest first",
  priority: "Priority, P1 first",
  created: "Date created, oldest first",
};

/** The short form for the note a sorted column carries. */
export const SORT_SHORT: Record<SortId, string> = {
  manual: "Manual",
  due: "Due date",
  priority: "Priority",
  created: "Created",
};

export type SortableCard = {
  due_date: string | null;
  priority: TaskPriority;
  created_at: string;
};

/**
 * Whether a within-column drag may still write a manual rank. False under any
 * sort, and false under any grouping but the lanes, because `position` is a
 * rank within a lane and nothing else.
 */
export function manualOrderAllowed(grouping: GroupingId, sort: SortId): boolean {
  return grouping === "lane" && sort === "manual";
}

const priorityRank = (p: TaskPriority) => {
  const i = TASK_PRIORITIES.indexOf(p);
  return i === -1 ? TASK_PRIORITIES.length : i;
};

/**
 * The cards in the chosen order. The kanban filters the one array per column,
 * so sorting it once sorts every column the same way.
 *
 * A card with no due date sorts LAST under the due-date sort rather than first:
 * "soonest first" is a question about deadlines, and a card with no deadline is
 * not the most urgent thing on the board. Manual returns the array untouched,
 * which keeps the board's own placement — including the server's newest-first
 * Done lane — exactly as it was.
 */
export function sortCards<T extends SortableCard>(cards: T[], sort: SortId): T[] {
  if (sort === "manual") return cards;
  const keyed = cards.map((c, i) => ({ c, i }));
  keyed.sort((a, b) => {
    if (sort === "due") {
      const av = a.c.due_date ?? "";
      const bv = b.c.due_date ?? "";
      if (av !== bv) return av === "" ? 1 : bv === "" ? -1 : av.localeCompare(bv);
    } else if (sort === "priority") {
      const d = priorityRank(a.c.priority) - priorityRank(b.c.priority);
      if (d !== 0) return d;
    } else {
      const d = a.c.created_at.localeCompare(b.c.created_at);
      if (d !== 0) return d;
    }
    // Ties keep the order the board already had, so a sort never shuffles.
    return a.i - b.i;
  });
  return keyed.map((k) => k.c);
}
