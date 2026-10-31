// The blind-scoring arithmetic behind the interview panel. These three are pure
// and were the only testable logic inside InterviewRounds.tsx, which is a client
// component; they live here so a test can reach them without a DOM.
//
// The card shape is declared structurally rather than imported from
// interview-actions.ts, which is "use server" — nothing here should pull a
// server module in.

type ScoredCard = { scores: { criterion: string; score: number | null }[] };

/** Every score any panelist gave for one criterion, in panel order. */
export function humanScores(cards: ScoredCard[], criterion: string): (number | null)[] {
  return cards.flatMap((c) => c.scores.filter((s) => s.criterion === criterion).map((s) => s.score));
}

// True if any human score sits a full point or more from the AI score.
export function disagrees(aiScore: number | null, others: (number | null)[]): boolean {
  if (aiScore == null) return false;
  return others.some((o) => o != null && Math.abs(o - aiScore) >= 1);
}

/** The CSS custom property a recommendation's tone renders in. */
export function recTone(tone: string): string {
  if (tone === "ok") return "var(--admin-ok-ink)";
  if (tone === "warn") return "var(--admin-warn-ink)";
  return "var(--admin-err-ink)";
}
