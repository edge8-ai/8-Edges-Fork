# ADR 0031 — The fork's database is a dump of production, filtered by the manifest's portability, upgraded by append-only deltas

Date: 2026-10-28, revised 2026-10-29, amended 2026-11-20. Status: proposed. Khoa decided the
Human Tokens band on 2026-10-29: it is an Edge8 overlay delivered through slots (see "Decided").
On 2026-11-20 he took the production comparison out of CI and chose a scheduled export workflow
that proposes each change in a pull request (see "Amended 2026-11-20").

This ADR extends ADR 0005 (portability is declared, not remembered) from code to the database.
It amends ADR 0001 (one deployment per client): 0001's line that porting is "a deliberate,
manual act per release, never automated" stopped being true when ADR 0005's sync was automated.

Found by the architecture pass of 28 October 2026. The two-architect review of 29 October found
that the gate this ADR leans on is half dead, and found a second internal read.

## Context

A client installs the fork and builds its database from
`.github/fork-overlay/supabase/01-schema.sql` (about 33,700 lines).

- **Until 12 October** that file was edited by hand. The hand-edited copy lacked 38 tables and
  did not parse (commit 7fbc706a0).
- **Since then** it is generated. `scripts/gen-fork-schema.mjs` runs a pinned `pg_dump
  --schema-only` of `company_os` and `htt` against production, scans the result, and writes an
  upgrade delta for existing client databases. The delta is proved against two throwaway
  databases and never edited once committed.
- **CI checked it two ways until 2026-11-20.** `fork-schema-fresh` failed when the committed
  file and production disagreed; it has left CI (see "Amended 2026-11-20"). The `fork` job
  replays the first baseline plus every delta, and requires a dump equal to a fresh install's;
  it still runs.

That design is recorded only in a commit message and CLAUDE.md, and it has a measured cost:

- In the 30 days to 28 October, 115 commits touched `01-schema.sql`: 70 with a migration, and
  45 as the follow-up that regenerates it.
- 23 deltas were written after 12 October.
- Every schema change is two pull requests (expand, then use), with main stale in between.

**What leaves the dump is a hand-kept list.** It is `SCHEMAS = ["company_os", "htt"]` plus
`EXCLUDED_TABLES`, which names one table, `library_documents` (`gen-fork-schema.mjs:97, 112`).
The manifest marks `htt` as **internal**, yet all 14 of its tables ship to every client:

- 13 are in the `htt` schema;
- `company_github_orgs` is in `company_os` (`01-schema.sql:4715`).

So the filter has to work by the manifest's table list, not by schema. The code side of the
fork is not off hand-kept lists either: `.github/fork-sync-exclude.txt` is 389 hand-written
lines beside the generated list.

**The gate that should stop a portable entity reading an internal table does not run.**
`check-portability.mjs:1-3` claims it fails a portable file that reads a table that does not
ship, and defines `internalTables()` at line 193. Nothing calls that helper, and no test names
it. `scripts/portability-baseline.json` is empty, while two portable files read `htt`:

- `team/lib/hub-program-prs.ts:69` reads `htt.pull_requests` (backlog M28);
- `portal/lib/program-hub.ts:255` reads `htt.repos`.

`scripts/check-requires.mjs:50-58` also excuses `portal → htt` in `PORTABILITY_EXCEPTIONS`, for
the Human Tokens band. It calls the fix a product decision: either the tracker ships with the
product, or the band is an Edge8 overlay.

**The fork's code already treats the band as an overlay, and its database does not.**

- `entities/htt` and crm's token and hours actions are on the generated fork exclude list.
- `.github/fork-overlay/entities/portal/lib/hub-tokens.ts` and the admin `AdminHubTokensBand.tsx`
  are stubs. The first says htt "is internal and never ships", and that it makes "no query
  against a schema the fork's database does not have".
- That schema ships anyway, all 14 tables of it.
- The stub copies every upstream type by hand. Its own header names that copy as the part most
  likely to rot, because only the fork's CI typecheck sees a field added upstream.

**The band is the visible part of a model that runs through three surfaces:**

