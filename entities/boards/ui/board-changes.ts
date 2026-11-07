// "What changed since you last looked" (W.63).
//
// task_stage_log has an append-only row for every move a card makes, and until
// now nothing a person reads touched it: only flow-metrics.ts (an aggregate)
// and sprint-settings.ts (a cleanup). This spends the same data on the
// question people actually ask on a Monday — what moved while I was away.
//
// HOUSE RULE, and it is the reason this file exists rather than a component
// doing it inline: the answer is board-level and fact-based. WHICH cards
// moved, never WHO moved them, even though the log records it. The row type
// below carries no person column, which is where the rule is enforced — a
// future caller cannot slice by person because the data never arrives here.
//
// The "since" is the viewer's own last visit, kept in localStorage the way the
// Board/List toggle already is. No table, no migration, and no cross-device
// sync: "since YOU last looked" is a fact about this browser, and pretending
// otherwise would need a row per person per surface to be wrong in.

/** All a card contributes to the question: its id and when it last moved. */
export type ChangeableCard = { id: string; last_column_move_at: string | null };

/**
 * The ids of the cards that moved strictly after `since` (an ISO timestamp).
 *
 * `null` for `since` means this browser has never looked at this surface, and
 * the answer is deliberately empty rather than everything: a first visit has
 * nothing to catch up on, and a line reading "371 cards moved" on a board
 * someone is seeing for the first time is noise dressed as news.
 */
export function cardsMovedSince(cards: ChangeableCard[], since: string | null): string[] {
  if (!since) return [];
  return cards.filter((c) => c.last_column_move_at !== null && c.last_column_move_at > since).map((c) => c.id);
}

const DAY_MS = 86_400_000;
const WEEKDAY = new Intl.DateTimeFormat("en-GB", { weekday: "long" });
const CALENDAR = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

/**
 * How the "since" reads on screen: "since Friday", not "since
 * 2026-09-18T09:14:22Z".
 *
 * A weekday name is the most useful form for the first week, because that is
 * how a person holds the recent past; past that a weekday name is ambiguous
 * ("Friday" — which one?) and it falls back to a date.
 */
export function sinceLabel(since: string, now: Date = new Date()): string {
  const then = new Date(since);
  if (Number.isNaN(then.getTime())) return "your last visit";
  const days = Math.floor((startOfDay(now) - startOfDay(then)) / DAY_MS);
  if (days <= 0) return "earlier today";
  if (days === 1) return "yesterday";
  if (days < 7) return WEEKDAY.format(then);
  return CALENDAR.format(then);
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
