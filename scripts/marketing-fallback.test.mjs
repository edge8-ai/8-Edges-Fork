// The App is the default zone and proxies every path it does not own to the
// marketing app (next.config.mjs, marketingFallback). This resolves real
// request paths through Next's own route matcher, with the same regex
// modifier Next applies to a custom rewrite, because the trap is in the
// matching: a rewrite source accepts a trailing slash, so a single `/:path*`
// sends `/about/` on as `/about`, which the marketing app redirects straight
// back here.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import nextConfig, { marketingFallback } from "../next.config.mjs";

const require = createRequire(import.meta.url);
const { getPathMatch } = require("next/dist/shared/lib/router/utils/path-match");
const { modifyRouteRegex } = require("next/dist/lib/redirect-status");
const { prepareDestination } = require("next/dist/shared/lib/router/utils/prepare-destination");
const { formatUrl } = require("next/dist/shared/lib/router/utils/format-url");

const ORIGIN = "https://marketing.example";

function resolve(routes, pathname) {
  for (const route of routes) {
    const match = getPathMatch(route.source, { strict: true, removeUnnamedParams: true, regexModifier: (r) => modifyRouteRegex(r) });
    const params = match(pathname);
    if (params) {
      const { parsedDestination } = prepareDestination({ appendParamsToQuery: false, destination: route.destination, params, query: {} });
      return formatUrl(parsedDestination);
    }
  }
  return null;
}

describe("the marketing fallback", () => {
  const routes = marketingFallback(`${ORIGIN}/`);

  it.each([
    ["/", `${ORIGIN}/`],
    ["/about/", `${ORIGIN}/about/`],
    ["/post/some-slug/", `${ORIGIN}/post/some-slug/`],
    ["/robots.txt", `${ORIGIN}/robots.txt`],
    ["/site-static/_next/static/chunks/main.js", `${ORIGIN}/site-static/_next/static/chunks/main.js`],
  ])("sends %s to %s", (pathname, destination) => {
    expect(resolve(routes, pathname)).toBe(destination);
  });

  it("adds nothing when the origin is unset, so a fork or a dev server proxies nowhere", () => {
    expect(marketingFallback(undefined)).toEqual([]);
    expect(marketingFallback("  ")).toEqual([]);
  });

  it("is the config's fallback, after the App's own rewrites", async () => {
    const before = process.env.MARKETING_ORIGIN;
    process.env.MARKETING_ORIGIN = ORIGIN;
    try {
      const rewrites = await nextConfig.rewrites();
      expect(rewrites.fallback).toEqual(marketingFallback(ORIGIN));
      expect(rewrites.afterFiles.map((r) => r.source)).toContain("/new-member-onboarding");
    } finally {
      if (before === undefined) delete process.env.MARKETING_ORIGIN;
      else process.env.MARKETING_ORIGIN = before;
    }
  });
});
