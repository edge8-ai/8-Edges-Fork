#!/bin/sh
#
# Decide what a push must pay for. Reads pre-push's stdin (one line per ref:
# local_ref local_sha remote_ref remote_sha) and prints one line:
#
#   docs: <n> file(s), all documentation (<reason>)
#   code: <n> file(s), none shared configuration (<reason>)
#   full: <reason>
#
# The pre-push hook runs `npm run check:docs` on "docs", `npm run check:code`
# on "code" and the whole `npm run check` on "full". Full is the default:
# every doubt, every unreadable ref and every empty diff lands there, because
# a wasted six minutes costs less than a regression that reached main.
#
# The three tiers, from the files a push carries:
#
#   docs  Every file is documentation (scripts/docs-only-paths.sh: docs/ and
#         Markdown outside test fixtures). Nothing that compiles or tests reads
#         one, so only the gates that read documentation run.
#   code  At least one file is not documentation, and none is shared
#         configuration. The type check, knip and every tree-wide gate still
#         run in full; only lint and the test suite are scoped to the changed
#         files (lint on each one, tests reachable from them through the
#         import graph). Shared configuration is what makes "scoped" unsafe,
#         and it is listed in shared_config_paths below.
#   full  Anything else.
#
# What is compared. Each ref is diffed against what the remote already has
# (remote_sha), so only the commits this push adds are judged. A new branch
# has no remote counterpart, so it is diffed against its merge base with
# origin/main: the whole branch. A branch that merged main since its last push
# is judged on everything main brought in, so it usually pays the full gate;
# that is the conservative reading and it is deliberate.
#
# When EDGE8_PUSH_CHANGED names a file, the sorted list of changed paths is
# written there, so the scoped gates can read it. It is written for every
# verdict, full included, so a reader never finds a stale list from an earlier
# push.
set -u
. "$(dirname "$0")/docs-only-paths.sh"

# Paths whose change can alter what a gate means or what a test imports in a
# way the import graph cannot see, so a scoped lint or test run would prove
# too little. The gates and hooks themselves, the lint and test configuration,
# the entity manifest and the registries generated from it, the deployment
# catalogue, the Next and Vercel configuration, and the database. Read paths
# on stdin; print the ones that are shared configuration.
shared_config_paths() {
  while IFS= read -r p; do
    [ -z "$p" ] && continue
    case "$p" in
      package.json|package-lock.json|tsconfig*.json|eslint*.mjs|vitest.config.*|vitest.setup.*|next.config.*|vercel.json|instrumentation.ts|entities.manifest.json|knip.json) printf '%s\n' "$p" ;;
      app/events.ts|app/nav.ts|app/env.ts|app/shell.ts|app/search.ts|app/permissions.ts|app/access.ts|app/routines.ts) printf '%s\n' "$p" ;;
      deployments/*|scripts/*|.github/*|.githooks/*|.claude/*|supabase/*) printf '%s\n' "$p" ;;
    esac
  done
}

zero=0000000000000000000000000000000000000000
changed=""
refs=0
record() {
  [ -n "${EDGE8_PUSH_CHANGED:-}" ] && printf '%s\n' "$changed" | grep -v '^$' > "$EDGE8_PUSH_CHANGED"
}
full() { record; echo "full: $1"; exit 0; }

while read -r local_ref local_sha remote_ref remote_sha; do
  [ -z "${local_ref:-}" ] && continue
  # A deletion pushes no commits; nothing to check here.
  [ "$local_sha" = "$zero" ] && continue
  refs=$((refs + 1))
  base=""
  if [ "$remote_sha" != "$zero" ] && git cat-file -e "$remote_sha^{commit}" 2>/dev/null; then
    base="$remote_sha"
  elif git rev-parse --verify --quiet refs/remotes/origin/main >/dev/null 2>&1; then
    base="$(git merge-base "$local_sha" refs/remotes/origin/main 2>/dev/null || true)"
  fi
  [ -n "$base" ] || full "no base to compare $local_ref with"
  if ! diff="$(git diff --name-only "$base" "$local_sha" 2>/dev/null)"; then
    full "could not diff $local_ref against $base"
  fi
  changed="$changed$diff
"
done

[ "$refs" -gt 0 ] || full "no refs to judge"
changed="$(printf '%s' "$changed" | grep -v '^$' | sort -u || true)"
[ -n "$changed" ] || full "the push changes no files"
record

count="$(printf '%s\n' "$changed" | wc -l | tr -d ' ')"
outside="$(printf '%s\n' "$changed" | non_docs_paths)"
if [ -z "$outside" ]; then
  echo "docs: $count file(s), all documentation (docs/ and Markdown outside __fixtures__/)"
  exit 0
fi

shared="$(printf '%s\n' "$outside" | shared_config_paths)"
if [ -n "$shared" ]; then
  first="$(printf '%s\n' "$shared" | head -1)"
  full "$first is shared configuration"
fi

first="$(printf '%s\n' "$outside" | head -1)"
echo "code: $count file(s), none shared configuration (lint and tests scoped to them; $first is code)"