- the portal's tokens band, and its program hub's repos (`portal/lib/hub-tokens.ts`,
  `program-hub.ts:255`);
- crm's admin company page: bought tokens, delivered additions and hours overrides
  (`crm/lib/token-allocation-actions.ts`, `delivered-addition-actions.ts`, `hours-actions.ts`);
- the Team hub's hours overrides and PR story (`team/lib/hub-hours-actions.ts`,
  `hub-program-prs.ts`).

## Decision

- **The fork's database is a dump of production, never a hand-edited file.** The generated
  `01-schema.sql`, the append-only deltas and the `fork` job's replay are the mechanism, and
  this ADR is their record.
- **What the dump contains is derived from the manifest's table lists, across schemas.**
  - A table ships when the entity that lists it in `entities.manifest.json` is portable, or
    when it is a kernel table.
  - `SCHEMAS` and `EXCLUDED_TABLES` are replaced by that derivation.
  - A table that no manifest entry lists fails the generator.
- **A portable entity may not read an internal entity's table,** in code or in a view, because
  the table will not exist in the fork. `check:portability`'s table half is built and proven to
  fire (ADR 0033) before anything relies on it.
- **`htt` leaves the fork only after its portable readers are gone.** Every Human Tokens
  surface listed above becomes a slot that `htt` provides (ADRs 0026 and 0032). A deployment
  without `htt` renders nothing in its place, which is what the fork's stubs do today. When the
  last one is a slot:
  - the `portal → htt` exception closes;
  - the overlay stubs of `hub-tokens.ts` and `AdminHubTokensBand.tsx` are deleted;
  - `htt` leaves `deployments/minimal.json`'s closure, and its tables leave the fork's dump.
- **The sync to the product repository is automated, and the automation is the gate.** ADR
  0001's "never automated" was written before ADR 0005. The nightly mirror, the scanner,
  `check:fork-safe` and the derived exclusion are what stop internal work leaking. A manual step
  would add a person who could forget it, not a safeguard.

## Alternatives rejected

- **Hand-maintain the fork schema.** Tried until 12 October; it drifted by 38 tables.
- **Keep the exclusion list and add `htt` to it.** It fixes today's leak by schema, misses
  `company_github_orgs`, and leaves the next internal entity's tables to be remembered. That is
  the failure ADR 0005 named.
- **Ship every table and leave unused ones empty.** An internal table's name, columns and
  comments are themselves internal, and the fork is public.
- **Fold the regeneration into the migration pull request.** The dump is of production, and a
  migration reaches production only after its pull request merges (CLAUDE.md, "one order"). The
  two pull requests are the price of that order, not of the dump.

## Consequences

- **Moving a table changes the fork's database.** Making an entity internal, or moving a table
  between entities, changes what the fork's database contains. The next regeneration writes the
  delta that drops it from client databases. That delta is destructive for clients, and is
  reviewed as a contract change.
- **Order of work.** First the gate's table half goes live, then the three `htt` readers are
  cleared, then the derivation lands. The first regeneration after that removes `htt`'s tables
  from the fork.
- **The marketing split changes the fork too** (ADR 0034). When `entities/site` leaves
  edge8-web, the fork gets the kernel's public frame and a placeholder home page instead, and a
  client's marketing site becomes a repository of its own. The gallery tables follow their new
  owner.
- ADR 0001's consequence about manual porting is read through this ADR.

## Decided

Khoa decided on 2026-10-29 that **the Human Tokens model is Edge8's own**, an overlay that
`htt` provides through slots. It is not a product feature the fork ships.

- `htt` stays internal.
- The fork's portal and admin show no tokens band, as they do in practice today.
- Shipping `htt` was rejected: a client would get no hours without running Edge8's telemetry
  plugin against their own deployment.
- Splitting a portable ledger (bought tokens, manual delivered additions) from the internal
  tracker was also rejected. It waits for a client who will sell prepaid hours.

## The gates' "fires" tests (ADR 0033)

