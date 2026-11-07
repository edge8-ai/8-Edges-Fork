// The patterns a weekly status page fails the check on (Z.12, spec §5), in a
// module of their own so the gather can screen text with them too (R.26.1).
// They cannot live in check.ts and be imported by facts.ts: check.ts imports
// facts.ts, and the entity graph refuses a cycle.
//
// The check reads them over the whole page. The gather reads them over text it
// places on the page without the model (the sprint goal), and drops what would
// fail, so a goal never turns a good draft into a refused one.

export const TOKEN = /\btokens?\b|\bHTs?\b|human[\s-]+tokens?/i;
export const HOURS = /\b\d+(?:[.,]\d+)?\s*(?:hours?|hrs?|h|days?)\b/i;
export const MONEY = /[$€£₫]\s*\d|\d\s*[$€£₫]|\b(?:USD|VND|AUD|SGD|EUR|GBP)\b|\d+(?:[.,]\d+)?\s*%\s*of\s+(?:the\s+|your\s+)?budget/i;
export const LINK = /https?:\/\/|\bwww\.|<a\b|href\s*=/i;
export const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

/** Whether text would fail the check's figure, link or email rules wherever it sat on a page. */
export function breaksPageRules(text: string): boolean {
  return [TOKEN, HOURS, MONEY, LINK, EMAIL].some((pattern) => pattern.test(text));
}
