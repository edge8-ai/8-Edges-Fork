#!/usr/bin/env bash
#
# Brings a database built from an earlier supabase/01-schema.sql up to the
# version this checkout ships, by applying the deltas in supabase/upgrades/.
#
#   usage: scripts/fork-upgrade.sh [--dry-run] [--allow-data-loss] [--slug <client-slug>]
#          scripts/fork-upgrade.sh --stamp <version>
#          scripts/fork-upgrade.sh --plan-from <version>
#
# Connection: the libpq variables, as README Step 3 sets them —
#   PGHOST (required; db.<PROJECT_REF>.supabase.co or the session pooler),
#   PGPORT (5432), PGUSER (postgres), PGDATABASE (postgres), PGPASSWORD.
# PSQL names the psql binary when it is not on PATH (Homebrew's libpq:
# PSQL=/opt/homebrew/opt/libpq/bin/psql). Nothing here needs Docker.
#
# Why this exists. 01-schema.sql is a baseline: it builds a NEW database. A
# database built from an earlier copy of it has no way to take the changes a
# later sync's code depends on, because the upstream's migrations never reach
# this repo. So every 01-schema.sql carries a version in its header
# (`-- fork-schema-version:`) and records it in company_os.fork_schema_versions
# when applied; each later version ships supabase/upgrades/<old>_to_<new>.sql,
# the DDL from one version to the next, generated and proved upstream (CI
# replays baseline + every delta and holds the result to the current file).
#
# What it does, in order:
#   1. creates company_os.fork_schema_versions if the database predates it;
#   2. reads the version recorded there and the version 01-schema.sql declares;
#   3. plans the chain of deltas from the one to the other, and stops on a gap,
#      a fork in the history, or a database newer than the checkout;
#   4. refuses the whole plan if any delta starts with `-- HAZARD:` (it drops
#      a table or column, changes a type, or adds NOT NULL) unless
#      --allow-data-loss is given — read such a delta before you pass it;
#   5. applies each delta in ONE transaction with ON_ERROR_STOP, together with
#      the insert that records its version, so a failed delta leaves neither a
#      half-applied schema nor a wrong version;
#   6. passes the client slug (-v slug=…) to each delta, because a delta that
#      restates a brand constraint names it as :'slug' the way 02-rebrand.sql
#      does. The slug is read from the objectives_brand_check constraint
#      02-rebrand.sql wrote, or given with --slug.
#
# A database built before versioning existed (no row in the table) must first
# be told which version it is: `--stamp <version>`, where <version> is the
# `<old>` of the oldest file in supabase/upgrades/ for the 2026-10-12 baseline.
# README Step 3b says which.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
UPGRADES="$ROOT/supabase/upgrades"
SCHEMA="$ROOT/supabase/01-schema.sql"
PSQL="${PSQL:-psql}"

dry_run=0
allow_data_loss=0
slug=""
stamp=""
plan_from=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) dry_run=1 ;;
    --allow-data-loss) allow_data_loss=1 ;;
    --slug) slug="${2:?--slug needs a value}"; shift ;;
    --stamp) stamp="${2:?--stamp needs a version}"; shift ;;
    --plan-from) plan_from="${2:?--plan-from needs a version}"; shift ;;
    -h|--help) sed -n '2,45p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "fork-upgrade: unknown argument $1" >&2; exit 2 ;;
  esac
  shift
done

die() { echo "fork-upgrade: $*" >&2; exit 1; }
is_version() { [[ "$1" =~ ^[0-9]{14}$ ]]; }

[ -f "$SCHEMA" ] || die "$SCHEMA is missing; this is not a clean copy of the repo."
target="$(sed -nE 's/^-- fork-schema-version: ([0-9]{14})$/\1/p' "$SCHEMA")"
[ -n "$target" ] || die "supabase/01-schema.sql declares no fork-schema-version; nothing to upgrade to."

# The chain of deltas from a version to the target, one file per line, by
# following each file's new version to the next file's old one. Fails on two
# files that start at the same version (the history forked upstream; a sync
# must fix that, not this script) and on a chain that does not reach the
# target (a gap, or a database newer than this checkout).
plan() {
  local at="$1" next count
  while [ "$at" != "$target" ]; do
    count=0
    next=""
    for f in "$UPGRADES/${at}_to_"*.sql; do
      [ -e "$f" ] || continue
      count=$(( count + 1 ))
      next="$f"
    done
    [ "$count" -le 1 ] || die "two upgrades start at $at in supabase/upgrades/; the history forked upstream."
    if [ "$count" -eq 0 ]; then
      if [ "$at" \> "$target" ]; then
        die "the database is at version $at, newer than this checkout's $target; sync the repo forward before upgrading."
      fi
      die "no upgrade starts at version $at in supabase/upgrades/ (the chain to $target has a gap, or $at is not a version this repo ever shipped)."
    fi
    echo "$next"
    at="$(basename "$next" .sql)"
    at="${at##*_to_}"
    is_version "$at" || die "$(basename "$next") is not named <old>_to_<new>.sql"
  done
}

