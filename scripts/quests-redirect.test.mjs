// The retired Quests page (AK.4, ADR 0036) answers with a permanent redirect to
// Asks. An old Inbox row, a Lark link or an assistant draft link carries its
// query string, so the redirect must hand it on: `?draft=` is the case that
// matters, because it opens the New ask drawer filled in. This resolves a
// real request through Next's own redirect matcher, the way
// marketing-fallback.test.mjs does for rewrites.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import nextConfig from "../next.config.mjs";

const require = createRequire(import.meta.url);
const { getPathMatch } = require("next/dist/shared/lib/router/utils/path-match");
const { modifyRouteRegex } = require("next/dist/lib/redirect-status");
const { prepareDestination } = require("next/dist/shared/lib/router/utils/prepare-destination");
const { formatUrl } = require("next/dist/shared/lib/router/utils/format-url");

async function follow(pathname, query) {
  for (const route of await nextConfig.redirects()) {
    if (route.has || route.missing) continue;
    const match = getPathMatch(route.source, { strict: true, removeUnnamedParams: true, regexModifier: (r) => modifyRouteRegex(r) });
    const params = match(pathname);
    if (!params) continue;
    const { parsedDestination } = prepareDestination({ appendParamsToQuery: false, destination: route.destination, params, query });
    return { permanent: route.permanent, location: formatUrl(parsedDestination) };
  }
  return null;
}

describe("/team/quests", () => {
  it("redirects permanently to /team/asks", async () => {
    expect(await follow("/team/quests", {})).toEqual({ permanent: true, location: "/team/asks" });
  });

  it("keeps an assistant draft link's query string", async () => {
    expect(await follow("/team/quests", { draft: "toolu_01abc" })).toEqual({ permanent: true, location: "/team/asks?draft=toolu_01abc" });
  });

  it("leaves the manager report where it is", async () => {
    expect(await follow("/team/quests/report", {})).toBeNull();
  });
});
