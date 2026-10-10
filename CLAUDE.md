# Operating instructions for this repo

You are setting up a Next.js + Supabase + Vercel operations platform for the
person who just handed you this repo. **`README.md` is the runbook — follow it
top to bottom.** This file is the contract for *how* to work through it.

## Your job

Take the operator from a bare repo to a working production URL, then hand them
the URL. They should not need to research anything, install anything, or read
the code. Assume they know what they want but not how any of this fits
together.

## Install anything that is missing. Do not ask permission first.

If a tool the runbook needs is absent, install it and carry on. Report what you
installed at the end, not as a question up front.

| Missing | macOS | Linux |
|---|---|---|
| Node 24 (`.nvmrc`) | `brew install node@24` | `curl -fsSL https://deb.nodesource.com/setup_24.x \| sudo -E bash - && sudo apt-get install -y nodejs` |
| `gh` | `brew install gh` | `sudo apt-get install -y gh` |
| `vercel` | `npm install -g vercel` | same |
| `supabase` | `npm install -g supabase` | same |
| `psql` / `pg_dump` | `brew install libpq` then use `/opt/homebrew/opt/libpq/bin/psql` | `sudo apt-get install -y postgresql-client` |

Notes that will save you time:

- **`psql` from `libpq` is not symlinked into PATH by Homebrew.** Call it by
  absolute path, or `brew link --force libpq`. Do not conclude it failed to
  install.
- **Do not use `supabase db dump` or `supabase start`.** Both shell out to
  Docker and fail with *"failed to run docker"* on a machine without Docker
  Desktop. Nothing in this runbook needs Docker — use `psql` directly.
- If `npm install` fails on peer dependencies, report the actual error. Do not
  add `--force` or `--legacy-peer-deps` to make it pass.

## Ask the operator for these

Ask in plain language and explain what each is for. Never proceed with a
placeholder.

**Ask the blocking ones together, at the very start.** These stop all progress,
need a human at a keyboard, and cost the operator a context switch each time
they are discovered separately:

- **`supabase login` and `vercel login`** if either CLI is not already
  authenticated. Both open a browser; you cannot do them. Check with
  `supabase projects list` and `vercel whoami` before anything else.
- **The Vercel scope**, if the account can reach more than one team
  (`vercel teams ls`). Getting this wrong means deploying into the wrong
  organisation.
- **GitHub org membership**, if the repo is to live in the client's
  organisation. `gh api user/orgs` must list it; seeing one of its repos as an
  outside collaborator is not membership, and neither forking nor creating a
  repo works without it. Ask the operator to add the account or to create the
  empty repo, and do everything else while you wait — the database, the env
  vars and the rebrand do not depend on it.
- **Confirmation to create a Supabase project and a Vercel project on their
  accounts**, since both can cost money. Tell them the names you intend to use.
- **A project name** (Step 1). Used for the Supabase project, the Vercel
  project and the forked repo. Do not invent one.
- **The client's display name, slug, production domain and contact inbox**
  (Step 1b). The code says "Edge8" in three layers and the rebrand is part of
  the job, not a follow-up. Ask at the same time whether the marketing site
  should stay as a placeholder or redirect to `/admin`.

Ask the rest one at a time, at the point you need them.

1. **Which optional integrations they want** (Step 4). Email, payments, and
   image generation each need a key. Ask once, accept "none", and skip the
   corresponding variables — the app is built to run without them.
2. **Their admin email address** (Step 5). This becomes the first admin
   account. It must be an address they can receive mail at.
3. **Their Anthropic API key** — but see the rule below. You do **not** collect
   this one.

## Credential rules — these are not negotiable

- **Never ask the operator to paste an API key, token, or password into the
  chat.** Secrets belong in Vercel's encrypted environment settings or in a
  gitignored `.env.local`, entered by their owner.
- **The Anthropic API key is theirs to enter.** Step 8 gives them
  click-by-click instructions for adding it in the Vercel dashboard and
  redeploying. Follow that step as written. Do not offer to do it for them,
  and do not ask them to send you the key so you can set it.
- **Generate the Supabase database password yourself** (`openssl rand -base64
  24`), use it, and then tell them the value once and instruct them to save it
  in their password manager. They will need it for `psql` later and there is no
  way to recover it.
- **Generate `CRON_SECRET` yourself** (`openssl rand -hex 32`). It is not a
  credential they need to know.
- Never commit any of these. `.env.local` is gitignored — keep it that way.

## The rebrand is part of setup

Step 1b is not optional. Set the sender and origin variables, change the brand
constants in Step 1b layer 2, replace every user-visible "Edge8" in the admin, team and
client portals, and re-run `npm run build`. Do not invent marketing copy for
the client's public site; leave it or redirect it, as the operator chooses.
Report the remaining `grep -ri edge8` count and why it remains.

## Hard rules about the database

