// The global search's contract and its fan-out (S.1).
//
// Search is many entities per query, which is the shape of navigation (ADR 0002)
// and of the event registry (ADR 0003), not of a shell slot: each installed
// entity contributes searchers from its server door, and the composition root
// composes them in the generated app/search.ts. The kernel owns only what every
// searcher shares: what a hit looks like, how a typed query becomes terms, and
// how one query is asked of every contribution at once. It names no entity.
//
// Search is never a side door (ADR 0013): a hit is shown only to someone who
// may open the page it links to, by that page's own declared permission, read
// from the registry. A contribution names the page its hits open on each
// surface, so a person who may not open it is never searched for at all, and
// each hit's own href is checked again, closed by default: a hit whose page no
// declaration names is dropped. Which rows inside a page a person may see (a
// member's own boards) stays with the searcher, because the entity that owns a
// screen is the one that knows that scope.
import { stripPostgrestMetacharacters } from "@/kernel/data/postgrest-filter";
import { mayOpenPath } from "@/kernel/identity/permission-lookup";
import { permissionRegistry } from "@/kernel/identity/permission-registry";
import type { SearchActor, SearchSurface } from "@/kernel/identity/search-actor";

/** One record a search found. `href` opens it on the surface the actor is on. */
export type SearchHit = { id: string; title: string; detail: string | null; href: string };

/**
 * What an entity contributes: one kind of record, the page its hits open on
 * each surface it answers on (as the registry keys it, "/admin/contacts/[id]"),
 * and a searcher. `terms` are already stripped of filter syntax, and every one
 * of them must match. A searcher returns at most `limit` hits and throws when
 * its read fails; runSearch turns a throw into a failed group instead of an
 * empty one.
 */
export type SearchContribution = {
  kind: string;
  label: string;
  opens: Readonly<Partial<Record<SearchSurface, string>>>;
  search(actor: SearchActor, terms: string[], limit: number): Promise<SearchHit[]>;
};

export type SearchGroup = { kind: string; label: string; hits: SearchHit[]; failed: boolean };
export type SearchResult = { query: string; groups: SearchGroup[] };

/** Fewer characters than this match too much to be worth a query. */
export const MIN_QUERY = 2;
/** Each kind shows this many hits at most; the palette is a door, not a report. */
export const PER_KIND = 5;
/** A searcher slower than this is reported as failed rather than holding up the rest. */
export const TIMEOUT_MS = 3000;
const MAX_TERMS = 5;
const MAX_TERM_LENGTH = 64;

/**
 * A typed query as the terms a searcher filters on. Whitespace separates terms.
 * Anything PostgREST reads as filter syntax (and the double quote, which it
 * reads as quoting) is stripped, so no term can end its own condition and start
 * another. Exact duplicates are folded, and the count is capped, so one query
 * cannot fan out into dozens of filters on every table.
 */
export function searchTerms(query: string): string[] {
  const out: string[] = [];
  for (const raw of query.split(/\s+/)) {
    const term = stripPostgrestMetacharacters(raw.replace(/"/g, "")).slice(0, MAX_TERM_LENGTH);
    if (term && !out.includes(term)) out.push(term);
    if (out.length === MAX_TERMS) break;
  }
  return out;
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Asks every contribution whose page the actor may open on their surface at
 * once, keeps only the hits whose own page they may open, and groups the
 * answers in the contributions' order. A kind with no hits is left out. A kind
 * whose searcher threw or timed out stays in as `failed`, so the palette can say
 * it could not be searched instead of implying it holds nothing. `routes` is the
 * registry's, unless a test hands its own.
 */
export async function runSearch(
  contributions: readonly SearchContribution[],
  actor: SearchActor,
  query: string,
  { timeoutMs = TIMEOUT_MS, routes }: { timeoutMs?: number; routes?: Readonly<Record<string, string>> } = {},
): Promise<SearchResult> {
  const terms = searchTerms(query);
  if (terms.join("").length < MIN_QUERY) return { query, groups: [] };

  const pages = routes ?? permissionRegistry().routes;
  const mayOpen = (href: string | undefined) => mayOpenPath(pages, (permission) => actor.access.may(permission), href);
  const serving = contributions.filter((c) => mayOpen(c.opens[actor.surface]));
  const groups = await Promise.all(
    serving.map(async (c): Promise<SearchGroup> => {
      try {
        const hits = await withTimeout(c.search(actor, terms, PER_KIND), timeoutMs);
        return { kind: c.kind, label: c.label, hits: hits.filter((h) => mayOpen(h.href)).slice(0, PER_KIND), failed: false };
      } catch (err) {
        console.error(`[search] ${c.kind} failed:`, err instanceof Error ? err.message : err);
        return { kind: c.kind, label: c.label, hits: [], failed: true };
      }
    }),
  );
  return { query, groups: groups.filter((g) => g.failed || g.hits.length > 0) };
}
