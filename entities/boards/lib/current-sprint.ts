// "Which sprint is this board in today?" (A.57), answered once.
//
// Before this module the question had three answers that could disagree on one
// board: the picked-up idea's sprint took the first active sprint holding today
// in start order, the header and the Done window took the latest start among
// every active sprint that had begun, and a single board's sprint filter opened
// on the first active sprint in the order the page happened to read them. A
// board whose next sprint was planned ahead and already active opened on next
// week while its header said this week.
//
// The answer is a date question with a status gate. A sprint that has not begun
// cannot be the one we are in, and one that has ended is not either, even if
// nobody closed it. On 2026-10-07 the header said "2026-W45" in week 41:
// nothing closes a finished sprint, so 43 were "active", and one client's board
// had planned its sprints ahead, through a W45 go-live, each marked active from
// the start. The newest of those is the furthest in the future, never the week
// anybody is working in.
//
// When two active sprints both hold today, the latest start wins, then the
// earliest end, then the lowest id, so the answer never depends on the order
// the rows were read in. That is the tie-break client-status already uses for
// its own snapshot (entities/client-programs/lib/client-status/facts.ts
// `currentSprint`), so the two agree wherever both apply.
//
// Three neighbouring questions are NOT this one, and stay where they are:
//  - "which sprint are we filling?" is planning's `next`, the board's sprint in
//    the week being planned (`planningBoards` in sprint-planning.ts), which asks
//    this module only for a sprint made without a week key;
//  - "can a card be filed into it?" is every active sprint that has started
//    (`activeSprintIds` in workboard-columns-window.ts);
//  - "which sprint held this day?" is client-status's snapshot for a past
//    `asOf`, status-blind, and client-programs cannot import boards
//    (`currentSprint` in client-programs' facts.ts).

/** The columns the question reads; every sprint row the boards entity holds has them. */
export type SprintSpan = { id: string; status: string; starts_on: string | null; ends_on: string | null };

// A null start counts as started and a null end as open: a sprint made without
// dates is one somebody is working in, not one that never happens.
const holds = (s: SprintSpan, today: string) => (s.starts_on ?? "") <= today && today <= (s.ends_on ?? "9999-12-31");

/**
 * The active sprint that holds `today`, or null when none does. Pass one
 * board's sprints: across boards each has its own, and the caller decides what
 * "the" week of several boards means.
 */
export function currentSprint<S extends SprintSpan>(sprints: readonly S[], today: string): S | null {
  let best: S | null = null;
  for (const s of sprints) {
    if (s.status !== "active" || !holds(s, today)) continue;
    if (!best || before(s, best)) best = s;
  }
  return best;
}

// Whether `a` wins the tie over `b`: later start, then earlier end, then lower id.
function before(a: SprintSpan, b: SprintSpan): boolean {
  const aStart = a.starts_on ?? "";
  const bStart = b.starts_on ?? "";
  if (aStart !== bStart) return aStart > bStart;
  const aEnd = a.ends_on ?? "9999-12-31";
  const bEnd = b.ends_on ?? "9999-12-31";
  if (aEnd !== bEnd) return aEnd < bEnd;
  return a.id < b.id;
}

/**
 * The current sprint of each board in `sprints`, keyed by board. A board with
 * no sprint holding today is absent.
 */
export function currentSprintByBoard<S extends SprintSpan & { board_id: string }>(sprints: readonly S[], today: string): Map<string, S> {
  const byBoard = new Map<string, S[]>();
  for (const s of sprints) byBoard.set(s.board_id, [...(byBoard.get(s.board_id) ?? []), s]);
  const out = new Map<string, S>();
  for (const [boardId, rows] of byBoard) {
    const current = currentSprint(rows, today);
    if (current) out.set(boardId, current);
  }
  return out;
}
