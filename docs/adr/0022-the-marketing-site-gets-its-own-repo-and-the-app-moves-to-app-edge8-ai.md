# ADR 0022 — The Marketing site gets its own repository, and the App moves to app.edge8.ai

Date: 2026-10-25. Status: accepted. ADR 0034 amended its **Reads** decision on 2026-10-29,
and Khoa reverted that amendment the same day: the site reads with the service-role key, as
below. 0034's App-side moves and its fork-website decision still stand. Khoa amended the
**domains** on 2026-10-29 (the Hybrid shape, below): people see the result decided here, but
the App keeps edge8.ai and www.edge8.ai on its own Vercel project.

Records the marketing-split grilling of 21 October 2026 (Q1 to Q24, Khoa), raised by Dave on
20 October, and the domain ruling of 25 October (Q25 to Q27). The first draft of this ADR put
the Marketing site on edge8.co. The CEO wanted one domain instead, and that version never
merged. Card M.15 holds the phases, and card M.17 holds the Front door. Vocabulary: **Marketing
site**, **App** and **Front door** in `CONTEXT.md`. This ADR supersedes the recommendation in
`docs/engineering/2026-09-20-marketing-site-split.md` (PR #1539). That record's measurements
still hold.

## Context

On 21 September we decided not to split, because the complaint was build time and a
marketing-only deployment already built in 57.5 s against 159.1 s. The complaint is now
different. The content team ships low-risk copy with Claude Code, and every change it makes
still passes through the App's gates, merges and deploys, so App work keeps getting in their
way. The September record named this case itself: a repository boundary is the right tool
"if marketing gets its own contributors". A deployment file cannot give that. It splits the
build, but not who works in the repository.

The domain does not deliver the benefit. The separate repository and Vercel project do. The
domain only decides which side pays for the move.

## Decision

- The **Marketing site** (home, about, case studies, the service pages, the blog, careers,
  contact, legal, the 8 Edges product page) moves to a private repository, `edge8-ai/edge8-site`,
  with its own Vercel project, and keeps **edge8.ai**. Its URLs and its search ranking do not
  move. The content team, Dave and Khoa can write to it.
- The **App** moves to **app.edge8.ai**, in `edge8-web` with its own Vercel project: Admin,
  Team hub, Portal, help, unsubscribe, the private library, retreats, proposals, and the
  telemetry, ingest and stats endpoints.
- Every App page on edge8.ai (`/admin`, `/team`, `/portal`, `/proposals`, `/unsubscribe` and
  the other App routes) permanently redirects to the same path on app.edge8.ai, kept for good.
  Links already sent in emails cannot be changed, and they keep arriving at edge8.ai. Since
  the Hybrid amendment the App's own project does this, and `/api/*` is never redirected.
- app.edge8.ai/ is the **Front door**, owned by `org` and marked Edge8-only, so a fork falls
  back to the default home. It is static copy and hand-picked photos of people who agreed, and
  it leads into the Team hub and Admin.
- The two repositories share **no code**. Design tokens, the organisation identity and the
  few UI pieces the site needs are copied once and may drift. They meet only in the shared
  Supabase database.
- **Reads**: the site reads the App's tables directly, with the service-role key, which is set
  only in the Vercel project and never on a laptop. The App makes no promise to keep those
  tables stable for the site. When an App change breaks the Marketing site, the content team
  fixes it in their repository.
- **Writes**: a form inserts one row into an intake table the App owns, and nothing else. A
  database webhook has the App process it at once, and a scheduled sweep catches any row the
  webhook missed. The App runs the duplicate-person check, spam check, lead promotion, inquiry
  run, AI resume screening, staff emails and the Lark notice. Resumes are uploaded to
  `resumes/intake/` and moved by the App. The site holds no email or Lark secret.
- The home page's two figures come from the App's public `/api/stats`.

## Amendment, 29 October 2026: the Hybrid domain shape

Khoa chose between moving the domains to the Marketing site's project, as decided above, and
keeping them where they are. He kept them where they are, because of what moving them would
have asked of every integration in the Consequences below.

- **The App's Vercel project (`edge8-web`) keeps edge8.ai and www.edge8.ai, and also serves
  app.edge8.ai.** Every `/api/*` address that Stripe, Lark, QuickBooks, Resend, the OAuth
  providers, the telemetry plugin and the Marketing site's form forwarders were given keeps
  answering, with nothing re-registered.
- **The Marketing site is served on edge8.ai through the App.** The App is the default zone
  of a Next.js multi-zones setup: a `fallback` rewrite hands every path the App has no page,
  route or file for to the Marketing site's production URL (`MARKETING_ORIGIN`). The
  Marketing site serves its build files under `/site-static` so they never collide with the
  App's. Its project has no custom domain of its own.
- **Routing by host** (`hybridHosts` in `next.config.mjs`, `APP_ORIGIN`): on any host but
  app.edge8.ai, an App page permanently redirects to the same path and query on app.edge8.ai;
  on app.edge8.ai, a page the App does not own permanently redirects to www.edge8.ai, and `/`
  serves the Front door. `/api/*` is never redirected, on either host, because webhooks do
  not follow redirects. A few App pages that rank on the public domain stay there and are
  served on both hosts; Khoa decides that list (`SHARED_SEGMENTS`), because moving a page off
  it moves its ranking.
- **Sign-in starts and finishes on app.edge8.ai**, because the sign-in pages are App pages
  and redirect there. Supabase Auth must allow app.edge8.ai as a redirect target.
- **Forms**: the Marketing site's `/api/contact` and `/api/careers/apply` forward the request
  to the same path on the App and return its answer. The intake table of 0034 is on
  production but unused; its removal is deferred.

What it costs: a broken App deploy still takes the Marketing site off edge8.ai, because the
App serves the domain. The reverse no longer holds: a broken Marketing deploy leaves the App
and every `/api/*` address up. Each Marketing page is one proxied hop through the App. The
consequences below about moving integrations, the Supabase site URL and the telemetry plugin
no longer apply, except that Supabase Auth must allow app.edge8.ai and that everyone signs in
once on the new host.

## Considered options

- **One repository, two Vercel projects** (the September option 2). This was rejected
  because it splits the build but keeps the content team inside the App's repository, gates
  and merge queue, and that was the complaint.
- **The Marketing site moves to edge8.co and the App keeps edge8.ai** (this ADR's first
  draft). Nothing configured would have had to move. It was rejected because the CEO wants
  one brand domain, and the Marketing site keeps its ranking only if it stays on edge8.ai.
- **Both projects behind edge8.ai, routed by path (Vercel microfrontends).** Nothing would
  move and nothing would break. It was rejected because the CEO wants the App on an address
  of its own. The Hybrid amendment keeps the CEO's addresses and uses this option's routing
  underneath, with Next.js multi-zones in place of Vercel microfrontends.
- **companyos.edge8.ai.** This was rejected for app.edge8.ai, because "Company OS" is a
  retired name and App is the term this repository uses.
- **A restricted key that can read only `site` views.** This was rejected for now. Khoa's
  ruling is that the content team asked for independence and owns what breaks. It can be
  switched later without changing the write path.
- **The site writes final rows (person, inquiry, application) itself.** This was rejected
  because the site would then copy the App's deduplication and lead rules and depend on five
  tables. With the intake table it depends on one.

## Consequences

- The App's move breaks quietly unless each integration is moved and checked on production:
  the Supabase site URL and allowed redirects, the OAuth callbacks, the Stripe and Lark
  webhooks (which do not follow redirects), `NEXT_PUBLIC_SITE_URL` (which 36 files build links
  from), and the telemetry plugin, whose installed copies post to
  `www.edge8.ai/api/telemetry/sessions/` until each teammate updates.
- Sign-in cookies belong to the host, so everyone signs in again once after the switch.
- The App-path redirects on edge8.ai are permanent, because sent emails never change.
- The App's migration rules (db-review, the reader search in CLAUDE.md) do not see readers in
  `edge8-site`. A column the App drops can break a Marketing site page in production, and
  nothing here will warn about it. That is accepted.
- The service-role key now lives in a second Vercel project. Whoever administers that project
  can read every table.
- 8 Edges clients keep their site inside their own fork until a site template is offered
  (a later card). Parkes already has its own repository and Vercel project.
