import { readdirSync } from 'node:fs'

// The marketing pages live in their own Next.js app and Vercel project. This
// app is the default zone (multi-zones, node_modules/next/dist/docs/01-app/
// 02-guides/multi-zones.md): every path it has no page, route or file for is
// proxied to that app, so the domains, webhooks, OAuth callbacks and emailed
// links that point here keep working. The marketing app serves its own build
// assets under its assetPrefix, which reaches it through the same fallback.
//
// Two entries, not one, because of trailingSlash. Next's own redirect turns
// `/about` into `/about/` before any rewrite runs, and a rewrite source matches
// with or without a trailing slash, so a single `/:path*` would forward
// `/about/` as `/about`. The marketing app also has trailingSlash, answers
// with a redirect to `/about/`, and the browser lands back here: a loop. The
// first entry keeps the slash for pages (and `/` itself); the second carries
// files such as `/robots.txt` and `/site-static/_next/...`, which have none.
//
// Unset (a fork, local development, a preview without it), there is no
// fallback and an unknown path is this app's 404. The origin is configuration,
// never a literal, so no fork is proxied to the upstream's marketing site.
export function marketingFallback(origin) {
  const to = (origin ?? '').trim().replace(/\/+$/, '')
  if (!to) return []
  return [
    // The root on its own. Through `/:path*/` an empty path reaches the
    // marketing app as `//` on Vercel, which it redirects to `/` with a
    // relative Location: the browser lands back here, and edge8.ai/ looped on
    // 29 October 2026. Next's local matcher does not show it.
    { source: '/', destination: `${to}/` },
    { source: '/:path*/', destination: `${to}/:path*/` },
    { source: '/:path*', destination: `${to}/:path*` },
  ]
}

// Two hosts, one deployment (ADR 0022, the Hybrid shape of 29 October 2026).
// The App keeps the public site's domains on its own Vercel project, so every
// /api/* address that Stripe, Lark, QuickBooks, Resend and the OAuth providers
// were given keeps answering, and a broken marketing deploy cannot take the
// App down. What changes is where people land:
//
// - On any host but the App's, an App page permanently redirects to the same
//   path and query on the App's host, because links already sent in emails
//   keep arriving at the public domain. /api/* is never redirected: webhooks
//   do not follow redirects.
// - On the App's host, a page the App does not own permanently redirects to the
//   public site, and `/` serves the Front door (M.17).
// - The marketing fallback runs only off the App's host (`elsewhere`). It is a
//   proxy, and a proxy forwards the request's cookies: the App's session
//   cookies belong to its host, so they never reach the marketing origin.
//
// `appSegments` are the App's top-level page folders, read from app/ below so
// an entity that adds a page is covered without anyone editing this list.
// Everything under one moves, its files too (a proposal's .html page, a
// workflow deck), and that includes the public pages that ranked on the
// public domain (the workflows, help, the retreat pages): Khoa moved them all
// on 29 October 2026, and a permanent redirect carries their ranking. On the
// App's host, robots.txt and sitemap.xml are the App's own (library's
// api/app-host), because there they describe the App's public pages; on the
// public domain they stay the marketing site's. Unset APP_ORIGIN (a fork, a
// preview, local development) means one host and none of this.
//
// Each rule comes twice, with and without a trailing slash, for the reason
// given at marketingFallback: a param drops the slash a source matched.
export function hybridHosts({ appOrigin, siteOrigin, appSegments }) {
  const app = (appOrigin ?? '').trim().replace(/\/+$/, '')
  const site = (siteOrigin ?? '').trim().replace(/\/+$/, '')
  if (!app || !site) return { redirects: [], beforeFiles: [], elsewhere: {} }
  const appHost = [{ type: 'host', value: new URL(app).hostname.replace(/\./g, '\\.') }]
  // Folder names hold letters, digits, dashes and dots; only the dot needs escaping.
  const either = (names) => [...names].map((n) => n.replace(/\./g, '\\.')).join('|')
  const moving = either(appSegments)
  const owned = either([...appSegments, 'api', '_next'])
  // A page path: no file extension in its last segment, so the App's own
  // files (the Front door's photos, icons, the manifest) stay where they are.
  const page = '(?:[^/]+/)*[^/.]+'
  const twice = (source, destination, extra) => [
    { source: `${source}/`, destination: `${destination}/`, permanent: true, ...extra },
    { source, destination, permanent: true, ...extra },
  ]
  return {
    redirects: [
      ...twice(`/:path((?:${moving})(?:/.*)?)`, `${app}/:path`, { missing: appHost }),
      ...twice(`/:path((?!(?:${owned})(?:/|$))${page})`, `${site}/:path`, { has: appHost }),
    ],
    beforeFiles: [
      { source: '/', destination: '/front-door', has: appHost },
      { source: '/robots.txt', destination: '/api/app-host/robots', has: appHost },
      { source: '/sitemap.xml', destination: '/api/app-host/sitemap', has: appHost },
    ],
    elsewhere: { missing: appHost },
  }
}

