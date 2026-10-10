// A program's pull requests across every repo it owns (X.1), one server-side
// page at a time for the program detail pages' Pull Requests tab. Split out of
// hub-program.ts, which keeps the rollups; this keeps the paging and search.

import { htt } from "@/kernel/data/supabase";

export type ProgramPullRequest = {
  id: string;
  number: number | null;
  title: string;
  state: "open" | "merged" | "closed";
  author: string | null;
  url: string | null;
  mergedAt: string | null;
  openedAt: string;
};

export type ProgramPrOptions = {
  page?: number; // 1-based; clamped to the filtered result's page range
  search?: string; // matches title/author (ilike) and exact PR number
};

export const PR_PAGE_SIZE = 15;

// User input goes into a PostgREST .or() filter string; strip the characters
// that are structural in that syntax (commas, parens, quotes) and LIKE
// wildcards, rather than interpolating raw input.
function ilikeTerm(input: string): string {
  return input
    .replace(/[,()"'`\\%_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export type PrPage = {
  rows: ProgramPullRequest[];
  page: number;
  total: number; // matching the search filter
  totalAll: number; // unfiltered
};

// One server-side page of a program's pull requests across all of its repos,
// searched over the FULL set (never just the visible page). Page is clamped to
// the filtered total so a stale ?page= never turns into a range error.
export async function fetchPrPage(repoIds: string[], opts: ProgramPrOptions): Promise<PrPage> {
  const term = ilikeTerm(opts.search ?? "");
  const filtered = () => {
    let qb = htt.from("pull_requests").select("id", { count: "exact", head: true }).in("repo_id", repoIds);
    if (term) {
      const pat = `%${term}%`;
      const ors = [`title.ilike.${pat}`, `author_login.ilike.${pat}`];
      if (/^\d+$/.test(term)) ors.push(`number.eq.${term}`);
      qb = qb.or(ors.join(","));
    }
    return qb;
  };

  const [{ count: totalAll }, { count: total }] = await Promise.all([
    htt.from("pull_requests").select("id", { count: "exact", head: true }).in("repo_id", repoIds),
    filtered(),
  ]);

  const totalPages = Math.max(1, Math.ceil((total ?? 0) / PR_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(opts.page ?? 1)), totalPages);

  let rowQb = htt.from("pull_requests").select("id, number, title, state, author_login, url, merged_at, opened_at").in("repo_id", repoIds);
  if (term) {
    const pat = `%${term}%`;
    const ors = [`title.ilike.${pat}`, `author_login.ilike.${pat}`];
    if (/^\d+$/.test(term)) ors.push(`number.eq.${term}`);
    rowQb = rowQb.or(ors.join(","));
  }
  const { data, error: prError } = await rowQb.order("opened_at", { ascending: false }).order("id").range((page - 1) * PR_PAGE_SIZE, page * PR_PAGE_SIZE - 1);
  if (prError) console.error("[team/hub] pull_requests", prError);

  const rows = ((data ?? []) as Array<{
    id: string;
    number: number | null;
    title: string;
    state: "open" | "merged" | "closed";
    author_login: string | null;
    url: string | null;
    merged_at: string | null;
    opened_at: string;
  }>).map((p) => ({
    id: p.id,
    number: p.number,
    title: p.title,
    state: p.state,
    author: p.author_login,
    url: p.url,
    mergedAt: p.merged_at,
    openedAt: p.opened_at,
  }));

  return { rows, page, total: total ?? 0, totalAll: totalAll ?? 0 };
}
