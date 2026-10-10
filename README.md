# Company OS — self-setup guide

A Next.js 16 + Supabase + Vercel operations platform: CRM, ATS, client portal,
team portal, coaching, marketing, and Claude-powered assistants.

This file is a **runbook written for an AI coding agent**, not a tutorial. If
you are a person, you can follow it yourself — but the intended use is:

> Paste this repo's URL into Claude Code and say
> *"use the README.md guide, set up Company OS for <client name>, and give me
> the Vercel website link to use"*

The end state is a **copy of Company OS running under the client's own name**
(their brand, domain, sender addresses and admin inbox), on a Supabase project
and a Vercel project they own, that their developers then build on. Step 1b is
where the renaming happens; do not skip it, or the client ships a site that
says Edge8 on it and mails Edge8's inbox.

It needs authenticated access to **GitHub, Supabase and Vercel** — either the
Claude Code connectors, or the `gh` / `supabase` / `vercel` CLIs logged in.
Either is fine; every command below is written for the CLI path. If neither is
available for one of the three, stop at Step 0 and say which.

---

## ⚠️ One thing to get right before you start

**Build the database from `supabase/00-prereqs.sql` + `supabase/01-schema.sql`,
never from `supabase/migrations/`.**

There is **no `supabase/migrations/` directory in this repo** — it is excluded
from the sync deliberately. If you meet one in a variant of this repo, do not
build from it: it creates about two thirds of the tables and only a handful of
the row-level-security policies. The rest was applied directly to the upstream
database and never written back as migration files. Running the migrations produces a database
that looks fine and that the app cannot use.

An agent that runs the migrations and reports success has not set this up. If
`01-schema.sql` is absent, stop and say so rather than substituting.

To make the choice impossible to get wrong, **these two files plus
`supabase/02-rebrand.sql` are the only `.sql` files in this repo**. `docs/db/`
carries the data dictionary (`data-dictionary.md`) and nothing executable. If
`find . -name '*.sql'` shows anything other than the three under `supabase/`,
you are not looking at a clean copy of this repo.

The third file is part of Step 1b, run in Step 3: `01-schema.sql` hardcodes the
upstream brand slug as a **data value** — four CHECK constraints and three
column defaults — and a rebranded app cannot write an objective, a service
line, a backlog item or an invoice until they are changed. It takes the client
slug as a psql variable.

**A second thing to get right, which is easier to miss:** applying both SQL
files is not sufficient. A new Supabase project does not expose `company_os` to
PostgREST, and the app reads everything through it — so the schema can be
100% correct and the app still cannot read a single row. Step 3 covers it. Do
not skip the REST verification at the end of that step; the psql counts cannot
detect this.

---

## Step 0 — preflight and install

### Access — check this first, it is the most common blocker

All three must be authenticated before anything else works. Check all three
**now**, in one go:

```bash
gh auth status
vercel whoami
supabase projects list
```

If the connectors are enabled, use them. Otherwise the CLIs need logging in —
and **two of those logins open a browser and cannot be done by an agent**:

```bash
supabase login    # opens a browser — the operator must run this themselves
vercel login      # same
```

`gh auth login` is also interactive if `gh` is not already authenticated.

**Ask the operator to run whichever of these fail, before you go any further.**
This is the one place where batching a request is right: they are blocking,
they need a human at a keyboard, and discovering them one at a time in the
middle of Step 2 wastes everyone's time. Confirm at the same time that they are
happy for you to create a **Supabase project and a Vercel project on their
accounts**, since both can cost money — and tell them the names you will use.

Also check the Vercel scope up front. `vercel teams ls` lists what the logged-in
account can reach; if the intended team is not there, the operator is logged in
as the wrong account. Sort that out now, not at Step 6.

**Check GitHub org membership the same way**, if the fork is to land in the
client's organisation rather than the operator's own account:

```bash
gh api user/orgs --jq '.[].login'
```

