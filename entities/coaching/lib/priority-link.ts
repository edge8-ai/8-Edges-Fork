// The one thing to read or do attached to a growth priority (L.6).
//
// Pure, and tested, because this value ends up in an `href` on a page the
// member opens. A stored `javascript:` or `data:` URL rendered into a link is
// script execution in the member's session with the coach's authority behind
// it — the coach is trusted, but a trusted author is not a reason to render an
// untrusted scheme, and "only a coach can write it" is exactly the assumption
// that makes this kind of hole survive review.
//
// So the scheme allowlist lives here rather than in the writer or the
// component: one rule, one place, provably applied on the way in AND checkable
// on the way out.

export type PriorityLink = { url: string; title: string };

/** The only schemes a stored link may carry. */
const ALLOWED = new Set(["http:", "https:"]);

// A title is a label on a link, not prose. The cap is generous enough for a
// book title and short enough that a row never becomes a paragraph.
export const LINK_TITLE_MAX = 120;

/**
 * Normalise what a coach typed into a storable link, or null.
 *
 * Null means "no link", which is the common case and not an error: a priority
 * with nothing attached is exactly what every priority is today. A URL that
 * cannot be parsed, or carries a scheme outside the allowlist, is also null —
 * the caller stores nothing rather than storing something the page then has to
 * defend itself against.
 *
 * The title falls back to the URL's host, so a coach who pastes a link and
 * types nothing still gets a row that reads as a place rather than a string.
 */
export function normalisePriorityLink(input: {
  url: string | null | undefined;
  title: string | null | undefined;
}): PriorityLink | null {
  const raw = (input.url ?? "").trim();
  if (!raw) return null;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (!ALLOWED.has(parsed.protocol)) return null;

  const typed = (input.title ?? "").trim().slice(0, LINK_TITLE_MAX);
  return { url: parsed.toString(), title: typed || parsed.host };
}

/**
 * Whether a link already in the database is safe to render as an href.
 *
 * Rows written before this rule existed, or by any path that skipped the
 * normaliser, still reach the page. The component asks this rather than
 * trusting the column, so a bad row renders as nothing instead of as a link.
 */
export function isRenderableLink(url: string | null): boolean {
  if (!url) return false;
  try {
    return ALLOWED.has(new URL(url).protocol);
  } catch {
    return false;
  }
}
