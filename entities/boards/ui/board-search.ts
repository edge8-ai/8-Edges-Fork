import { shortCode } from "@/kernel/config/slug";

// The board's text search (W.12, F1). With hundreds of cards across a dozen
// boards the only way to find one was to remember whose board it was on and
// scan, so the toolbar narrows on what a person actually remembers: some of the
// title, a phrase from the description, the assignee's name, or the card's
// short code from a link somebody pasted.
//
// Client-side on purpose. The board already holds every card it can show, so a
// server round-trip would add latency and could not find anything the client
// cannot — and the result has to narrow the Board and the List views alike,
// which are two renderers over one array.

/**
 * Folds text for comparison: accents off, case off, whitespace collapsed.
 *
 * Vietnamese names are the reason this is not `toLowerCase()`. NFD decomposes
 * accented Latin (including ơ/ư/â/ê and the tone marks) into a base letter plus
 * combining marks, which are stripped; đ/Đ do not decompose and are replaced by
 * hand. So "Đỗ Trang" folds to "do trang" and someone typing without a
 * Vietnamese keyboard still finds the card.
 *
 * Unlike `foldName` in kernel/config/slug this keeps spaces and punctuation
 * positions as single spaces and applies no length cap: a slug has to be short
 * and URL-safe, a search haystack has to be complete.
 */
export function foldForSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** The fields a search looks at, folded once per card. */
export type SearchableCard = {
  id: string;
  title: string;
  description: string | null;
  assignee_name: string | null;
};

/**
 * Does this card match every whitespace-separated term?
 *
 * Every term, not any: typing more words narrows, which is what a person
 * expects and the only behaviour that makes a long query useful. A term also
 * matches the card's 8-hex short code, so the code out of a pasted `?card=`
 * link finds its card.
 */
export function cardMatchesSearch(card: SearchableCard, query: string): boolean {
  const terms = foldForSearch(query).split(" ").filter(Boolean);
  if (terms.length === 0) return true;
  // Every part folded, including the short code: a uuid is already lowercase
  // hex so folding changes nothing today, but a haystack half-folded is the
  // kind of asymmetry that goes wrong the first time the id format moves.
  const hay = foldForSearch(`${card.title} ${card.description ?? ""} ${card.assignee_name ?? ""} ${shortCode(card.id)}`);
  return terms.every((t) => hay.includes(t));
}
