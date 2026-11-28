// A letter to yourself, opened at quarter end (L.10).
//
// Two sentences the member writes to their end-of-quarter self at the moment
// they set the goal, and do not see again until the quarter review page opens.
//
// The seal is a rule about WHERE it renders, not a lock in the database. It is
// the member's own text about their own goal; encrypting it from them would be
// theatre, and a determined person could read it in a network tab anyway. What
// matters is that no ordinary path shows it back to them early, because the
// entire value is in not having read it for three months. That rule is here, in
// one testable function, rather than scattered across the components that would
// each have to remember it.

export type LetterFacts = {
  /** What they wrote, or null when they wrote nothing. */
  letterMd: string | null;
  /** The Saigon date they wrote it. */
  sealedOn: string | null;
  /** The quarter the goal belongs to, e.g. "2026Q3". */
  quarterLabel: string | null;
};

// Long enough for two real sentences and short enough that it stays a letter
// rather than becoming a second goal description.
export const LETTER_MAX = 400;

/** What to store for a letter, or null when they wrote nothing. */
export function normaliseLetter(raw: string | null | undefined): string | null {
  const text = (raw ?? "").trim();
  return text ? text.slice(0, LETTER_MAX) : null;
}

/**
 * Whether the letter may be shown.
 *
 * Only on the quarter-review page, and only for a quarter that is over. A
 * member re-reading their own hopes for a quarter they are still living is
 * reading a to-do list; the whole point is the gap between writing and reading.
 *
 * `reviewingQuarter` is the quarter whose review page is open — null everywhere
 * else in the product, which is what keeps every other surface sealed by
 * default rather than by remembering to be.
 */
export function letterIsOpen(
  facts: LetterFacts,
  reviewingQuarter: string | null,
  currentQuarter: string,
): boolean {
  if (!facts.letterMd || !facts.quarterLabel) return false;
  if (reviewingQuarter !== facts.quarterLabel) return false;
  // The quarter being reviewed must be behind the one we are in. Comparing the
  // labels as strings works because they sort chronologically ("2026Q2" <
  // "2026Q3" < "2027Q1"), which is the one useful property of that format.
  return facts.quarterLabel < currentQuarter;
}

/** The Saigon quarter label for a date, in the same format goals use. */
export function quarterOf(dateISO: string): string {
  const [y, m] = dateISO.split("-").map(Number);
  return `${y}Q${Math.floor((m - 1) / 3) + 1}`;
}

/** How long the letter sat sealed, for the line above it. */
export function sealedFor(sealedOn: string | null, todayISO: string): string | null {
  if (!sealedOn) return null;
  const months =
    (Number(todayISO.slice(0, 4)) - Number(sealedOn.slice(0, 4))) * 12 +
    (Number(todayISO.slice(5, 7)) - Number(sealedOn.slice(5, 7)));
  if (months < 1) return "earlier this month";
  return months === 1 ? "a month ago" : `${months} months ago`;
}
