// How the palette asks the server (S.1, SR.1.7): a POST to the route the
// deployment generates (app/api/search/route.ts), cancellable with a signal.
// It was a server action, and Next runs a page's actions one at a time with no
// way to cancel one, so every query waited for the one before it and a card
// save made meanwhile waited behind the search.
import type { SearchResult } from "@/kernel/shell/search";
import type { SearchSurface } from "@/kernel/identity/search-actor";

// With the trailing slash: next.config sets trailingSlash, so the bare path is a
// 308 to this one, an extra round trip that a fetch refusing redirects would fail on.
export const SEARCH_ROUTE = "/api/search/";

/**
 * The surface's answer to `query`. Rejects when the request fails or is
 * refused, including a sign-in redirect, which is not followed: a redirect to
 * the login page is a refusal, not an answer. Rejects with an AbortError when
 * `signal` aborts.
 */
export async function fetchSearch(surface: Exclude<SearchSurface, "portal">, query: string, signal?: AbortSignal): Promise<SearchResult> {
  const res = await fetch(SEARCH_ROUTE, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ surface, query }),
    credentials: "same-origin",
    cache: "no-store",
    redirect: "manual",
    signal,
  });
  if (!res.ok) throw new Error(`search failed: ${res.status || res.type}`);
  return (await res.json()) as SearchResult;
}
