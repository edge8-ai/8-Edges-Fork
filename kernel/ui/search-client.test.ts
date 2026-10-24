import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSearch, SEARCH_ROUTE } from "./search-client";

// SR.1.7. The palette posts its query to the generated route instead of calling
// a server action, so a stale request can be cancelled and nothing queues
// behind it. The text goes in the body, never the URL, which the request logs keep.
afterEach(() => vi.unstubAllGlobals());

describe("fetchSearch", () => {
  it("posts the surface and the query in the body, and answers the route's result", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ query: "anna", groups: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    expect(await fetchSearch("team", "anna")).toEqual({ query: "anna", groups: [] });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(SEARCH_ROUTE);
    expect(url).not.toContain("anna");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ surface: "team", query: "anna" });
    expect(init.redirect).toBe("manual");
  });

  it("treats a refusal or a sign-in redirect as a failure, not as no hits", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 403 })));
    await expect(fetchSearch("admin", "anna")).rejects.toThrow(/403/);
    // A redirect that is not followed comes back with status 0.
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 0, type: "opaqueredirect" }) as Response));
    await expect(fetchSearch("admin", "anna")).rejects.toThrow(/opaqueredirect/);
  });

  it("hands the signal to fetch, so a newer query can cancel the request", async () => {
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      if (init.signal?.aborted) throw new DOMException("aborted", "AbortError");
      return new Response(JSON.stringify({ query: "a", groups: [] }));
    });
    vi.stubGlobal("fetch", fetch);
    const controller = new AbortController();
    controller.abort();
    await expect(fetchSearch("admin", "an", controller.signal)).rejects.toThrow(/aborted/);
  });
});