The org must appear in that list. Being able to *see* one of its repos is not
the same thing — an outside collaborator with admin on a single repo can read
that repo and nothing more, and both `gh repo fork --org` (HTTP 403 "must have
admin rights") and `gh repo create <org>/<name>` ("does not have the correct
permissions to execute CreateRepository") fail for them. If the org is missing,
ask the operator now to add the account as an org member, or to create the
empty repo themselves and grant the account admin on it. No amount of retrying
clears this one.

One more thing to run before creating anything, because it hangs otherwise:
every `vercel` command in this runbook is written for a shell with a terminal.
From a non-interactive shell — which is what an agent has — `vercel env add`,
`vercel link` and `vercel env pull` wait on stdin forever even with `--yes`
and `--value`. Append `</dev/null` to every `vercel` invocation you script.
A loop of thirty `vercel env add` calls sat for fifteen minutes with one
variable landed before this was understood.

### Tooling — install what is missing, do not ask first

Check each, install the ones that are absent, and report what you installed at
the end rather than asking up front.

```bash
node --version; npm --version; gh --version; vercel --version; supabase --version
```

| Missing | macOS | Linux (Debian/Ubuntu) |
|---|---|---|
| Node 24 (`.nvmrc`; `package.json` requires `>=24`) | `brew install node@24` | `curl -fsSL https://deb.nodesource.com/setup_24.x \| sudo -E bash - && sudo apt-get install -y nodejs` |
| `gh` | `brew install gh` | `sudo apt-get install -y gh` |
| `vercel` | `npm install -g vercel` | same |
| `supabase` | `npm install -g supabase` | same |
| `psql` | `brew install libpq` | `sudo apt-get install -y postgresql-client` |

Two traps worth knowing before you hit them:

- **Homebrew does not put `libpq` on PATH.** After installing, call
  `/opt/homebrew/opt/libpq/bin/psql` by absolute path, or run
  `brew link --force libpq`. A "command not found" here does not mean the
  install failed.
- **Do not run `supabase db dump` or `supabase start`.** Both shell out to
  Docker and fail with *"failed to run docker"* on a machine without Docker
  Desktop. Nothing here needs Docker; `psql` covers it.

### Ask the operator for a project name

Used for the Supabase project, the Vercel project and the forked repo. Ask —
do not invent one.

### What you do NOT need yet

The Anthropic API key. The build and deploy do not require it, and the
operator adds it themselves in [Step 8](#step-8--hand-over-to-the-operator).
Do not ask for it now, and do not ask them to paste it to you at any point.

---

## Step 1 — get the code

Fork or clone to the operator's own GitHub account. Do **not** push to the
repo this file came from.

```bash
gh repo fork <this-repo> --clone --fork-name <project-name>
cd <project-name>
npm install
npm run build
```

To fork into an organisation rather than the operator's personal account, add
`--org <org-name>`. Without it the fork lands under their own username.

This repo carries no history worth preserving — it is a single squashed
snapshot — so if the fork is refused (organisations often disable forking, and
GitHub answers with a misleading `403 Must have admin rights to Repository`),
a fresh repo is the same result:

```bash
git clone <this-repo> <project-name> && cd <project-name>
gh repo create <org>/<project-name> --private
git remote set-url origin https://github.com/<org>/<project-name>
git push -u origin HEAD:main
```

Either way, **make sure `origin` points at the client's repo before Step 6.**
`vercel link` connects the Vercel project to whatever `origin` is at the moment
it runs, and if that is still this template, every upstream sync would deploy
to the client's production. If it happens, `vercel git disconnect` undoes it.

`npm install` must succeed before continuing. If it fails on peer deps, report
the error rather than adding `--force`. A single high-severity `npm audit`
warning is expected and is not a blocker — do **not** "fix" it with
`npm audit fix --force`, which upgrades Next.js across a major version.

**Run `npm run build` here, before touching Supabase or Vercel.** It takes about
a minute and it is the cheapest possible check: a build failure at this point
costs you nothing, whereas the same failure discovered at Step 6 comes after a
database and two cloud projects already exist. If it fails, report the actual
error and stop — do not start creating resources around a repo that does not
compile.

---

## Step 1b — put the client's name on it

The code was written for one company, Edge8, and its name is in the code in
three layers. Do this **before** Step 6, as one commit on the client's fork
titled `chore: rebrand for <client>`, and run `npm run build` again afterwards.
Ask the operator for the **client's display name, a short slug** (lowercase,
no spaces — `acme`, `northwind-health`), **their production domain**, and
**the inbox that should receive contact-form and HR mail**.

### Layer 1 — environment variables (Step 4 sets them; listed here so you know why)

| Variable | What it is |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | the client's canonical origin, e.g. `https://www.acme.com`: links, sitemaps, emails, and the source stamped on every inquiry |
| `ADMIN_EMAILS` | the client inbox for contact-form submissions and ops alerts |
| `EMAIL_FROM` | the transactional sender, e.g. `Acme <notifications@acme.com>`; sign-in links use it |
| `MARKETING_EMAIL_FROM` | the marketing sender, e.g. `Acme <hello@acme.com>` |
| `CONTACT_EMAIL_FROM`, `CAREERS_EMAIL_FROM` | the senders of the contact-form and careers-form notifications |
| `HR_ALERT_EMAIL` | where bank-detail-change alerts go; unset, they go to the first `ADMIN_EMAILS` address |
| `NEXT_PUBLIC_ORG_NAME`, `NEXT_PUBLIC_LEGAL_ENTITY_NAME`, `NEXT_PUBLIC_SUPPORT_EMAIL` | the organisation's name, legal name and support address, used in schema.org markup, the header logo's alt text and the footer (`kernel/config/organisation.ts` lists the rest) |

None of these has a fallback in the code, on purpose: a default would be
Edge8's name or address. Unset, the value is empty. Links come out relative,
sends are rejected and the footer leaves its email line out, so nothing points
at Edge8, but nothing points at the client either. These variables stop mail
and links pointing at the wrong company. They do not stop the UI *saying*
Edge8; that is layers 2 and 3.

### Layer 2 — brand constants (edit these files)

| File | Change |
|---|---|
| `kernel/config/brand.ts` | `SELF_BRAND_SLUG = "edge8"` → the client slug. The blog, the weekly letter cron and the brand-site map all key off this, and it must equal the `slug` of the brand row you insert in Step 5 |
| `entities/org/lib/company/edges-shared.ts` | the `BRANDS` array and its label map: replace `edge8` with the client slug and name. `aio` is a second Edge8 brand; remove it unless the client runs two brands |
| `entities/company-os/lib/qbo.ts` | `QboEntity` / `DEFAULT_ENTITY` name the QuickBooks companies. Rename `edge8` to the client slug and drop `aio`; the two QBO crons and `qbo-invoice-sync.ts` import the type, so the compiler will point at every place that needs to follow |

Two more places key off the slug and are easy to miss because the compiler
does not see them: `app/admin/admin.css` styles the brand tag pill with
`.admin-edges-ltag--edge8` and `.admin-edges-ltag--aio` — rename the first to
`.admin-edges-ltag--<client-slug>` and drop the second, or the pill renders
unstyled; and the **database** carries the slug in CHECK constraints and
column defaults — that is `supabase/02-rebrand.sql`, run in Step 3.

Dropping `aio` is the widest of these changes. Beyond the files the compiler
names, the second entity is threaded through the QBO connect and callback
routes (a cookie chooses the entity), the QuickBooks settings page (two cards),
the dashboard and revenue pages (an "Edge8 / AIO" cash split), and the
invoices screen (`invoice-shared.ts`, the page, `sync-action.ts`,
`map-action.ts`, `SyncButton.tsx`). Reduce each to the single client entity.

Two things that look like text but are logic, so change them knowingly rather
than by search-and-replace: the certification sync filters staff by the
company email domain, and the team-assistant prompt
used that domain to define who counts as staff. Both need the client's real
staff domain; if the client has no domain yet, leave them and say so in the
handover.

### Layer 3 — the text itself

Around 180 source files still contain the string `edge8` (the grep below counts them). Most are the marketing site
(`entities/site/`), whose copy, case studies and images describe Edge8's
business; the rest are UI labels such as "their Edge8 manager" in the admin
CRM and the team portal, sender lines inside email templates, and comments.
Find them with:

```bash
grep -rIl -i 'edge8' entities kernel app proxy.ts --include='*.ts' --include='*.tsx' \
  | grep -v '\.test\.' | sort
```

Handle the two groups differently:

- **Admin, team portal, client portal, assistants** (`entities/company-os`,
  `entities/team`, `entities/portal`, `entities/assistant`, `kernel/`): replace
  every user-visible "Edge8" with the client's name. These are labels and
  template strings; the change is mechanical. Leave comments alone.
- **The marketing site** (`entities/site/`, `public/`): this is Edge8's public
  website, kept because it is the root route and the layer-1 dependency of
  everything else. Ask the operator which they want, and do exactly that:
  1. *Placeholder* — leave it; the client's developers replace it later.
  2. *Redirect* — add a `redirects` entry in `next.config.mjs` sending `/` to
     `/admin`, so the deployment is an internal tool with no public face.
  3. *Rewrite* — only if they hand you copy. Do not invent a client's marketing.

Run the grep again when you are done and report the count that remains, with
the reason (comments, the marketing site left as a placeholder). Do not report
the rebrand as complete while any admin or portal screen still says Edge8.

Known leftovers, so you check them rather than rediscover them. None blocks the
deployment; each needs a client value or a decision, and belongs in the
handover if left:

| Where | What |
|---|---|
| `entities/team/lib/company-docs.ts` | the overlay stubs both paths to `null`, so the handbook and insurance pages under Company say there is no document yet. They embed documents from the upstream's private library, which does not ship; showing the client's own means giving those two pages another source |
| `entities/team/lib/certification-programme.ts` | the overlay stubs this to `null`, which hides the certification blocks on the /team home and the Start-here panel; set a programme here if the client has one |
| "AIO Pad" in `entities/company-os/ui/nav.ts`, and its two entries in `entities/company-os/mounts.ts` | a page for the upstream's second brand. The page itself does not ship, so the nav entry leads to a 404: remove the entry and the two mounts |
| `NEXT_PUBLIC_LARK_WORKSPACE_URL` (`kernel/config/lark.ts`) | the coaching meeting rows and the sales-intelligence call page link to meeting recordings in a Lark workspace. Unset, no link renders; set it only if the client uses Lark |
| `DAVE_PERSON_ID` in `entities/org/lib/company/edges-shared.ts` | a hard-coded `people` row id from the upstream database, used as the default accountable person for company goals; no such row exists in a fresh one. Replace it with the client's own person or remove the default |
| `entities/retreats/` | the upstream's retreats pages, as much "marketing site" as `entities/site/`, so the same three choices apply |
| `deployments/edge8.json`, `deployments/minimal.json`, `entities.manifest.json` | they still list entities that do not ship (`htt`, `library`). `app/` is already generated for this tree, so the build is fine. Do not run `npm run gen:deployment` or `gen:app-mounts` until those entries are removed |
| `edge8_priority`, `edge8_private_ok`, `edge8_gate_*`, `semantic_search_edge8` | a column, cookies and an RPC name. Leave them; renaming desyncs the code from `01-schema.sql` |
| the certification sync | filters staff by the company email domain — logic, not text, see above |

---

## Step 2 — create the Supabase project

Use the Supabase connector (`create_project`), or the CLI:

```bash
supabase orgs list                       # pick the right organisation
supabase projects create <project-name> \
  --org-id <ORG_ID> --region <region> --db-password "$PW"
```

Region: nearest the operator. Record the **project ref** and **URL**.

### Which keys to record — read this, it will save you an hour

`supabase projects api-keys --project-ref <REF>` returns **four** keys: the
legacy `anon` and `service_role` JWTs, and the newer `sb_publishable_…` /
`sb_secret_…` pair. They are not interchangeable, and one of them is a trap.

| Use for | Take this |
|---|---|
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…`, or the legacy `anon` JWT — both work |
| `SUPABASE_SECRET_KEY` | the legacy **`service_role` JWT**, from the dashboard → Settings → API |

**Do not use the `sb_secret_…` value printed by the CLI.** It comes back
**masked** — the middle is replaced with `···` — so it is not a usable
credential. It is accepted by nothing: PostgREST returns `401 Invalid API key`
and the Auth Admin API returns the same. Because the app's service-role client
swallows read errors, the symptom is not an error message — it is an admin
dashboard where every number renders as `0`. Copy the `service_role` JWT out of
the dashboard instead.

Sanity-check the secret key before you rely on it:

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  "https://<REF>.supabase.co/rest/v1/admins?select=email" \
  -H "apikey: $SERVICE_ROLE_JWT" -H "Authorization: Bearer $SERVICE_ROLE_JWT" \
  -H "Accept-Profile: company_os"
```

`401` means the key is wrong (probably the masked one). `404`/`406` means the
key is fine but Step 3's schema exposure is not done yet. `200` is what you
want, once Step 3 is complete.

The dashboard is not the only place to get the JWT from:
`supabase projects api-keys --project-ref <REF> -o json` prints the legacy
`service_role` and `anon` JWTs **in full** (about 219 and 208 characters).
Only the `sb_secret_…` entry in that output is masked. So the CLI path works
end to end without a browser — take the entry whose `name` is `service_role`
and ignore the one starting `sb_secret_`.

**Generate the database password yourself** — do not ask the operator to invent
one:

```bash
openssl rand -base64 24
```

Use it to create the project, then **tell the operator the value once and tell
them to save it in their password manager now.** They need it for `psql` in
Step 3, and Supabase cannot show it again — a lost password means a reset.

The app expects two schemas: `company_os` (the operations tables) and `htt`
(repo/PR telemetry — optional; the app degrades gracefully without it).

### Connecting with psql

Build the connection from the pieces, rather than a `postgresql://` URL — if
the generated password contains `@`, `:` or `/` a URL string breaks with a
misleading authentication error:

```bash
export PGPASSWORD='<the password you generated>'
psql -h db.<PROJECT_REF>.supabase.co -p 5432 -U postgres -d postgres -c '\dn'
```

Use port **5432**. Port 6543 is the transaction pooler and does not support the
schema work in Step 3. Run `unset PGPASSWORD` when you are finished.

**`db.<PROJECT_REF>.supabase.co` resolves to IPv6 only** — there is no A record.
If the machine has no IPv6 egress (common on corporate networks and some VPNs)
this times out with no useful error. Check with
`host db.<PROJECT_REF>.supabase.co`, and if you cannot reach it, use the
Supavisor **session** pooler instead, which is dual-stack — dashboard →
Settings → Database → Connection pooling, session mode, port 5432. Session mode
supports the DDL in Step 3; transaction mode (6543) does not.

The pooler's shape, so you do not need the dashboard for it either: host
`aws-0-<region>.pooler.supabase.com` (some projects sit on `aws-1-…`; try
both), port `5432`, user `postgres.<PROJECT_REF>` — the project ref is part of
the **username**, not the host — same password, database `postgres`. Test
IPv6 first with `curl -6 -s -o /dev/null https://ipv6.google.com`; if that
fails, go straight to the pooler.

---

## Step 3 — database schema

Two files, **in this order**. Both contain schema only — no rows, no data.

```bash
export PGPASSWORD='<the password from Step 2>'
export PGCONNECT_TIMEOUT=20
psqlc() { psql -h "db.<PROJECT_REF>.supabase.co" -p 5432 -U postgres -d postgres "$@"; }
psqlc -v ON_ERROR_STOP=1 -f supabase/00-prereqs.sql
psqlc -v ON_ERROR_STOP=1 -f supabase/01-schema.sql
unset PGPASSWORD
```

Use a **function**, not `PSQL="psql -h …"` + `$PSQL`. That older pattern is a
bashism: zsh — the default shell on macOS since Catalina — does not word-split
unquoted parameter expansions, so `$PSQL` is treated as one long command name
and every line fails with `no such file or directory` naming a path that
plainly exists. If `psql` came from Homebrew's `libpq` and is not on `PATH`,
put the absolute path inside the function:
`psqlc() { /opt/homebrew/opt/libpq/bin/psql -h … "$@"; }`.

`ON_ERROR_STOP=1` matters: without it psql prints errors and keeps going, and
you end up with a half-applied schema that looks like it worked.

Or, with the Supabase connector, apply each file's contents as a migration —
`00-prereqs.sql` first.

The order is not cosmetic. `00-prereqs.sql` creates four things: the schemas,
the extensions (`citext` backs several columns), the three least-privilege
roles the assistants run as, and the **10 storage buckets** every upload path
depends on — resumes, avatars, gallery, marketing images, onboarding plans, ID
documents. `01-schema.sql` is a `pg_dump` of `company_os` + `htt`, and its
`GRANT` statements reference those roles by name — run it first and it errors
on every grant.

Apply each **once**. Both are idempotent where Postgres allows it
(`if not exists`), but there is no `if not exists` for policies or
constraints, so a second run of `01-schema.sql` reports errors on those.

### Then put the client slug into the schema's brand values

`01-schema.sql` is a dump of the upstream database, and the upstream brand slug
is in it as **data**: `objectives.brand`, `service_lines.business_unit`,
`invoices.entity` and `client_backlog_items.source` each carry a CHECK
constraint allowing only `'edge8'` (two of them also `'aio'`), and three
columns default to `'edge8'`. The code you rebranded in Step 1b writes the
client slug, so until these change the database rejects the first objective,
service line, backlog item or invoice anyone creates:

```
new row for relation "objectives" violates check constraint "objectives_brand_check"
```

Nothing before that point notices — the app builds, deploys and signs in. Run
the third file now, before any
rows exist, with the same slug you put in `kernel/config/brand.ts`:

```bash
export PGPASSWORD='<the password from Step 2>'
psqlc -v ON_ERROR_STOP=1 -v slug='<client-slug>' -f supabase/02-rebrand.sql
unset PGPASSWORD
```

It refuses to run without `-v slug=…`, is safe to re-run, and prints the four
constraints at the end — every one must name the client slug and none may
name `edge8`.

> **If `supabase/01-schema.sql` is missing from this repo**, stop and tell the
> operator. Do **not** fall back to `supabase/migrations/` — that directory is
> incomplete (about two thirds of the tables, a handful of the policies) and
> produces a database the app cannot run against. Do **not** try to reconstruct
> the schema from `information_schema` queries or by reading the application
> code: custom types, some three hundred policies, foreign keys, grants and three purpose-built Postgres
> roles will not survive that, and a subtly-wrong schema fails at runtime in
> ways that are very hard to diagnose.

### Then expose `company_os` and `htt` to PostgREST — do not skip this

**This is the step most first installs miss, and it is invisible to every check
below it that uses psql.**

A new Supabase project exposes only `public` and `graphql_public` over its REST
API. The entire application reads through `supabase.schema("company_os")` and
`supabase.schema("htt")`, which go over PostgREST. Until both schemas are
exposed, every query in the app fails with:

```
PGRST106  Invalid schema: company_os
```

The app still builds, still deploys, still signs you in, and renders as a
hollow shell — zeroed KPIs, empty CRM, empty ATS. Nothing logs an error the
operator will see, because the service-role client catches read failures.

Either edit it in the dashboard — **Settings → API → Exposed schemas** → add
`company_os` and `htt` — or push the config that ships with this repo:

```bash
# edit supabase/config.toml first: set project_id and the site URL
supabase config push --project-ref <PROJECT_REF> --yes
```

`--yes` matters from a script: without it the command asks "push api config to
remote? [Y/n]" per section and a non-interactive shell never answers. The
file also carries the Step 6 Auth URLs, so one push does both jobs — set the
site URL to the Vercel hostname you expect (`https://<project-name>.vercel.app`)
and correct it after Step 6 if Vercel assigned a different one.

Read the warning at the top of `supabase/config.toml` before pushing: the
command rewrites every setting it manages, so on a project you have already
customised, check the diff it prints rather than accepting it blindly.

### Verify before moving on

Two checks. **Both are required** — the first cannot detect a missing schema
exposure and the second cannot detect a half-applied schema.

**1. Structure**, over `psql`:

```sql
select
  (select count(*) from information_schema.tables
     where table_schema='company_os' and table_type='BASE TABLE') as tables,
  (select count(*) from information_schema.tables
     where table_schema='htt' and table_type='BASE TABLE')        as htt_tables,
  (select count(*) from pg_policies where schemaname='company_os') as policies,
  (select count(*) from pg_indexes  where schemaname='company_os') as indexes,
  (select count(*) from pg_roles
     where rolname in ('chatbot_reader','team_chatbot_reader','chatbot_writer')) as roles,
  (select count(*) from storage.buckets)                           as buckets;
```

The expected `tables`, `htt_tables` and `policies` come from the dump itself,
so they are right for whatever snapshot you are holding:

```bash
grep -cE '^CREATE TABLE (IF NOT EXISTS )?"?company_os"?\.' supabase/01-schema.sql   # tables
grep -cE '^CREATE TABLE (IF NOT EXISTS )?"?htt"?\.' supabase/01-schema.sql          # htt_tables
grep -c  '^CREATE POLICY' supabase/01-schema.sql                                   # policies (all on company_os)
```

The database must report **exactly those three numbers**, plus **3 roles and
10 buckets**, and several hundred indexes. Fewer of anything means the schema
did not apply cleanly — stop and report, do not continue.

Buckets should be 4 public and 6 private:

```sql
select id, public from storage.buckets order by public desc, id;
```

Public: `avatars`, `event-media`, `gallery`, `marketing`. Private:
`id-documents`, `meeting-transcripts`, `onboarding-plans`, `passports`,
`program-documents`, `resumes`. If any of the six private buckets comes back
`public = true`, stop — that exposes identity documents and candidate resumes
to anyone holding a path.

**2. Reachability**, over the REST API — this is the check that catches the
exposure problem:

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  "https://<REF>.supabase.co/rest/v1/admins?select=email" \
  -H "apikey: $SERVICE_ROLE_JWT" -H "Authorization: Bearer $SERVICE_ROLE_JWT" \
  -H "Accept-Profile: company_os"
```

**Must return `200`.** `401` means the wrong secret key (see Step 2 — probably
the masked `sb_secret_` value). `404` or `406` with `PGRST106` means the schemas
are still not exposed. Do not continue on anything but `200`: everything after
this point will appear to work and produce an app with no data in it.

---

## Step 4 — environment variables

Set these on the Vercel project, for **all three environments** — Production,
Preview and Development. Names must match exactly; the app reads them directly
and there is no fallback for a misspelling.

```bash
vercel env add NAME production --value "…" --no-sensitive --yes
```

**Do not pipe the value in on stdin.** `echo "…" | vercel env add NAME production`
prints `✓ Added` and stores an **empty string**. Use `--value`. Then confirm
with `vercel env pull .env.check` and look at the file before you deploy — a
variable that is set to `""` behaves exactly like one that was never set, and
in this app that is not a harmless difference (see the note under
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`).

