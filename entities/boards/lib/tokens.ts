// Human Tokens are an estimate of effort read from the shape of the work, on a 0.05
// grid with no ceiling (the atoms and the rule are in
// .claude/skills/workboard-cards/SKILL.md). The scale is additive: a card that is not a
// single atom is a sum of parts, and when those parts are its subtasks the card's own
// figure is derived from them rather than typed.

/**
 * What every write path says to a negative figure (W.141). It used to be
 * cleaned to null below and saved, so typing -1 on a card sized 2 silently
 * wiped the estimate and reported success. A write that means "no estimate"
 * sends null; a negative is a typo, and a typo is refused, not guessed at.
 */
export const NEGATIVE_TOKENS = "Human Tokens can't be negative.";

// A value between two grid points snaps to the nearest one; a negative or non-numeric
// value stores as null rather than as a guess. The actions refuse a negative before
// it reaches here, so the null branch is a last line, not the path a person takes.
export function cleanTokens(v: number | null | undefined): number | null {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  const n = Math.round(v * 20) / 20;
  return n >= 0 ? n : null;
}

// The sum of the sized subtasks, on the grid, or null when none is sized — an unsized
// subtask contributes nothing rather than a zero, so a card with only unsized subtasks
// keeps its own figure.
export function sumSubtaskTokens(subtasks: { human_tokens: number | null }[]): number | null {
  const sized = subtasks.filter((s) => s.human_tokens != null);
  if (sized.length === 0) return null;
  return Math.round(sized.reduce((sum, s) => sum + (s.human_tokens ?? 0), 0) * 20) / 20;
}

// The sum of a set of cards, on the grid. Floating-point addition of grid
// values does not land on the grid (0.1 + 0.2), so a total is snapped the same
// way a stored figure is before anyone reads it.
export function totalTokens(cards: { human_tokens: number | null }[]): number {
  return Math.round(cards.reduce((sum, c) => sum + (c.human_tokens ?? 0), 0) * 20) / 20;
}

// How a figure reads on screen. The scale is a 0.05 grid, so 1.25 HT is a real
// estimate and rounding it to 1 would report a different piece of work; the
// trailing zeros of the grid are dropped instead.
export function formatTokens(n: number): string {
  return String(Math.round(n * 20) / 20);
}

export const DERIVED_TOKENS_ERROR = "This card's estimate is the sum of its sized subtasks; size the subtasks instead.";

// A blocker is stored as a child task too (metadata.kind === "blocker"), so a read of a
// parent's children returns blockers beside subtasks. Only subtasks carry effort; a blocker
// that ever received a size must not swell the parent.
export function subtaskRowsOnly<T extends { metadata?: unknown }>(rows: T[]): T[] {
  return rows.filter((r) => {
    const kind = (r.metadata as { kind?: unknown } | null | undefined)?.kind;
    return kind !== "blocker";
  });
}
