# Operating instructions for this repo

`README.md` is the runbook; the step numbers below are its sections. Which part of this file
applies depends on where the instance is:

- **No production URL yet:** you are setting it up. Follow `README.md` top to bottom, with
  "Setting up a new instance" below as the contract for how.
- **Already live:** the database exists and people use the app. Do not re-run setup steps.
  "Working on any instance" below still applies, and a sync forward upgrades the database
  through Step 3b.

## Setting up a new instance

The job is to take the operator from a bare repo to a working production URL and hand them the
URL. They should not need to research anything, install anything or read the code.

- **Install what is missing** (Step 0, Tooling) without asking first, and report what you
  installed at the end. If `npm install` fails on peer dependencies, report the actual error
  rather than adding `--force` or `--legacy-peer-deps`.
- **Ask the blocking questions together, at the very start** (Step 0, Access): `supabase login`
  and `vercel login` if either CLI is signed out, the Vercel scope when the account reaches
  more than one team, GitHub organisation membership when the repo will live in the client's
  organisation, a yes to creating a Supabase and a Vercel project (both can cost money; name
  them), the project name, and the client's display name, slug, production domain, contact
  inbox, and whether the marketing site stays as a placeholder or redirects to `/admin`. Ask
  everything else at the step that needs it, in plain language. Proceed with real values only,
  never a placeholder.
- **The rebrand is part of setup** (Step 1b). Leave the client's public copy to them (keep or
  redirect it), and report the remaining `grep -ri edge8` count and why each remains.
- **Done means Step 7 passes**, not a green build. `/admin` signed out returns a 3xx to
  `/admin/login`: a 200 or a 500 is a security problem, so stop rather than work around it. And
  the app reads its own database: if every number on `/admin` is `0`, go back to Step 3's REST
  check and Step 2's keys.
- **Hand over** (Step 8): the production URL; how to add their Anthropic key and redeploy; what
  you installed and created; the database password they must save; and plainly, what is not
  working yet and why (without email, Settings → Access shows a temporary password to hand
  over instead of an invite).

## Working on any instance

### Secrets

The owner enters every secret, into Vercel's environment settings or the gitignored
`.env.local`. Ask for secrets by where they go, never in the chat. The Anthropic API key is the
operator's to add (Step 8). Generate the database password and `CRON_SECRET` yourself (Steps 2
and 4), and tell the operator the database password once, to save. Nothing secret is committed.

### Database

- A new database is built from `supabase/00-prereqs.sql`, then `01-schema.sql`, then
  `02-rebrand.sql -v slug=<client-slug>`, with `company_os` and `htt` exposed to PostgREST and
  checked over the REST API (Step 3). psql alone passes against a database the app cannot read.
- Build only from those files. A `supabase/migrations/` folder, if a variant has one, is
  partial history, and schema rebuilt from `information_schema` or the code loses policies,
  grants and roles. If `01-schema.sql` is missing, stop and say so.
- An existing database is upgraded, never rebuilt: `scripts/fork-upgrade.sh` (Step 3b) applies
  the deltas in `supabase/upgrades/`, each in one transaction. Deltas run only through that
  script and stay unedited. `--allow-data-loss` drops data: show the operator the delta's
  `-- HAZARD:` lines and get a yes first.

### Environment variables (Step 4)

The app reads `process.env.X` with no fallback and no warning, so names are exact.

- The auth key is `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, not `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- `SUPABASE_SECRET_KEY` takes the legacy `service_role` JWT. The `sb_secret_…` value the CLI
  prints is masked and fails with `401`, which shows up as a dashboard full of zeros.
- `NEXT_PUBLIC_SITE_URL`, `ADMIN_EMAILS`, `EMAIL_FROM` and `MARKETING_EMAIL_FROM` are required
  for every instance.
- Set each variable for Production, Preview and Development with `--value` (a value piped on
  stdin is stored empty), then `vercel env pull` and read the file. Append `</dev/null` to
  every scripted `vercel` command, and check each command's result before the next.

### Production

`vercel link` connects to whatever git `origin` is, so point `origin` at the client's repo
first (`vercel git disconnect` if it caught this template). When a hook or policy on the
operator's machine refuses `vercel --prod`, that is their production gate: hand the command
back with the reason, or push to the fork's `main` and let the git integration build. A plain
`vercel deploy` on a new project is a production deployment too.
