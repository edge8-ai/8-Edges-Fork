import { companyOs, companyOsUntyped } from "@/kernel/data/supabase";

// Generic paginated/searchable/sortable reader over a company_os table.
// Always paginates at the DB (count: exact + range) so large tables (462 people,
// 285 applications) never ship in full to the client.

export type ListParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  searchColumns?: string[];
  // Search columns on an embedded table instead of (or as well as) the base
  // table's own — e.g. the person's name on team_members. The embed must be
  // declared `!inner` in `select`, otherwise PostgREST narrows the embedded
  // rows and still returns every parent. Note that searchColumns and
  // searchEmbed are ANDed when both are given, so pass only one to get an
  // "either" match.
  searchEmbed?: { table: string; columns: string[] };
  sort?: string;
  dir?: "asc" | "desc";
  // Opt-in, for a sort key many rows leave empty: those rows go last in either
  // direction, and `thenBy` orders them (and any ties) in the same direction.
  nullsLast?: boolean;
  thenBy?: string[];
  // `null` filters to IS NULL (e.g. persona: null for "unset").
  filters?: Record<string, string | number | boolean | null | (string | number)[]>;
  // Negative filter: rows whose column is one of these values are excluded
  // (col NOT IN (...)). Used to hide the performance-review capture forms from
  // the Surveys list — see PERFORMANCE_REVIEW_SLUGS.
  exclude?: Record<string, (string | number)[]>;
  // For archivable tables (people, companies, deals): hide soft-deleted rows.
  excludeArchived?: boolean;
  // OR conditions the equality filters cannot say, as PostgREST strings; each
  // string is one OR group and the groups are ANDed. Used by the Clients list's
  // current-client rule (kernel/identity/client-status.ts).
  or?: string[];
};

// Applies col NOT IN (...) filters. PostgREST wants the list bare-parenthesised
// (perf-review-self,perf-review-manager); our slugs have no commas or quotes.
function applyExclude<Q extends { not(col: string, op: string, val: string): Q }>(
  q: Q,
  exclude: Record<string, (string | number)[]> | undefined,
): Q {
  for (const [col, vals] of Object.entries(exclude ?? {})) {
    if (vals.length) q = q.not(col, "in", `(${vals.join(",")})`);
  }
  return q;
}

export type ListResult<T> = {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  error: string | null;
};

export async function listEntity<T>(
  table: string,
  select: string,
  params: ListParams = {},
): Promise<ListResult<T>> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 25));
  const from = (page - 1) * pageSize;

  let q = companyOsUntyped
    .from(table)
    .select(select, { count: "exact" })
    .range(from, from + pageSize - 1);

  const order = { ascending: params.dir !== "desc", ...(params.nullsLast ? { nullsFirst: false } : {}) };
  if (params.sort) for (const col of [params.sort, ...(params.thenBy ?? [])]) q = q.order(col, order);

  if (params.excludeArchived) q = q.is("archived_at", null);

  for (const [col, val] of Object.entries(params.filters ?? {})) {
    if (val === null) q = q.is(col, null);
    else if (Array.isArray(val)) q = q.in(col, val);
    else q = q.eq(col, val);
  }
  for (const group of params.or ?? []) q = q.or(group);
  q = applyExclude(q, params.exclude);

  // Tokenized search: split on whitespace and AND the tokens together (each
  // successive .or() call is ANDed by PostgREST), so "john smith" requires
  // both tokens rather than matching the literal substring "john smith".
  if (params.search && (params.searchColumns?.length || params.searchEmbed)) {
    const tokens = params.search
      .replace(/[%,()]/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    for (const token of tokens) {
      if (params.searchColumns?.length) {
        const or = params.searchColumns.map((c) => `${c}.ilike.%${token}%`).join(",");
        q = q.or(or);
      }
      if (params.searchEmbed) {
        const or = params.searchEmbed.columns.map((c) => `${c}.ilike.%${token}%`).join(",");
        q = q.or(or, { referencedTable: params.searchEmbed.table });
      }
    }
  }

  const { data, count, error } = await q;
  return {
    rows: (data ?? []) as T[],
    total: count ?? 0,
    page,
    pageSize,
    error: error ? error.message : null,
  };
}

// Count-only companion to listEntity: applies the same filter semantics but
// fetches no rows (head: true). Used for segment/tab badges where we want the
// size of each slice without paging through it.
export async function countEntity(
  table: string,
  filters: ListParams["filters"] = {},
  exclude?: ListParams["exclude"],
): Promise<number> {
  let q = companyOsUntyped.from(table).select("*", { count: "exact", head: true });
  for (const [col, val] of Object.entries(filters ?? {})) {
    if (val === null) q = q.is(col, null);
    else if (Array.isArray(val)) q = q.in(col, val);
    else q = q.eq(col, val);
  }
  q = applyExclude(q, exclude);
  const { count, error: countErr } = await q;
  if (countErr) console.error("[company-os/query] count", table, countErr);
  return count ?? 0;
}
