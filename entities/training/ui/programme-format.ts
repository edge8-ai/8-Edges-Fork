// How the programme read's figures read on a page (TR.7): shared by the Admin
// table, the team cards and the member's plan line, so the three say the same.
import type { Figures } from "../lib/programme-read-rules";

/** Whole percentages of the load answers, in the band's order: too little, about right, too much. */
export function loadShares(f: Figures): { little: number; right: number; much: number; answered: number } {
  const answered = f.load.too_little + f.load.about_right + f.load.too_much;
  const pct = (n: number) => (answered === 0 ? 0 : Math.round((n / answered) * 100));
  return { little: pct(f.load.too_little), right: pct(f.load.about_right), much: pct(f.load.too_much), answered };
}

/** "4.3": the average stars, to one place. */
export function starsLabel(f: Figures): string {
  return f.stars.toFixed(1);
}

/** "86%": who went, of everyone on the list. */
export function wentShare(f: Figures): number {
  return f.listed === 0 ? 0 : Math.round((f.went / f.listed) * 100);
}

/** "5 clashed, 3 unwell, 2 marked absent, 2 no answer": everyone who did not go, by why. */
export function notWentLine(f: Figures): string {
  const parts = f.skips.map((s) => `${s.n} ${s.label.toLowerCase()}`);
  if (f.absent > 0) parts.push(`${f.absent} marked absent`);
  if (f.noAnswer > 0) parts.push(`${f.noAnswer} no answer`);
  return parts.length === 0 ? "everyone went" : parts.join(", ");
}

/** "7 nameless · 3 signed", or null when nobody wrote a note. */
export function notesLine(f: Figures): string | null {
  if (f.namelessNotes + f.signedNotes === 0) return null;
  return [f.namelessNotes > 0 ? `${f.namelessNotes} nameless` : null, f.signedNotes > 0 ? `${f.signedNotes} signed` : null].filter(Boolean).join(" · ");
}

/** How many segments a bar is drawn in: one per 5%, as the training bars draw counts (tr-seg). */
const SEGMENTS = 20;

/**
 * Pure: the class of each of a bar's segments, from counts in order. Every
 * share that is not zero gets at least one segment, because an answer someone
 * gave must not vanish from the bar; the rest go by largest remainder, so the
 * segments always fill the whole bar.
 */
export function segmentClasses(parts: { cls: string; n: number }[], segments = SEGMENTS): string[] {
  const total = parts.reduce((s, p) => s + p.n, 0);
  if (total === 0) return [];
  const exact = parts.map((p) => (p.n / total) * segments);
  const whole = exact.map((x, i) => (parts[i]!.n > 0 ? Math.max(1, Math.floor(x)) : 0));
  let left = segments - whole.reduce((s, n) => s + n, 0);
  const order = exact.map((x, i) => ({ i, r: x - whole[i]! })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    whole[i]! += 1;
    left -= 1;
  }
  // A share raised to its one segment is paid for by the largest.
  while (left < 0) {
    const biggest = whole.indexOf(Math.max(...whole));
    whole[biggest]! -= 1;
    left += 1;
  }
  return parts.flatMap((p, i) => Array.from({ length: whole[i]! }, () => p.cls));
}

/** The load band's segments: too little, about right, too much, in that order. */
export function loadSegments(f: Figures): string[] {
  return segmentClasses([
    { cls: "is-little", n: f.load.too_little },
    { cls: "is-right", n: f.load.about_right },
    { cls: "is-much", n: f.load.too_much },
  ]);
}