**But do close stdin.** From a non-interactive shell the command blocks on
stdin indefinitely, even with `--value` and `--yes`, and never gets to
`✓ Added`. The working form is:

```bash
vercel env add NAME production --value "…" --no-sensitive --yes </dev/null
```

Two things to know when reading the pulled file: variables added with
`--sensitive` (the secret key and `CRON_SECRET`) pull back as a short
redacted placeholder, not their value, so a length check cannot tell them
apart from a wrong value — the REST `200` in Step 3 and the signed-in
dashboard in Step 7 are what prove the secret key; and a name that already
exists in an environment makes `vercel env add` exit non-zero, which is
harmless on a retry.

### Required

| Variable | Where it comes from |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → `sb_publishable_…`, or the legacy `anon` JWT |
| `SUPABASE_SECRET_KEY` | Supabase → the legacy **`service_role` JWT** (see Step 2 — *not* the masked `sb_secret_` value). **Server-only.** Never prefix with `NEXT_PUBLIC_` |
| `SUPABASE_URL` | same value as `NEXT_PUBLIC_SUPABASE_URL` |
| `NEXT_PUBLIC_SITE_URL` | the production URL, e.g. `https://<project>.vercel.app` |
| `ADMIN_EMAILS` | the operator's own address — comma-separated for several |
| `CRON_SECRET` | generate: `openssl rand -hex 32` |
| `EMAIL_FROM` | the client's transactional sender, e.g. `Acme <notifications@acme.com>`, on a domain verified in Resend. Every app email uses it, magic sign-in links included |
| `MARKETING_EMAIL_FROM` | the client's marketing sender, e.g. `Acme <hello@acme.com>` |
| `ANTHROPIC_API_KEY` | **the operator pastes this themselves — see [Step 8](#step-8--hand-over-to-the-operator)** |

`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is the one to get right. It is read by
`proxy.ts`, `kernel/data/supabase/server.ts`, `kernel/data/supabase/browser.ts` and
`app/api/auth/callback/route.ts` — the entire authentication path. If it is
missing or empty, `proxy.ts` **fails open** (`if (!url || !key) return
NextResponse.next()`), the edge auth gate silently switches itself off, and
`/admin` returns a 500 whose response body can contain partially-rendered
dashboard markup. Sign-in is also impossible, because the browser client cannot
be constructed. There is a legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` read by one
gallery component; set it to the same value if you want that component working,
but it is **not** a substitute for the publishable key.

`NEXT_PUBLIC_SITE_URL`, `ADMIN_EMAILS` and the two senders are required for
any fork, not optional. None of them has a fallback in the code. Unset, the
value is empty: canonical links and sitemaps come out relative, contact-form
submissions have no inbox to go to, and every send is rejected for want of a
sender, sign-in links included. Nothing goes to Edge8, but nothing reaches the
client either, and nothing on screen says why.

`STRIPE_SECRET_KEY` is on the list `app/env.ts` checks at boot, so a deployment
without it logs `[boot] required environment not set: STRIPE_SECRET_KEY` on
every cold start. That line is a report, not a failure: if the client takes no
payments, leave the key unset and say so in the handover.

`CRON_SECRET` is **not** optional. Every cron route refuses to run without it
(they fail closed by design). Leave it unset and the scheduled jobs 401.

### Required only if you want the database assistants

The admin and team assistants connect to Postgres **as** the least-privilege
roles created in `00-prereqs.sql`. Those roles ship `NOLOGIN`, so this is an
opt-in: without these three variables the assistants answer every question with
*"Database access is not configured"*, even with a valid Anthropic key.

| Variable | Enables |
|---|---|
| `CHATBOT_DB_URL` | admin assistant reads, as `chatbot_reader` |
| `TEAM_CHATBOT_DB_URL` | team assistant reads, as `team_chatbot_reader` |
| `CHATBOT_WRITE_DB_URL` | approval-gated writes, as `chatbot_writer` |

All three are Supavisor **transaction** pooler URLs (port 6543). The bottom of
`supabase/00-prereqs.sql` has the `alter role … login password …` statements and
the exact URL format. Leave `CHATBOT_WRITE_DB_URL` unset and writes stay
impossible regardless of `CHATBOT_PRIVILEGED_EMAILS`.

### Optional — each gates one feature, absence is handled

| Variable | Enables |
|---|---|
| `RESEND_API_KEY` | transactional email; without it, sends are skipped and logged |
| `CONTACT_EMAIL_FROM`, `CAREERS_EMAIL_FROM` | the senders of the contact-form and careers-form notifications; unset, those two notifications are not sent |
| `HR_ALERT_EMAIL` | where bank-detail-change alerts go; unset, the first `ADMIN_EMAILS` address |
| `UNSUBSCRIBE_SECRET` | signs the unsubscribe link in marketing email (`openssl rand -hex 32`). The weekly letter refuses to send without it |
| `NEXT_PUBLIC_ORG_NAME`, `NEXT_PUBLIC_LEGAL_ENTITY_NAME`, `NEXT_PUBLIC_SUPPORT_EMAIL` and the rest of `kernel/config/organisation.ts` | the organisation's identity in schema.org markup, the logo's alt text and the footer. `NEXT_PUBLIC_*` values are inlined at build time, so a change needs a redeploy |
| `VERCEL_ANALYTICS_TOKEN`, `VERCEL_ANALYTICS_TEAM_ID`, `VERCEL_ANALYTICS_PROJECT_ID` | the admin Analytics page and the traffic line in the weekly pulse, read from the client's own Vercel project |
| `NEXT_PUBLIC_LARK_WORKSPACE_URL` | links from meeting rows to Lark Minutes recordings, only if the client uses Lark |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | checkout. The webhook returns 503 without the secret, deliberately |
| `IMAGE_MODEL`, `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) | marketing image generation |
| `ADMIN_ALLOWLIST` | bootstrap only: comma-separated emails that hold Admin and Super Admin while no Admin grant exists, so the first person in can grant the first roles in Settings → Access. Empty it once they have |
| `CHATBOT_PRIVILEGED_EMAILS` | comma-separated emails allowed database *writes* via the admin assistant. Empty means nobody |

Model selection, all optional, all with sane defaults (see `kernel/ai/models.ts`):
`CHATBOT_MODEL`, `WRITER_CLAUDE_MODEL`, `IDEAS_CLAUDE_MODEL`,
`MEETINGS_CLAUDE_MODEL`, `REVIEW_CLAUDE_MODEL`, `COACHING_CLAUDE_MODEL`,
`ROADMAP_ASSIST_MODEL`, `INTERVIEW_CLAUDE_MODEL`. Any single call site can also be
pinned with `AI_MODEL_<SITE>`, where `<SITE>` is the `site=` value from its
`[ai-usage]` log line upper-cased (e.g. `AI_MODEL_INTERVIEW_PANELIST`).

Anthropic client: `ANTHROPIC_TIMEOUT_MS` (default 120000). Every model call goes
through the gateway in `kernel/ai/gateway.ts`, which sends Claude models to
api.anthropic.com only. A non-Claude model set by one of the overrides above goes
through OpenRouter (`OPENROUTER_API_KEY`), and only for a call site whose declared
data class allows it; a sensitive (class S) site refuses anything but Claude, and
`npm run check:ai-routing` fails on the same configuration. `AI_PROVIDER` is no
longer read.

---

## Step 5 — first admin user

Admin access is two independent gates, both server-side:

1. A Supabase Auth user must exist and be signed in.
2. That email must be in the `company_os.admins` table **or** in
   `ADMIN_ALLOWLIST`.

Create the auth user — Supabase dashboard → Authentication → Add user, the
connector, or the Auth Admin API:

```bash
curl -s -X POST "https://<REF>.supabase.co/auth/v1/admin/users" \
  -H "apikey: $SERVICE_ROLE_JWT" \
  -H "Authorization: Bearer $SERVICE_ROLE_JWT" \
  -H "Content-Type: application/json" \
  -d '{"email":"<operator-email>","password":"<generated>","email_confirm":true}'
```

This endpoint accepts **only the legacy `service_role` JWT** — the
`sb_secret_…` value returns `401 Invalid API key`, same as in Step 2. Generate
the password with `openssl rand -base64 18`, tell the operator once, and tell
them to change it after their first sign-in.

Then:

```sql
insert into company_os.admins (email, display_name, can_view_sensitive)
values ('<operator-email>', '<Name>', true);
```

`can_view_sensitive` controls compensation and PII visibility. Grant it only
to whoever should genuinely see wages.

Then the **brand row**. The database ships with no rows at all, and the blog,
the marketing calendar and the weekly-letter cron look up the brand whose
`slug` equals `SELF_BRAND_SLUG` in `kernel/config/brand.ts` (Step 1b). Without
it the blog index is empty and `/api/cron/letter-weekly` returns
`Brand <slug> not found`:

```sql
insert into company_os.brands (slug, name, primary_domain)
values ('<client-slug>', '<Client Name>', '<client-domain>')
returning id;

insert into company_os.brand_profiles (brand_id, positioning, audience)
select id, '<one line on what the client does>', '<who they sell to>'
from company_os.brands where slug = '<client-slug>';
```

The second statement selects the id rather than pasting it so a script does
not have to capture `returning id` from psql output — with `-At` that capture
also picks up the trailing `INSERT 0 1` line, and the uuid cast then fails.
If the client has no domain yet, use the Vercel hostname as `primary_domain`
and change it when they buy one.

The slug **must** match the constant exactly; a mismatch is not an error
anywhere, just an empty blog.

---

## Step 6 — deploy

```bash
vercel link --scope <team> --project <project-name> --yes
vercel --prod
```

`vercel link` without `--scope` targets the account's default team, which is
often not the one you want — pass it explicitly. Linking against a repo that has
a GitHub remote also connects the project to it, so pushes to the default branch
build automatically from then on. **That is why `origin` must already point at
the client's repo (Step 1):** the CLI connects whatever `origin` is, silently,
and connecting this template means every upstream sync would deploy to the
client's production. Check with `vercel project inspect <project-name>` and, if
it names the wrong repo, run `vercel git disconnect` and then `vercel git
connect` once `origin` is right.

The operator's machine may also have its own policy in front of production
deploys — a shell hook or an org rule that refuses `vercel --prod` because
going live is a human's call. Do not look for a way around it. Hand the
command back with the reason, or push to the fork's `main` and let the git
integration build production. And remember that on a brand-new project a plain
`vercel deploy` **is** the production deployment, so it is not a way around
such a rule either; a preview deploy only becomes a preview once production
exists.

Two things that surprise people:

- **The first deployment of a new project is promoted to production by Vercel
  automatically**, whatever command you ran. A plain `vercel deploy` on a fresh
  project is not a dry run.
- **Many organisations gate production CLI deploys.** If `vercel --prod` is
  blocked by policy, do not fight it: push to the fork's default branch and let
  the git integration build production. That is the better habit anyway, since
  it keeps what is serving identical to what is on the branch.

Or use the Vercel connector against the forked repo. Notes that matter:

- **Node.js runtime, not Edge.** Several routes need full Node APIs.
- `maxDuration = 300` on the streaming assistant routes. On Hobby the ceiling
  is lower and long agent turns will be cut off.
- Cron schedules live in `vercel.json` (`jq '.crons | length' vercel.json`
  counts them). Vercel registers them on deploy; Hobby plans are limited to
  daily crons, so the hourly, every-15-minute and every-5-minute jobs need Pro.
- Put together, this repo needs a **Pro** team in three places, and none of
  them fails the build — they all fail quietly at runtime: the crons that run
  more often than daily, the routes declaring `maxDuration = 300`
  (`grep -rl 'maxDuration = 300' app` lists them; both assistant streams and
  the marketing publish editor are among them), and
  licensing, since Hobby is non-commercial and this is a client deployment.
  Check the team's plan in Step 0 if the client is bringing their own.

### Then point Supabase Auth at the deployed domain

**Do not skip this.** Sign-in works without it, but password reset and the
email one-time-link flows fail with *"requested path is invalid"*, and that
looks like a broken app rather than a missing setting.

The login forms call `resetPasswordForEmail` and `signInWithOtp` with
`redirectTo: ${window.location.origin}/api/auth/callback`, and Supabase only
honours redirect targets on its allow-list.

In the Supabase project → **Authentication → URL Configuration**:

- **Site URL** — the production Vercel URL, e.g. `https://<project>.vercel.app`
- **Redirect URLs** — add both:
  - `https://<project>.vercel.app/api/auth/callback`
  - `https://<project>.vercel.app/**`

Or set both in `supabase/config.toml` and run
`supabase config push --project-ref <PROJECT_REF>` — read the warning at the top
of that file first.

Add the custom domain too if the operator sets one up later. Preview
deployments get their own hostnames, so add `https://*-<team>.vercel.app/**` if
they want auth working on previews.

A note on testing this: `POST /auth/v1/recover` returns **200 whether or not the
redirect target is allow-listed** — GoTrue silently ignores a target that is not
on the list and falls back to Site URL. So you cannot verify the setting by
watching that call succeed. Check the configuration itself, or click through a
real reset link.

**Report the production URL to the operator when this completes.** That is the
deliverable.

---

## Step 7 — verify the deployment

Do not report success on a green build alone. Check:

1. `GET /` returns 200.
2. `/admin` signed out returns **exactly a 3xx to `/admin/login`** — and
   nothing else. Check the status code *and* the response body:

   ```bash
   curl -s -o /tmp/a.html -w '%{http_code}\n' https://<project>.vercel.app/admin/
   grep -c 'mp-kpi-val\|admin-office-panel' /tmp/a.html   # must be 0
   ```

   A 200 with dashboard markup is the obvious failure. **A 500 is also a
   failure, and a more likely one.** `proxy.ts` fails open when
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is missing or empty — it passes the
   request straight through — and the admin layout then throws instead of
   redirecting. The 500 page that results has been observed carrying **partially
   rendered dashboard RSC payload**, including KPI labels and revenue links, to
   an unauthenticated client. On an empty database those values are zeros; on a
   real one they are not.

   So: do not accept anything but a 3xx, and do not judge by what the browser
   paints — a 500 renders as an error page while still shipping the markup in
   the response body. If you see a 500 here, check that variable's **name and
   value** first (Step 4).
3. Sign in as the admin user; `/admin` renders, and the panels show real
   sections rather than an empty shell. If everything reads `0`, the schemas are
   not exposed or the secret key is wrong — go back to Steps 2 and 3.
4. Ask the admin assistant a read-only question ("how many people are in the
   people table?"). This needs **both** an Anthropic key and `CHATBOT_DB_URL`
   (Step 4). Two distinct failures to tell apart:
   - `503 The assistant is not configured (missing API key)` → no
     `ANTHROPIC_API_KEY`. Expected until Step 8 is done.
   - a reply saying *"Database access is not configured"* → `CHATBOT_DB_URL` is
     unset, or the `chatbot_reader` role still has no login. See the bottom of
     `supabase/00-prereqs.sql`.

   The 503 masks the second problem, so re-test this after the operator adds
   their key.
5. Check the Vercel runtime logs for `[ai-usage]` lines — that confirms the
   Claude calls are landing and shows token cost per feature.

If 2 fails, treat it as a security problem, not a config annoyance.

---

## Step 8 — hand over to the operator

Two things to do, in this order.

### 1. Give them the URL

Report the production Vercel URL. That is the deliverable they asked for.

### 2. Tell them to add their own Anthropic API key

**You cannot do this for them and should not ask them to paste the key to
you.** An API key is a credential — it belongs in Vercel's encrypted
environment settings, entered by its owner, and nowhere else. Not in chat, not
in a file, not in a commit.

Give them these instructions verbatim:

> Your site is live, but the AI features are switched off until you add your
> own Anthropic API key.
>
> 1. Go to <https://console.anthropic.com> → **API Keys** → **Create Key**.
>    Copy it — it is shown once.
> 2. Open your Vercel project → **Settings** → **Environment Variables**.
> 3. Add:
>    - **Name:** `ANTHROPIC_API_KEY`
>    - **Value:** your key
>    - **Environments:** Production, Preview, Development
> 4. Click **Save**, then go to **Deployments** and **Redeploy** the latest
>    production deployment. Environment variables are read at build and boot,
>    so an existing deployment will not pick the key up on its own.
>
> Until that redeploy finishes, these return errors: the admin and team
> assistants, the client-portal plan assistant, resume screening, meeting and
> review summaries, coaching prep and summaries, and the marketing writers.
> Everything else — the public site, admin, portals, CRM, ATS — works without
> it.
>
> Billing note: the key is charged to your own Anthropic account. Watch the
> `[ai-usage]` lines in your Vercel runtime logs to see token cost per feature.

Then confirm with them that the AI features respond after the redeploy. If
they do not, check the variable name is exactly `ANTHROPIC_API_KEY` and that
the redeploy actually completed.

---

## What you get

| Area | Routes |
|---|---|
| Public site | marketing pages, blog, case studies, careers, checkout |
| Admin | `/admin` — CRM, ATS, boards, revenue, marketing, operations, coaching |
| Team portal | `/team` — profile, time off, equipment, coaching, assistant |
| Client portal | `/portal` — roadmap, backlog, documents, plan assistant |
| Assistants | admin + team chat (tool-use over the database), program-plan, roadmap-assist, publish-editor |

### How the assistants are kept safe

Worth understanding before you extend them: the read-only guarantee is enforced
by **Postgres**, not by prompt instructions. Purpose-built roles
(`chatbot_reader`, `team_chatbot_reader`) hold `SELECT`-only grants with
column-level restrictions and a 5-second statement timeout. The application
layer adds single-statement parsing, a `^(select|with)` check, and blocked-table
patterns on top. Writes require an email in `CHATBOT_PRIVILEGED_EMAILS` **and**
an explicit human approval click.

If you add a tool, keep that shape: the database is the boundary, the prompt is
not.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| `/admin` renders while signed out | auth misconfigured — investigate, do not work around |
| `/admin` returns 500 signed out | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` missing or empty. The middleware fails open and the layout then throws. Treat as a security problem — the 500 body can carry dashboard markup |
| Sign-in page throws in the browser | same variable. `createBrowserClient` cannot be constructed without it |
| Everything renders but every number is `0`, CRM and ATS empty | either `company_os`/`htt` are not exposed to PostgREST (Step 3), or `SUPABASE_SECRET_KEY` holds the masked `sb_secret_` value (Step 2). Check with the REST curl in Step 3 — `PGRST106` means the first, `401` means the second |
| `PGRST106 Invalid schema: company_os` | the schemas are not on the PostgREST exposed list — Step 3 |
| `401 Invalid API key` from REST or the Auth Admin API | the masked `sb_secret_` value. Use the legacy `service_role` JWT |
| Contact-form submissions save but nobody is told | `ADMIN_EMAILS` or `CONTACT_EMAIL_FROM` unset; there is no fallback inbox or sender |
| Links in emails and the sitemap are relative or missing their host | `NEXT_PUBLIC_SITE_URL` unset |
| Magic sign-in links never arrive | `EMAIL_FROM` unset, or its domain is not verified in Resend; the send is rejected |
| `no such file or directory: psql -h db.…` | the `PSQL="…"` / `$PSQL` pattern under zsh. Use a shell function — Step 3 |
| `vercel env add` reported success but the value is empty | it was piped on stdin. Use `--value` and verify with `vercel env pull` |
| Assistant returns 503 | `ANTHROPIC_API_KEY` missing |
| Assistant says "Database access is not configured" | `CHATBOT_DB_URL` unset, or `chatbot_reader` still has no login — see the bottom of `supabase/00-prereqs.sql` |
| Assistant returns a permission error on every query | schema applied without the `chatbot_reader` role and its grants |
| Cron routes return 401 | `CRON_SECRET` unset. They fail closed on purpose |
| Emails silently do nothing | `RESEND_API_KEY` unset; sends are skipped and logged |
| Checkout 503 on webhook | `STRIPE_WEBHOOK_SECRET` unset; verification fails closed |
| Truncated JSON / parse errors from AI features | a `max_tokens` cap was hit. `kernel/ai/response.ts` names this explicitly in the stored error |
| Table-not-found at runtime | the schema did not fully apply — re-check the Step 3 counts |

---

## Provenance and limits

This repo is a **filtered snapshot**, not a mirror. It is generated from a
private application repo by an allowlist sync that removes client-confidential
and personal material, re-scans the result, and squashes to a single commit.
It carries no upstream history and no branches.

Consequences:

- **It is not a backup** and cannot restore the upstream repo.
- Pull requests here are overwritten by the next sync. Open an issue instead.
- Some migrations are intentionally absent because they carried production
  data. This is part of why Step 3 needs a dump.
- Edge8's own content is absent on purpose: blog source, video project,
  operating manuals, design-system inventories, team values and one-off
  ingestion scripts. What remains is the application. The marketing site
  (`entities/site/`) stays because it is the root route — Step 1b says what to
  do with it.

## License

The code is provided as-is, with no warranty and no support commitment. This
snapshot ships no `LICENSE` file; ask Edge8 if you need the terms in writing
before building on it.
