# ADR 0031 — The fork's database is a dump of production, filtered by the manifest's portability, upgraded by append-only deltas

Date: 2026-10-28, revised 2026-10-29. Status: proposed. Khoa decided the Human Tokens band on
2026-10-29: it is an Edge8 overlay delivered through slots (see "Decided").

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
- **CI checks it two ways.** `fork-schema-fresh` fails when the committed file and production
  disagree. The `fork` job replays the first baseline plus every delta, and requires a dump
  equal to a fresh install's.

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
  `01-schema.sql`, the append-only deltas and the two CI checks above are the mechanism, and
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
- `fork-schema-fresh`: **prerequisite.** It reads production, so it is proven by a planted
  difference in its input, and none exists yet.

## What would reopen it

A client who needs an internal entity's tables, which would make that entity portable rather
than reopen this. Or the fork no longer being public, which would remove the reason to filter
at all.
