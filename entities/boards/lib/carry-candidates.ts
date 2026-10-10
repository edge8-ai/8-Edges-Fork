// Which cards the carried-weeks read has to ask about (W.52). Only an open
// card that is in a sprint can be carried at all, so the planning pages narrow
// the workboard to those before touching task_stage_log — the hint is one line
// on a card and has no business reading the move history of every task on the
// board.

type Candidate = { id: string; status: string; sprint_id: string | null };

export function carryCandidates(cards: Candidate[]): string[] {
  return cards.filter((c) => c.status === "open" && !!c.sprint_id).map((c) => c.id);
}