- Apply `supabase/00-prereqs.sql` **then** `supabase/01-schema.sql`, **then**
  `supabase/02-rebrand.sql` with `-v slug=<client-slug>`. That order is
  load-bearing; the README explains why. The third file exists because the
  schema dump carries the upstream brand slug in CHECK constraints and column
  defaults, and a rebranded app cannot write an objective, service line,
  backlog item or invoice until they name the client's slug. Skipping it
  produces an app that passes every check in Step 7 and fails on the first
  real record.
- **Applying both files is not enough.** A new Supabase project exposes only
  `public` and `graphql_public` to PostgREST, and every read in this app goes
  through PostgREST as `company_os` or `htt`. Until both schemas are added to
  the exposed list, the app builds, deploys, signs you in, and shows nothing —
  every query fails with `PGRST106`. Step 3 covers it; `supabase/config.toml`
  has it ready to push.
- **Verify over the REST API, not just psql.** The Step 3 table/policy/index
  counts pass against a database the app cannot read a single row from, because
  psql does not go through PostgREST. A `200` from
  `/rest/v1/admins?select=email` with `Accept-Profile: company_os` is the check
  that actually means something.
- **Never use `supabase/migrations/` to build the database.** There is no such
  directory in this repo — it is excluded from the sync on purpose. If you meet
  one in a variant, it is incomplete (about two thirds of the tables, a handful of the policies) and
  exists for history, not setup. An agent that runs the migrations and reports
  success has not set this up.
- **Never reconstruct missing schema** from `information_schema` queries or by
  reading the application code. Custom types, some three hundred policies, foreign keys,
  grants and three purpose-built Postgres roles do not survive that, and the
  result fails at runtime in ways that are very hard to trace.
- If `supabase/01-schema.sql` is absent from this repo, **stop and say so.** Do
  not improvise a substitute.

## When you are done

1. Give them the production URL. That is the deliverable.
2. Walk them through Step 8 — adding their Anthropic key and redeploying.
3. List what you installed, what you created (Supabase project, Vercel
   project, forked repo), and the database password they must save.
4. Say plainly what is **not** working and why — any optional integration they
   declined, and the AI features until their key is in.

Do not report success on a green build alone. Step 7 has the checks that
matter. In particular:

- **`/admin` signed out must return a 3xx to `/admin/login` — nothing else.** A
  200 with dashboard markup is the obvious failure. A **500 is also a failure**,
  and the likelier one: `proxy.ts` fails open when
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is missing, and the 500 body has been
  observed carrying partially-rendered dashboard markup to an unauthenticated
  client. Check the response body, not what the browser paints. Treat either as
  a security problem and stop rather than working around it.
- **Confirm the app can read its own database**, not just that it deployed. If
  `/admin` renders but every number is `0` and the CRM is empty, it is not
  working — go back to Step 3's REST check and Step 2's key check.

## Env var names are exact, and two of them are easy to get wrong

The app reads `process.env.X` directly. There is no fallback for a misspelling
and no warning when one is absent.

- The browser/auth key is **`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`**, not
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`. It is read by `proxy.ts`,
  `kernel/data/supabase/server.ts`, `kernel/data/supabase/browser.ts` and the auth callback —
  the whole authentication path. `NEXT_PUBLIC_SUPABASE_ANON_KEY` is read by one
  gallery component and nothing else.
- **`SUPABASE_SECRET_KEY` takes the legacy `service_role` JWT.** The
  `sb_secret_…` value that `supabase projects api-keys` prints comes back
  **masked** and is rejected everywhere with `401 Invalid API key`. Because
  service-role read errors are swallowed, the symptom is an admin dashboard
  full of zeros rather than an error.
- `NEXT_PUBLIC_SITE_URL`, `ADMIN_EMAILS`, `EMAIL_FROM` and
  `MARKETING_EMAIL_FROM` are **required for any fork**, not optional. None has a
  fallback: unset, links come out relative, contact-form submissions reach no
  inbox and every send, sign-in links included, is rejected for want of a sender.

Set every variable for **Production, Preview and Development**, and never pipe
a value into `vercel env add` on stdin — it stores an empty string and reports
success. Use `--value`, then `vercel env pull` and read the file.

Append `</dev/null` to every `vercel` command you run from a script. Without a
terminal the CLI blocks on stdin even with `--yes` and `--value`, and a loop of
env adds looks like it is working while nothing lands. Bound every wait: run
one command, check its exit code and output, then the next.

## Do not route around the operator's production gate

`vercel link` connects the Vercel project to whatever git `origin` is when it
runs — set `origin` to the client's repo first, and `vercel git disconnect` if
it connected this template. If a hook or policy on the operator's machine
refuses `vercel --prod`, that is their production gate: hand the command back
with the reason, or push to the fork's `main` and let the git integration
build. A plain `vercel deploy` on a new project is the production deployment
too, so it is not an alternative.
