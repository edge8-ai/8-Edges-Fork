// The App answers on two hosts (next.config.mjs, hybridHosts): App pages on the
// public domain move to the App's host, pages the App does not own move off
// it, and /api/* never moves. This resolves real requests through Next's own
// route matcher and its has/missing check, in Next's order (redirects, then
// beforeFiles rewrites), because the traps are in the matching: a trailing
// slash a param drops, a prefix that swallows a longer folder name, a file
// that looks like a page.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { hybridHosts } from "../next.config.mjs";

const require = createRequire(import.meta.url);
const { getPathMatch } = require("next/dist/shared/lib/router/utils/path-match");
const { modifyRouteRegex } = require("next/dist/lib/redirect-status");
const { prepareDestination, matchHas } = require("next/dist/shared/lib/router/utils/prepare-destination");
const { formatUrl } = require("next/dist/shared/lib/router/utils/format-url");

const APP = "https://app.example.com";
const SITE = "https://www.example.com";
const hosts = hybridHosts({
  appOrigin: APP,
  siteOrigin: `${SITE}/`,
  appSegments: ["team", "admin", "portal", "t", "front-door", "workflows", "help", "proposals", "unsubscribe", "new-member-onboarding"],
});

// What Next does with one request: the first matching redirect, else the
// first matching beforeFiles rewrite, else the request goes on unchanged.
function resolve(host, url) {
  const { pathname, searchParams } = new URL(url, "http://x");
  const query = Object.fromEntries(searchParams);
  const req = { headers: { host } };
  const first = (routes) => {
    for (const route of routes) {
      const match = getPathMatch(route.source, { strict: true, removeUnnamedParams: true, regexModifier: (r) => modifyRouteRegex(r) });
      const params = match(pathname);
      if (!params) continue;
      const hasParams = matchHas(req, query, route.has, route.missing);
      if (!hasParams) continue;
      const { parsedDestination } = prepareDestination({ appendParamsToQuery: false, destination: route.destination, params: { ...params, ...hasParams }, query });
      return formatUrl(parsedDestination);
    }
    return null;
  };
  const to = first(hosts.redirects);
  if (to) return `redirect ${to}`;
  const rewrite = first(hosts.beforeFiles);
  return rewrite ? `serve ${rewrite}` : "serve";
}

describe("the App's two hosts", () => {
  it.each([
    // An App page on the public domain moves to the App's host, path and query kept.
    ["www.example.com", "/team/", `redirect ${APP}/team/`],
    ["www.example.com", "/team/workboard/?card=12", `redirect ${APP}/team/workboard/?card=12`],
    ["example.com", "/portal/login/", `redirect ${APP}/portal/login/`],
    ["www.example.com", "/t/abc123/", `redirect ${APP}/t/abc123/`],
    ["www.example.com", "/unsubscribe/?token=x", `redirect ${APP}/unsubscribe/?token=x`],
    ["www.example.com", "/front-door/", `redirect ${APP}/front-door/`],
    ["www.example.com", "/new-member-onboarding/", `redirect ${APP}/new-member-onboarding/`],
    // /t is a whole segment: the public site's /the-stack is not an App page.
    ["www.example.com", "/the-stack/", "serve"],
    // The App's public pages moved too (Khoa, 29 Oct 2026), files under them included.
    ["www.example.com", "/workflows/recruitment/", `redirect ${APP}/workflows/recruitment/`],
    ["www.example.com", "/workflows/proposal-to-contract.html", `redirect ${APP}/workflows/proposal-to-contract.html`],
    ["www.example.com", "/help/workboard/", `redirect ${APP}/help/workboard/`],
    ["www.example.com", "/proposals/acme-2026.html", `redirect ${APP}/proposals/acme-2026.html`],
    // The public domain's robots and sitemap are the marketing site's.
    ["www.example.com", "/robots.txt", "serve"],
    ["www.example.com", "/sitemap.xml", "serve"],
    // Webhooks and the forms' forwarders never move.
    ["www.example.com", "/api/webhooks/stripe/", "serve"],
    ["www.example.com", "/api/stats", "serve"],
    // The public site's own pages fall through to the fallback.
    ["www.example.com", "/", "serve"],
    ["www.example.com", "/post/some-slug/", "serve"],
    // On the App's host: the Front door at its root, App pages served as they are.
    ["app.example.com", "/", "serve /front-door"],
    ["app.example.com", "/team/workboard/", "serve"],
    ["app.example.com", "/api/telemetry/sessions/", "serve"],
    ["app.example.com", "/_next/static/chunks/main.js", "serve"],
    // A file stays where it is, so the Front door's photos load.
    ["app.example.com", "/homepage/images/3.jpg", "serve"],
    // The App's public pages are served on its host, with its own robots and sitemap.
    ["app.example.com", "/workflows/recruitment/", "serve"],
    ["app.example.com", "/robots.txt", "serve /api/app-host/robots"],
    ["app.example.com", "/sitemap.xml", "serve /api/app-host/sitemap"],
    // A marketing page moves to the public domain.
    ["app.example.com", "/about/", `redirect ${SITE}/about/`],
    ["app.example.com", "/post/some-slug/?utm_source=x", `redirect ${SITE}/post/some-slug/?utm_source=x`],
    ["app.example.com", "/the-stack/", `redirect ${SITE}/the-stack/`],
  ])("%s%s → %s", (host, url, expected) => {
    expect(resolve(host, url)).toBe(expected);
  });

  it("keeps the marketing fallback, a proxy that forwards cookies, off the App's host", () => {
    const fallback = { source: "/:path*", destination: "https://marketing.example.com/:path*", ...hosts.elsewhere };
    const proxied = (host) => Boolean(matchHas({ headers: { host } }, {}, fallback.has, fallback.missing));
    expect(proxied("www.example.com")).toBe(true);
    expect(proxied("example.com")).toBe(true);
    expect(proxied("app.example.com")).toBe(false);
  });

  it("does nothing without the App's origin, so a fork, a preview or a dev server has one host", () => {
    expect(hybridHosts({ appOrigin: undefined, siteOrigin: SITE, appSegments: ["team"] })).toEqual({ redirects: [], beforeFiles: [], elsewhere: {} });
    expect(hybridHosts({ appOrigin: APP, siteOrigin: "", appSegments: ["team"] })).toEqual({ redirects: [], beforeFiles: [], elsewhere: {} });
  });
});
