import type { Commitment } from "@/entities/coaching/lib/data/rows";

// How a column is ordered (K.66). `coaching_commitments.sort_order` has always
// called itself "the one shared priority stack", but nothing ever wrote it:
// every card took max + 1 at insert, so a column was oldest-first and ten cards
// in "On it" said nothing about which to touch (review finding 8, 2026-09-18).
// The member now says it — by dragging in "My order", or by asking for a sort.
export const SORT_MODES = ["manual", "due-first", "due-last", "oldest", "newest"] as const;
export type SortMode = (typeof SORT_MODES)[number];

export const SORT_LABELS: Record<SortMode, string> = {
  manual: "My order",
  "due-first": "Due day first",
  "due-last": "Due day last",
  oldest: "Oldest first",
  newest: "Newest first",
};

export function isSortMode(raw: string | null): raw is SortMode {
  return SORT_MODES.includes((raw ?? "") as SortMode);
}

type Sortable = Pick<Commitment, "id" | "dueOn" | "createdAt" | "sortOrder">;

// A card with no due day is not "due first" and not "due last": it is not in
// that conversation at all, so it sits under the dated ones in both directions
// rather than pretending to be the most or least urgent thing on the board.
function byDue(a: Sortable, b: Sortable, latestFirst: boolean): number {
  if (a.dueOn && b.dueOn) return latestFirst ? b.dueOn.localeCompare(a.dueOn) : a.dueOn.localeCompare(b.dueOn);
  if (a.dueOn) return -1;
  if (b.dueOn) return 1;
  return 0;
}

// The drag stack is the tie-break everywhere, so two cards that a sort cannot
// separate still fall in the order the member put them in.
export function sortCards<T extends Sortable>(cards: T[], mode: SortMode): T[] {
  // sort_order first, then newest — the order the loader has always returned
  // (`.order("sort_order").order("created_at", { ascending: false })`), so
  // "My order" is the board people already know and no deploy reshuffles it.
  // Coach-written cards can share a sort_order, which is why the tie-break has
  // to be the same one the database used.
  const stack = (a: Sortable, b: Sortable) => a.sortOrder - b.sortOrder || b.createdAt.localeCompare(a.createdAt);
  const copy = [...cards];
  if (mode === "manual") return copy.sort(stack);
  if (mode === "oldest") return copy.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || stack(a, b));
  if (mode === "newest") return copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || stack(a, b));
  return copy.sort((a, b) => byDue(a, b, mode === "due-last") || stack(a, b));
}

// The new stack values after a drag. The cards keep the sort_order values they
// already hold between them, handed out in the new order: no other column and
// nobody else's rows move, and there is no whole-profile renumber to race with.
// A null or duplicated value in the data cannot make two cards collide here,
// because the values are sorted and dealt out one per card.
export function reassign(idsInNewOrder: string[], held: { id: string; sortOrder: number }[]): { id: string; sortOrder: number }[] {
  const values = held
    .filter((h) => idsInNewOrder.includes(h.id))
    .map((h) => (Number.isFinite(h.sortOrder) ? h.sortOrder : 0))
    .sort((a, b) => a - b);
  // A value per card. A short list means the data holds fewer rows than the
  // client believes, so the tail counts on from the last real value rather
  // than colliding with it.
  const last = values.length > 0 ? values[values.length - 1] : -1;
  return idsInNewOrder.map((id, i) => ({ id, sortOrder: i < values.length ? values[i] : last + (i - values.length + 1) }));
}

// The column's ids after a card is dropped at `toIndex`. Pure, so the rule the
// board writes and the rule the tests check are the same one.
export function moveWithin(ids: string[], id: string, toIndex: number): string[] | null {
  const from = ids.indexOf(id);
  if (from < 0 || from === toIndex || toIndex < 0) return null;
  const next = [...ids];
  next.splice(toIndex, 0, ...next.splice(from, 1));
  return next;
}