- `check:portability`, both halves: `scripts/check-portability.test.mjs`, "check-portability
  fires", spawns the CLI over a planted tree. The table half went live with it, and its baseline
  holds five reads with their reasons: the two above, and `team/lib/hub-program.ts` reading
  `htt.pull_requests` and `htt.man_hour_entries`, which this ADR's list missed. All five are
  ADR 0032's to clear.
- `check:fork-safe`: the scanner's rules are planted in `.github/scripts/fork-sync.test.mjs`.
  **Prerequisite:** the gate's own stage-and-scan run has no fires test.
- `fork-schema-fresh`: no longer a CI gate (2026-11-20), so there is nothing to prove on a
  runner. The export workflow that replaced it is not a gate either: it proposes a change, and
  `.github/scripts/export-fork-schema.test.mjs` pins its shape.

## Amended 2026-11-20: production is exported by a workflow that opens a pull request

Khoa removed `fork-schema-fresh` from CI on 2026-11-20 (I2.289), on the pull request and on the
push to main, and replaced it with `.github/workflows/export-fork-schema.yml` (I2.290 chose it,
I2.292 built it).

- **Why the check left CI.** It made the fork's database travel with the code: every migration
  had to be followed by a regenerated `01-schema.sql` before main went green again. The fork
  needs a correct copy of the shape when it syncs, not a proof on every run. Each run cost a
  `pg_dump` in Docker against production, and it turned main red for drift nobody downstream was
  waiting on: on 19 November a three-object difference on `training_plans` (#2739) kept the
  `fresh` job red across every later merge.
- **What the workflow runs.** Daily at 22:00 UTC, two hours before the nightly sync, and by hand
  (`gh workflow run export-fork-schema.yml`, which `scripts/apply-migration.mjs` prints after
  applying a migration). It checks out main and runs `npm run gen:fork-schema`. An unchanged
  schema keeps its version, writes nothing, and the run ends green with "matches production at
  version X" in its summary. On a change it stages the fork tree and runs
  `replay-fork-schema.sh`: the fresh install and the baseline upgraded through every delta must
  dump the same. Only then does it force-push `bot/fork-schema` and open, or update, the one pull
  request `chore(fork): fork schema <version>`, whose body holds the generator's drift summary
  and every `-- HAZARD:` line of the new delta.
- **Where production and Docker are needed.** On the runner only. `SUPABASE_DB_URL` is the
  repository secret the types gate reads (the session-mode pooler url); the runner's Docker runs
  the pinned `pg_dump` and the two throwaway databases, and the Supabase CLI diffs them. Nobody
  needs either at a keyboard for the fork; `gen:fork-schema` and `check:fork-schema-fresh` remain
  commands for whoever has both.
- **How deltas are produced.** As before: the generator writes
  `upgrades/<main's version>_to_<new>.sql` and proves it. The branch is rebuilt from main on every
  run, so while the pull request is open a later change in production replaces its delta with one
  from the version main ships to the newest. That keeps the rule: a delta is append-only once it
  merges, because only then can the sync ship it and a client apply it. Several migrations can
  batch into one delta.
- **Who merges.** Khoa merges every export pull request by hand; nothing auto-merges it. The
  pull request is opened with `GITHUB_TOKEN`, which does not start CI, so the replay inside the
  export job is its check. Opening it needs the repository setting "Allow GitHub Actions to
  create and approve pull requests"; without it the branch is pushed and the run fails saying so.
  It is not a db-review pull request: it touches no file under `supabase/migrations/`.
- **What stays.** The fork's database is a filtered dump of production with append-only deltas,
  and everything under "Decision" holds. The `fork` job in CI replays the committed baseline and
  deltas on any pull request that touches them.
- **What it costs.** The committed file can lag production by up to a day, or for as long as an
  export pull request waits for its merge. The sync ships what main holds.
- **Rejected with it.** Exporting inside the sync (the fork is force-pushed as one commit
  nightly, so the delta history must live in upstream git, and a destructive delta needs a
  reader), a freshness check at sync time, and deriving the shape from `supabase/migrations/`
  (they do not replay from zero).

## What would reopen it

A client who needs an internal entity's tables, which would make that entity portable rather
than reopen this. Or the fork no longer being public, which would remove the reason to filter
at all.
