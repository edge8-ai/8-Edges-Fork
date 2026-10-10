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
  // The dynamic [slug] OG image routes render at request time, and Vercel's
  // file tracing does not bundle public/ into those lambdas, so the Manrope
  // TTFs (and case-study photos) 500'd with ENOENT. Statically prerendered
  // OG routes never hit this because they render at build time.
  // Top-level since Next 15 (B.18.2); it lived under experimental before.
  //
  // The keys say `*` where the route says `[slug]`, because a key is a glob and
  // Turbopack (the Next 16 build, B.18.3) reads `[slug]` as a character class
  // that matches no route: the case-study photos silently left the trace until
  // the keys changed. Webpack's matcher happened to accept the literal form.
  // scripts/check-tracing-includes.mjs fails the build if an include reaches no
  // route at all.
  outputFileTracingIncludes: {
    "/post/*/opengraph-image": ["./public/fonts/manrope-og-*.ttf"],
    "/case-studies/*/opengraph-image": [
      "./public/fonts/manrope-og-*.ttf",
      "./public/case studies/images/**/*",
      "./public/case studies/og/*.jpg",
    ],
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
    return [
      // The new-member onboarding form is a purpose-driven survey; serve it at a
      // clean top-level URL while it runs on the survey engine underneath.
      { source: '/new-member-onboarding', destination: '/surveys/new-member-onboarding' },
      // Video scripts are a static folder in public/; Next does not serve a
      // directory's index.html on its own, so map the clean URL to it.
      { source: '/video-scripts', destination: '/video-scripts/index.html' },
      { source: '/ai-officer/video-scripts', destination: '/ai-officer/video-scripts/index.html' },
    ]
  },
  async redirects() {
    return [
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
