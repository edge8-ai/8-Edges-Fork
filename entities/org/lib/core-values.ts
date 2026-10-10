// The rules behind the Core Values page, shared by /team/values and its admin
// editor. Pure, so who gets which drawing and how the tiles lay out are tested
// without a browser.

export type ValueRow = { id: string; sort_order: number; title: string; description: string };

export type ValueMarkKey = "spark" | "target" | "bubbles" | "flag" | "book" | "blocks";

/**
 * The six drawings, each with the client-chip colour pair it is painted in
 * (`--admin-client-<tone>-bg/-ink`, all at 4.5:1 or better) and the title
 * words that call for it.
 */
export const VALUE_MARKS: ReadonlyArray<{ key: ValueMarkKey; tone: number; words: RegExp }> = [
  { key: "spark", tone: 0, words: /intellig|\bai\b|think|smart/i },
  { key: "target", tone: 6, words: /impact|deliver|result|outcome/i },
  { key: "bubbles", tone: 5, words: /communicat|transparen|candou?r|honest/i },
  { key: "flag", tone: 4, words: /owner|responsib|accountab/i },
  { key: "book", tone: 2, words: /learn|grow|curio|teach/i },
  { key: "blocks", tone: 3, words: /fun|build|play|craft|creat/i },
];

export const VALUE_TITLE_MAX = 80;
export const VALUE_DESC_MAX = 240;

/**
 * Which drawing each value wears. A value's own title chooses it, so the mark
 * follows the value through any reorder: the old page keyed its glyphs by
 * position, and every reorder or delete reshuffled them. A title no rule
 * recognises takes the next mark nobody holds; past six values marks repeat.
 * There is no stored column, so changing a title can change its mark, which is
 * the point: the drawing says what the value means.
 */
export function assignMarks(values: ReadonlyArray<{ id: string; title: string }>): Map<string, ValueMarkKey> {
  const out = new Map<string, ValueMarkKey>();
  const taken = new Set<ValueMarkKey>();
  const pending: { id: string }[] = [];
  for (const v of values) {
    const hit = VALUE_MARKS.find((m) => !taken.has(m.key) && m.words.test(v.title));
    if (hit) {
      out.set(v.id, hit.key);
      taken.add(hit.key);
    } else pending.push(v);
  }
  pending.forEach((v, i) => {
    const free = VALUE_MARKS.find((m) => !taken.has(m.key));
    const key = free ? free.key : VALUE_MARKS[i % VALUE_MARKS.length].key;
    out.set(v.id, key);
    taken.add(key);
  });
  return out;
}

export function markTone(key: ValueMarkKey): number {
  return VALUE_MARKS.find((m) => m.key === key)?.tone ?? 0;
}

/**
 * A tile's size in the three-column bento. Six values get the approved layout
 * (a wide first tile, a tall second, a wide last); any other count fills rows
 * evenly so no tile sits alone at the end.
 */
export function tileSpan(i: number, n: number): "wide" | "tall" | "full" | "" {
  if (n === 6) return (["wide", "tall", "", "", "", "wide"] as const)[i];
  if (n % 3 === 1 && i === n - 1) return "full";
  if (n % 3 === 2 && i === 0) return "wide";
  return "";
}

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
export const ordinal = (n: number): string => WORDS[n] ?? String(n);

/** Why a new order must not be saved: it has to hold exactly the values that exist, once each. */
export function reorderRefusal(current: readonly string[], next: readonly string[]): string | null {
  const same = next.length === current.length && new Set(next).size === next.length && next.every((id) => current.includes(id));
  return same ? null : "The values changed while you were editing. Reload the page and try again.";
}
