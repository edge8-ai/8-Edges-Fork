// Making user text safe to put inside a PostgREST filter string.
//
// PostgREST parses `or(...)` and `like(...)` arguments as its own little
// grammar, so a term that reaches one of them unfiltered is not just a bad
// search — a comma or a paren ends the current condition and starts one of the
// typist's choosing. Both the deal referrer typeahead and the invoice company
// typeahead build such a string, and they are in different entities, so the
// helper belongs to the data kernel rather than to either of them.

/** Strips the characters PostgREST reads as filter syntax. The referrer
 *  typeahead drops a raw term into an `or(...)` string, where a stray comma or
 *  paren would either break the filter or add a condition of the caller's
 *  choosing. */
export function stripPostgrestMetacharacters(term: string): string {
  return term.replace(/[,%()*\\]/g, "");
}

/**
 * One `or(...)` argument matching `term` anywhere in any of `columns`, for a
 * search where each typed word may land in a different column. Chain one
 * `.or(ilikeAnyOf(cols, term))` per term: PostgREST ANDs chained filters, so
 * every word must match somewhere. `*` is PostgREST's spelling of the LIKE
 * wildcard inside a filter string. The term is stripped here as well as by the
 * caller, because a filter string is the one place an unstripped term is an
 * injection rather than a bad search.
 */
export function ilikeAnyOf(columns: readonly string[], term: string): string {
  // The double quote is PostgREST's quoting inside a filter string, so it goes too.
  const safe = stripPostgrestMetacharacters(term).replace(/"/g, "");
  return columns.map((c) => `${c}.ilike.*${safe}*`).join(",");
}

/** `query` narrowed so every term matches in at least one of `columns`. */
export function matchEveryTerm<Q extends { or(filters: string): Q }>(
  query: Q,
  columns: readonly string[],
  terms: readonly string[],
): Q {
  return terms.reduce((q, term) => q.or(ilikeAnyOf(columns, term)), query);
}

/**
 * Escapes the LIKE/ILIKE wildcards in a literal, so it can only match itself;
 * null when no PostgREST like/ilike pattern can spell the literal at all.
 *
 * The portal sign-in-link flow looks a contact up with `.ilike("email", …)` on
 * the address the visitor typed. ILIKE reads `%` as "any run of characters" and
 * `_` as "any one character", so without this, `%@example.com` matches every
 * address at that domain and resolves to somebody else's portal membership.
 * The backslash is escaped first — otherwise an input could smuggle in an
 * escape of its own and leave a live wildcard behind.
 *
 * `*` cannot be escaped, so a literal holding one is refused (A.48). PostgREST
 * documents `*` as an alias of `%` in a like/ilike value, and its SQL builder
 * (`T.map star val` in PostgREST/Query/SqlFragment.hs) turns every `*` into `%`
 * after the URL is decoded and before Postgres sees the pattern, with no regard
 * for a backslash in front of it. `\*` therefore reaches Postgres as `\%`, a
 * literal percent sign: `a*b@x.com` would find a row stored as `a%b@x.com`,
 * which is a different person. No like/ilike pattern matches a literal `*`,
 * so the only honest answer is "this cannot be looked up", which callers read
 * as no match. `ilikeLiteral` below does that for them.
 *
 * It moved here from crm (S.3) when the inbox needed the same escape for an
 * admin's email: the notifications entity may not import crm, and a second
 * copy is how two lookups drift apart.
 */
export function escapeLikeLiteral(value: string): string | null {
  if (value.includes("*")) return null;
  return value.replace(/([%_\\])/g, "\\$1");
}

/** The two filters `ilikeLiteral` needs from a PostgREST query builder. */
export type LiteralIlikeQuery<Q> = {
  ilike(column: string, pattern: string): Q;
  filter(column: string, operator: string, value: unknown): Q;
};

/**
 * `query` narrowed to rows whose `column` matches `value` literally and
 * case-insensitively. `shape` places the escaped literal in a wider pattern
 * (`%…%` for "contains"); the literal's own characters never act as wildcards.
 *
 * A literal `escapeLikeLiteral` refuses narrows the query to no rows instead,
 * with `column=in.()`, which PostgREST answers with an empty result (its own
 * QuerySpec: "returns an empty result for IN when no value is present"). So
 * every caller's existing "nobody has this address" path answers it, and no
 * caller needs a branch of its own or can forget one.
 */
export function ilikeLiteral<Q extends LiteralIlikeQuery<Q>>(
  query: Q,
  column: string,
  value: string,
  shape: (escaped: string) => string = (escaped) => escaped,
): Q {
  const escaped = escapeLikeLiteral(value);
  return escaped === null ? query.filter(column, "in", "()") : query.ilike(column, shape(escaped));
}

/**
 * One `or(...)` condition matching `column` to `value` literally, case aside;
 * null when `escapeLikeLiteral` refuses the value, and the caller then leaves
 * the condition out, which is that arm's "no match".
 *
 * Inside an `or(...)` string PostgREST reads a double-quoted value and lets a
 * backslash escape the next character (`pQuotedValue` in
 * PostgREST/ApiRequest/QueryParams.hs). So the LIKE escapes are doubled to
 * survive that unquoting, a `"` is escaped, and the quotes keep a comma or a
 * paren in the value from ending the condition and starting one of its own.
 */
export function ilikeLiteralCondition(column: string, value: string): string | null {
  const escaped = escapeLikeLiteral(value);
  if (escaped === null) return null;
  return `${column}.ilike."${escaped.replace(/["\\]/g, "\\$&")}"`;
}
