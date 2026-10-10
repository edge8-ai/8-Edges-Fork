# Architecture Overview — Website vs. Core Application

**Repo:** edge8-web (single Next.js app, App Router)
**Last updated:** 2026-09-05 (ME-14; layout after the multi-entity move)

This repo ships two logically distinct products from one codebase: the public **marketing
website** (edge8.co) and the internal **core application** (Company OS admin/CRM, the staff Team
dashboard, the external Client Portal, and the client-facing tools that back them). Since the
multi-entity move (ME-01 … ME-13, `docs/engineering/2026-09-03-multi-entity-design.md`) the
split is enforced in the tree: every product block is an **entity** under `entities/` with an
import boundary, an owned table list, and its own routes, API handlers and crons; the code
they all share is the **kernel** under `kernel/`; and `app/` is only the composition root.
The per-feature map — which entity, which door, which tables — is
`docs/engineering/entities.md`; this page is the view from the top.

---

## Layout

```
app/                   Next.js composition root. Almost every route file is a one-line
                       mount that re-exports an entity's routes/, api/ or crons/ file, and
                       keeps only what Next must read from the file itself: route-segment
                       config (runtime, dynamic, fetchCache, maxDuration) and the route
                       stylesheets. The three surface layouts are the exception — they
                       compose the kernel shell with the generated navigation. Also here:
                       the root layout, error and not-found boundaries, app/api/auth/
                       callback, and the generated events.ts, nav.ts and env.ts.
entities/              Twenty-one product blocks. Same shape each:
  site/  company-os/     index.ts     server door — the only path other code imports
  contacts/  crm/        client.ts    browser door — what "use client" files import
  org/  boards/          tables.ts    the Supabase tables this entity writes
  coaching/  hiring/     routes/      page and layout bodies, mirroring app/
  onboarding/  team/     api/         route handlers        crons/   cron handlers
  campaigns/  ideas/     ui/          entity-private components, and this entity's
  client-programs/                    navigation contributions (ui/nav.ts)
  finance/  time-off/    lib/         everything else, incl. lib/reads.ts and lib/writes.ts
  portal/  retreats/                  (the builders other entities use to read and change
  htt/  billing/                      this entity's tables)
  assistant/  library/
kernel/                Shared library; imports nothing from entities/ or app/.
  data/                  Supabase clients and generated types
  identity/              the guards (requireAdmin, requireTeamMember, requirePortalMember),
                         signed tokens, the access gate, identity-table readers and writers
  shell/                 the three surfaces' chrome and the navigation contract
  events/                the in-process event bus
  messaging/  config/  ui/  audit/  ai/
entities.manifest.json Names every entity and the kernel, their paths, requires, portability
                       and tables; the boundary zones, the ownership gates and everything
                       generated from a deployment read it.
deployments/*.json     The entity list one build installs.
```

The rules that hold this together (all enforced, see `docs/engineering/entities.md`):
`app/` imports an entity only through its doors, `routes/`, `api/` or `crons/`; an entity
imports another entity only through `index.ts` or `client.ts`; `kernel/` imports neither
`entities/` nor `app/`; nothing under `ui/` or `lib/` imports from `routes/`; every entity
declares the entities its door graph reaches, which makes that graph a DAG; and a table is
written only by its owner or through the writer the owner exports.

---

## Website

Public, unauthenticated, SEO- and lead-gen-oriented pages. Anyone can reach these without
logging in. Everything in this table is `entities/site` unless the row says otherwise.