# The plan as an array. A command substitution, not a pipeline or a process
# substitution, so that `die` inside plan ends the script rather than a
# subshell nobody looks at.
read_plan() {
  local out
  out="$(plan "$1")"
  files=()
  while IFS= read -r f; do [ -n "$f" ] && files+=("$f"); done <<< "$out"
}

has_upgrade_from() {
  local f
  for f in "$UPGRADES/${1}_to_"*.sql; do [ -e "$f" ] && return 0; done
  return 1
}

if [ -n "$plan_from" ]; then
  # The plan alone, with no database: what the test suite checks.
  is_version "$plan_from" || die "--plan-from takes a 14-digit version"
  read_plan "$plan_from"
  for f in "${files[@]}"; do
    if grep -q '^-- HAZARD:' "$f"; then echo "HAZARD $(basename "$f")"; else echo "ok     $(basename "$f")"; fi
  done
  exit 0
fi

[ -n "${PGHOST:-}" ] || die "set PGHOST (and PGPASSWORD) as in README Step 3; see the header of this script."
psqlc() { "$PSQL" -X -v ON_ERROR_STOP=1 "$@"; }

# The table that records versions. 00-prereqs.sql creates it for a fresh
# install; a database from before versioning gets it here, empty. The
# "already exists" notice is the usual case and not worth a line.
psqlc -q -c "set client_min_messages = warning" \
  -c "create table if not exists company_os.fork_schema_versions (version text primary key, applied_at timestamptz not null default now())"

recorded="$(psqlc -qAt -c "select coalesce(max(version), '') from company_os.fork_schema_versions")"

if [ -n "$stamp" ]; then
  is_version "$stamp" || die "--stamp takes a 14-digit version"
  [ -z "$recorded" ] || die "the database already records version $recorded; --stamp is for a database with no version."
  has_upgrade_from "$stamp" || [ "$stamp" = "$target" ] || die "no upgrade starts at $stamp and it is not the current version; is that the version this database was built from?"
  psqlc -q -c "insert into company_os.fork_schema_versions (version) values ('$stamp')"
  echo "fork-upgrade: recorded version $stamp; run this script again to apply the upgrades from it."
  exit 0
fi

if [ -z "$recorded" ]; then
  die "the database records no schema version. If it was built from a 01-schema.sql without a fork-schema-version line (before 2026-10-12), record that version first: scripts/fork-upgrade.sh --stamp <version>, with the version README Step 3b names."
fi
is_version "$recorded" || die "the recorded version '$recorded' is not a version."

if [ "$recorded" = "$target" ]; then
  echo "fork-upgrade: the database is at version $target, which is what this checkout ships; nothing to do."
  exit 0
fi

read_plan "$recorded"

echo "fork-upgrade: database at $recorded, checkout at $target; ${#files[@]} upgrade(s) to apply:"
hazardous=0
needs_slug=0
for f in "${files[@]}"; do
  if grep -q '^-- HAZARD:' "$f"; then
    hazardous=1
    echo "  HAZARD $(basename "$f")"
    grep '^-- HAZARD:' "$f" | sed 's/^-- HAZARD: /         /'
  else
    echo "  ok     $(basename "$f")"
  fi
  grep -q '^-- requires: slug' "$f" && needs_slug=1
done

if [ "$dry_run" -eq 1 ]; then
  [ "$hazardous" -eq 0 ] || echo "fork-upgrade: an upgrade above can lose or refuse data; applying it needs --allow-data-loss."
  echo "fork-upgrade: dry run; nothing applied."
  exit 0
fi

if [ "$hazardous" -eq 1 ] && [ "$allow_data_loss" -ne 1 ]; then
  die "an upgrade above can lose or refuse data. Read it, take a backup, and run again with --allow-data-loss to apply it."
fi

if [ -z "$slug" ]; then
  # 02-rebrand.sql rewrote this constraint to allow the client's slug alone.
  slug="$(psqlc -qAt -c "select (regexp_match(pg_get_constraintdef(oid), '''([^'']+)'''))[1] from pg_constraint where connamespace = 'company_os'::regnamespace and conname = 'objectives_brand_check'")"
fi
if [ "$needs_slug" -eq 1 ] && [ -z "$slug" ]; then
  die "an upgrade above restates a brand constraint and needs the client slug, which the database does not show (was 02-rebrand.sql run?); pass --slug <client-slug>."
fi

for f in "${files[@]}"; do
  name="$(basename "$f" .sql)"
  new="${name##*_to_}"
  # One transaction for the delta and the version row: psql runs its -f and
  # -c arguments in order, inside a single transaction with -1.
  psqlc -q -1 -v slug="$slug" -f "$f" -c "insert into company_os.fork_schema_versions (version) values ('$new')" >/dev/null
  echo "fork-upgrade: applied $(basename "$f"); the database is at $new"
done
echo "fork-upgrade: done; the database is at version $target."
