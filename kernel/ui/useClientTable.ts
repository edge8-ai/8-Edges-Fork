"use client";

import { useState } from "react";

// The three hand-rolled admin tables (events, job reqs, applications) each load
// their whole catalogue once and do the filtering, sorting and paging in the
// browser. They had three byte-identical copies of the paging arithmetic and
// two of the sort toggle; this is the single copy.
//
// The math lives in two pure functions so it can be tested without a DOM (the
// repo has no @testing-library/react), and the hook is the thin state wrapper
// around them.

export type Sort<K extends string> = { key: K; dir: "asc" | "desc" };

export type Page = {
  /** Pages in the filtered set — never below 1, so "1 / 1" renders on an empty table. */
  totalPages: number;
  /** `page` pulled back into range after a filter shrank the set under it. */
  clampedPage: number;
  /** Zero-based index of the first row on the page. */
  startIdx: number;
  /** One-based first row for the "m–n of N" label; 0 when there are no rows. */
  start: number;
  /** One-based last row for that label. */
  end: number;
};

export function paginate(total: number, page: number, pageSize: number): Page {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(page, totalPages);
  const startIdx = (clampedPage - 1) * pageSize;
  return {
    totalPages,
    clampedPage,
    startIdx,
    start: total === 0 ? 0 : startIdx + 1,
    end: Math.min(startIdx + pageSize, total),
  };
}

// Clicking the column you are already sorted by flips the direction; clicking a
// new one starts it in that column's natural direction — numbers and dates read
// best largest/newest first, so those columns are listed in `descFirst`.
export function nextSort<K extends string>(
  current: Sort<K> | null,
  key: K,
  descFirst: readonly K[] = [],
): Sort<K> {
  if (current && current.key === key) return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  return { key, dir: descFirst.includes(key) ? "desc" : "asc" };
}

export function useClientTable<Row, K extends string = string>(
  rows: Row[],
  opts: {
    /** Applied to every row; the caller closes over its own filter state. */
    filter: (row: Row) => boolean;
    /** Omit for an unsorted table. Only called while a sort is active. */
    compare?: (a: Row, b: Row, sort: Sort<K>) => number;
    initialSort?: Sort<K> | null;
    descFirst?: readonly K[];
    initialPageSize?: number;
    /** Events and job reqs jump back to page 1 on a sort; applications do not. */
    resetPageOnSort?: boolean;
  },
) {
  const [pageSize, setPageSizeState] = useState(opts.initialPageSize ?? 25);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<Sort<K> | null>(opts.initialSort ?? null);

  // Deliberately not memoised: `filter` and `compare` are fresh closures over
  // the caller's filter state on every render, so a useMemo keyed on them would
  // recompute anyway. These catalogues are small (hundreds of rows) — that is
  // the premise of doing all of this in the browser in the first place.
  const filtered = rows.filter(opts.filter);
  const compare = opts.compare;
  const sorted = sort && compare ? [...filtered].sort((a, b) => compare(a, b, sort)) : filtered;

  const total = sorted.length;
  const { totalPages, clampedPage, startIdx, start, end } = paginate(total, page, pageSize);

  return {
    pageRows: sorted.slice(startIdx, startIdx + pageSize),
    /** Offset of the first row on the page, for a running row-number column. */
    startIdx,
    total,
    totalPages,
    start,
    end,
    /** Already clamped, so it is safe to render and to offset from. */
    page: clampedPage,
    setPage,
    pageSize,
    setPageSize(n: number) {
      setPageSizeState(n);
      setPage(1);
    },
    sort,
    toggleSort(key: K) {
      setSort((s) => nextSort(s, key, opts.descFirst));
      if (opts.resetPageOnSort !== false) setPage(1);
    },
  };
}
