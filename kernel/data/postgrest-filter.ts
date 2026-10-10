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
 * Escapes the LIKE/ILIKE wildcards in a literal, so it can only match itself.
 *
 * The portal sign-in-link flow looks a contact up with `.ilike("email", …)` on
 * the address the visitor typed. ILIKE reads `%` as "any run of characters" and
 * `_` as "any one character", so without this, `%@example.com` matches every
 * address at that domain and resolves to somebody else's portal membership.
 * The backslash is escaped first — otherwise an input could smuggle in an
 * escape of its own and leave a live wildcard behind.
 *
 * It moved here from crm (S.3) when the inbox needed the same escape for an
 * admin's email: the notifications entity may not import crm, and a second
 * copy is how two lookups drift apart.
 */
export function escapeLikeLiteral(value: string): string {
  return value.replace(/([%_\\])/g, "\\$1");
}