| Route (`app/` mount) | Purpose |
|---|---|
| `app/page.tsx` (root) | Homepage |
| `app/about` | Company/about page |
| `app/8-edges-app` | Marketing page for the open-source 8 Edges company OS (public, no auth; `app/8-edges-app/layout.tsx` only sets metadata) |
| `app/ai-programs` | AI programs marketing |
| `app/blog`, `app/post/[slug]` | Blog listing and article pages |
| `app/caio-leadership` | CAIO leadership program marketing |
| `app/careers` | Careers/job listings |
| `app/case-studies` | Case study pages |
| `app/contact` | Contact form (public) |
| `app/global-staffing` | Global staffing marketing |
| `app/legal` | Terms, privacy, legal pages |
| `app/training-and-certification` | Certification program marketing |
| `app/your-first-ai-hire` | Campaign landing page |
| `app/unsubscribe` | Email unsubscribe page |
| `app/llms.txt`, `app/sitemap.ts`, `app/robots.ts`, `app/opengraph-image.tsx` | SEO surfaces; live at the app root because Next requires them there |
| `app/events`, `app/the-vietnam-experience`, `app/saigon-private`, `app/reserve` | Retreat/event marketing and reservation — `entities/retreats` (the Vietnam Adventure intake forms were retired with their `trip_*` tables, Y.37) |
| `app/docs`, `app/workflows` | Public documentation and the workflow library — `entities/library` |

Characteristics: no auth required, optimized for SEO, primarily content and lead capture.
The site chrome (`Nav`, `Footer`, `SiteFrame`) is `entities/site/ui/`.

---

## Core application

Internal tools and client-facing gated products that sit behind the marketing site — the
"Company OS." These are logged-in, transactional, or generated-and-shared-by-staff surfaces
rather than organic public traffic.

| Route (`app/` mount) | Entity | Purpose |
|---|---|---|
| `app/admin` (`(auth)` + `(dashboard)` route groups) | `entities/company-os` | Company OS admin/CRM — the internal operations app, for allowlisted admins (`requireAdmin`) |
| `app/team` (`(auth)` + `(dashboard)` route groups) | `entities/team` | Staff dashboard for employees and managers (`requireTeamMember`): coaching, client assignments, hiring, time off, chat. Admins with a linked team record can switch into it from the admin sidebar |
| `app/portal` (`(auth)` + `(dashboard)` route groups) | `entities/portal` | Client Portal for **external client contacts** (`requirePortalMember`), scoped to their portal_members companies; admins can "Assume" a client view via a server-tracked session |
| `app/proposals` | `entities/portal` | Client-facing proposal pages generated from the CRM |
| `app/surveys` | `entities/portal` | Survey forms tied to CRM data collection |
| `app/work` | `entities/portal` | Work-token pages for contractors |
| `app/t/[code]` | `entities/portal` | Tracked-link redirector |
| `app/checkout` | `entities/billing` | Transactional checkout flow (Stripe) |
| `app/plans` | `entities/billing` | Internal planning/finance pages (the retreats P&L, a static HTML export) |
| `app/my-retreat` | `entities/retreats` | Signed-token retreat hub for clients (`entities/retreats/routes/my-retreat/MyRetreatGate.tsx`) |
| `app/private` | `entities/library` | Private, access-gated library instances (e.g. `app/private/<slug>`) |

Characteristics: most routes are behind auth ((auth) route groups, portal gates, signed
tokens), or are generated/shared by staff rather than discovered organically, and read from or
write to the same backend (Supabase company_os) that powers the admin CRM.

### Surfaces

Three authenticated surfaces share one shell (`app/admin/admin.css`; the .admin-shell + .admin-main
classes) and one security model: the company_os schema has RLS enabled with no policies and no
browser grants, every read goes through the service-role client (`kernel/data/supabase.ts`), and
the guard function called at the top of each surface's dashboard layout
(`entities/company-os/routes/admin/(dashboard)/layout.tsx`, `entities/team/routes/team/(dashboard)/layout.tsx`,
`entities/portal/routes/portal/(dashboard)/layout.tsx`, mounted from the matching `app/` path) and of
every server action is the only boundary. The guards live in `kernel/identity/`, not in any
entity, because four entities call them. Identity is matched on people.auth_user_id, never on
email.

| Path | Who signs in | Guard function | Sidebar component |
|---|---|---|---|
| `app/admin` | Internal admins: users in company_os.admins or the ADMIN_ALLOWLIST env var | requireAdmin() in `kernel/identity/admin-auth.ts` (requireSuperAdmin() adds can_view_sensitive) | `entities/company-os/ui/AdminSidebar.tsx` |
| `app/team` | Employees and managers with an active team_members row (status active, on_leave, notice, or pre_start) | requireTeamMember() in `kernel/identity/team-auth.ts` | `entities/team/ui/TeamSidebar.tsx` |
| `app/portal` | External client contacts holding at least one active portal_members row; admins only via a time-boxed "Assume" session | requirePortalMember() in `kernel/identity/portal-auth.ts` | `entities/portal/ui/PortalSidebar.tsx` |

