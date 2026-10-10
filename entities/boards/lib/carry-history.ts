// How many weeks a card has been carried (W.52). Carrying a card is honest
// re-commitment and the page says so in a neutral tone — but a card that has
// been committed to three sprints running is usually not one card, and saying
// that once, quietly, on the card itself, is a question worth asking of THE
// WORK.
//
// It is a question about a card and never a count against a person: nothing
// here reads assignee_id, the result is keyed by task and nothing else, and it
// is rendered on the card only — never in a digest, never in an export, never
// summed per anybody.
//
// The rule for "carried" itself stays in lib/sprint-planning's isCarried; this
// only says how MANY times, counted from the sprint moves task_stage_log
// already records. The read that fetches them is in carry-history-read.ts, so
// the planning card can import the threshold without pulling a service-role
// client into the browser bundle.

/** A card committed to at least this many sprints has earned the question. */
export const LONG_CARRY_SPRINTS = 3;

export type SprintMove = { task_id: string; to_sprint_id: string | null };

/**
 * Distinct sprints per task, from the moves. A task committed to one sprint —
 * every card that has simply been planned once — is left out, so the map holds
 * only the cards that have moved between sprints at all.
 */
export function countSprintCommits(moves: SprintMove[]): Record<string, number> {
  const seen = new Map<string, Set<string>>();
  for (const m of moves) {
    if (!m.to_sprint_id) continue;
    const set = seen.get(m.task_id) ?? new Set<string>();
    set.add(m.to_sprint_id);
    seen.set(m.task_id, set);
  }
  const out: Record<string, number> = {};
  for (const [task, sprints] of seen) if (sprints.size > 1) out[task] = sprints.size;
  return out;
}