// The App's top-level page folders. Private folders (_x), route groups ((x))
// and api are not pages; the clean URLs the App serves by rewrite are added.
const APP_SEGMENTS = [
  ...readdirSync(new URL('./app', import.meta.url), { withFileTypes: true })
    .filter((d) => d.isDirectory() && !/^[_(@[]/.test(d.name) && d.name !== 'api')
    .map((d) => d.name),
  'new-member-onboarding',
]

const HOSTS = hybridHosts({
  appOrigin: process.env.APP_ORIGIN,
  siteOrigin: process.env.NEXT_PUBLIC_SITE_URL,
  appSegments: APP_SEGMENTS,
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  // resvg ships a native binary per platform behind a `require` webpack cannot
  // follow. Left to the bundler, the exhibit renderer fails at runtime with a
  // missing .node file; as an external it loads from node_modules as intended.
  // Top-level since Next 15 (B.18.2), renamed from
  // experimental.serverComponentsExternalPackages.
  serverExternalPackages: ["@resvg/resvg-js"],
  // Vercel's file tracing does not bundle public/ into a lambda, so a route
  // that reads a file from it at request time names the files here.
  // Top-level since Next 15 (B.18.2); it lived under experimental before.
  //
  // A key is a glob over route paths: write `*` where the route says `[slug]`,
  // because Turbopack (the Next 16 build, B.18.3) reads `[slug]` as a character
  // class that matches no route. scripts/check-tracing-includes.mjs fails the
  // build if an include reaches no route at all.
  outputFileTracingIncludes: {
    // The writer agent's exhibits step rasterises SVG with resvg using the
    // Manrope TTFs; the step route is a lambda of its own and needs them traced.
    "/api/cron/writer-agent": ["./public/fonts/manrope-og-*.ttf"],
  },
  experimental: {
    // Next keeps an in-memory Client Router Cache of RSC payloads per tab, and
    // re-uses a dynamic segment's payload for 30 seconds by default. That
    // default outranks `dynamic = "force-dynamic"`, which the 282 authenticated
    // pages carry: force-dynamic promises the server re-renders WHEN ASKED, and
    // for those 30 seconds the browser does not ask. Measured on a production
    // build for card 4b13dd13 — a navigation away and straight back re-used a
    // payload that was 21 seconds old and missing a row that already existed.
    //
    // Zero means every soft navigation re-fetches. That is the right trade here
    // because this is an internal operations app whose pages are already
    // uncacheable by their own route config; a client reading a figure a manager
    // acts on must not be shown a figure from half a minute ago.
    //
    // This does NOT cover back/forward, which restores from the cache no matter
    // how stale (verified at 38 seconds). kernel/shell/RefreshOnStale.tsx is the
    // other half of the fix and explains the rest.
    //
    // Next 15 made zero the default (B.18.2). The pin stays explicit so the
    // guarantee above does not depend on a default a later release may move.
    staleTimes: { dynamic: 0 },
    // Resume uploads (recruiter intake, careers apply) arrive through server
    // actions; the framework default of 1 MB silently rejected files the app
    // itself allows up to 10 MB.
    serverActions: { bodySizeLimit: "10mb" },
  },
  async rewrites() {
    return {
      beforeFiles: HOSTS.beforeFiles,
      afterFiles: [
        // The new-member onboarding form is a purpose-driven survey; serve it at a
        // clean top-level URL while it runs on the survey engine underneath.
        { source: '/new-member-onboarding', destination: '/surveys/new-member-onboarding' },
        // Video scripts are a static folder in public/; Next does not serve a
        // directory's index.html on its own, so map the clean URL to it.
        { source: '/video-scripts', destination: '/video-scripts/index.html' },
        { source: '/ai-officer/video-scripts', destination: '/ai-officer/video-scripts/index.html' },
      ],
      fallback: marketingFallback(process.env.MARKETING_ORIGIN).map((r) => ({ ...r, ...HOSTS.elsewhere })),
    }
  },
  async redirects() {
    return [
      // First, so a renamed App page is followed on the App's host.
      ...HOSTS.redirects,
      // The 100-human-hours post was retitled to lead with the outcome; the old
      // slug was already shared, so keep those links working.
      { source: '/post/100-human-hours-one-whole-product', destination: '/post/imagine-knowing-everything-about-your-company', permanent: true },
      // My Tasks was renamed to Work Boards.
      { source: '/team/my-tasks', destination: '/team/workboard', permanent: true },
      { source: '/team/my-work-boards', destination: '/team/workboard', permanent: true },
      // The talent Rank page was renamed to Candidate Pool.
      { source: '/admin/talent/rank', destination: '/admin/talent/candidate-pool', permanent: true },
      // OKRs were renamed to Company Goals (FAST Goals stay the individual layer).
      { source: '/team/okrs', destination: '/team/company-goals', permanent: true },
      // The routines page was renamed to "The Agents We Run" on 2026-09-21.
      { source: '/workflows/the-routines-we-run', destination: '/workflows/the-agents-we-run', permanent: true },
    ]
  },
}

export default nextConfig