The gates redirect across surfaces rather than overlapping: an admin without a team record is sent
from /team to /admin; an admin hitting /portal without an Assume session goes to /admin; an active
team member hitting /portal goes to /team. Design notes:
`docs/plans/2026-07-05-team-portal-design.md` and `docs/plans/2026-07-11-client-portal-design.md`.

The other guards are entity-specific: retreats pages take a signed token
(`kernel/identity/signed-token.ts`), the private library an access code
(`kernel/identity/access-gate.ts`), HTT and the crons a cron secret, and the Stripe webhook
its signature.

---

## Shared infrastructure

- **`app/api`** — backend for *both* halves; every route is a mount of an entity's `api/` or
  `crons/` file, so the owner is the entity named in the import. Website-facing:
  `app/api/contact`, `app/api/careers`, `app/api/unsubscribe`, `app/api/stats`,
  `app/api/ingest` (site); `app/api/vietnam-adventure-*`, `app/api/my-retreat`,
  `app/api/checkout`, `app/api/stripe`
  (billing); `app/api/surveys` (portal); `app/api/docs` (library). Core-application-only:
  `app/api/admin`, `app/api/qbo`, `app/api/webhooks` (company-os); `app/api/team` (team);
  `app/api/portal` (portal); `app/api/htt` (htt); `app/api/assistant` (assistant);
  `app/api/cron/*` (company-os, team and htt, one handler per schedule in `vercel.json`).
  `app/api/auth/callback` is the Supabase auth callback at the composition root.
- **`kernel/`** — the clients, guards, messaging, config, audit log, AI client and the
  shared admin UI primitives every entity uses (`docs/engineering/entities.md` lists each
  package's contents).
- **`app/layout.tsx`, `app/globals.css`, `app/styles/`** — shared root layout and design tokens
  used by both the marketing site and the core application.

## Notes on the split

A few routes are hybrid by nature and don't fit cleanly:

- **`app/reserve`** is public-facing (booking pages) but writes into the same CRM backend as the
  core application — categorized as website here because its audience is the public.
- **`app/docs`** serves documentation content publicly; it's grouped with the website because it
  has no auth, but the content it serves may originate from internal workflow docs.
- **`entities/assistant`**, **`entities/billing`** and **`entities/library`** are cross-cutting
  services rather than products: they have their own entity because three or more other
  entities import them, and they inherit the guard of whoever calls them.

## Known structural debt

The 2026-09-02 codebase review ([docs/engineering/2026-09-02-codebase-review.md](engineering/2026-09-02-codebase-review.md))
is the inventory that started the redesign; the 2026-09-03 architecture redesign
(`docs/engineering/2026-09-03-architecture-redesign.md`, tickets AR-01 … AR-40) is working
through it. What the entity move fixed: the layout is now enforced rather than conventional,
and `lib/` and `components/` are gone. What remains from the review: authorization is still
per-function convention (guarded by `check:action-auth` rather than by structure — AR-10/11);
styling is three systems at once (page-prefixed global CSS, `app/admin/admin.css`, and inline
`style={{}}` objects — AR-30 … AR-34); and the three auth libs in `kernel/identity/` plus their
LoginForm / chat widget / documents list are still near-copies (AR-11). One cost the move added
on purpose: entities that depend on each other both ways close into `import/no-cycle` warnings
through their index barrels (59, held by `scripts/lint-warning-baseline.json` and listed per
pair with the owning AR ticket in `docs/engineering/2026-09-05-import-cycles.md`). Check the
review's "Deferred" list and the AR tickets before opening a refactor so you are not
re-deciding something already decided.

This document reflects the tree as of 2026-09-05. If a new top-level route is added, extend the
relevant table above and the entity table in `docs/engineering/entities.md` rather than creating
a new doc.
