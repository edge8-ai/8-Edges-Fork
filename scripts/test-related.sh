#!/bin/sh
#
# The tests a push can affect, when the pre-push hook has named the changed
# files, and the whole suite otherwise.
#
#   EDGE8_PUSH_CHANGED=<file listing repo-relative paths>  sh scripts/test-related.sh
#
# The pre-push hook's "code" tier (scripts/push-scope.sh) runs this in place
# of `npm test`. `vitest related` walks the import graph from each changed
# file to every test that reaches it, directly or through a barrel, and runs
# those; a test file in the list runs itself. What the graph cannot see is
# wiring that happens at runtime rather than through an import. The test
# configuration is one case, and push-scope.sh sends a change to it to the
# full gate before this script is reached. The entity manifest, the generated
# registries under app/, the migrations and the fork overlay are the other,
# and since PP.2 this script widens the run for them instead (see below).
#
# Without the list (run by hand, or from a gate that did not set it) this is
# exactly `npm test`: a missing list never means a smaller check.
set -u
cd "$(dirname "$0")/.."

if [ -z "${EDGE8_PUSH_CHANGED:-}" ] || [ ! -r "$EDGE8_PUSH_CHANGED" ]; then
  echo "test-related: no changed-file list, running the whole suite"
  exec npm test
fi

# Only a module can be imported by a test: source and test files under the
# roots vitest collects from. A stylesheet or an image reaches no test, and a
# deleted file is reached by nothing (the test that imported it fails to
# compile, which the type check reports).
files=""
n=0
while IFS= read -r p; do
  case "$p" in
    *.js|*.mjs|*.cjs|*.jsx|*.ts|*.mts|*.cts|*.tsx|*.json) ;;
    *) continue ;;
  esac
  [ -f "$p" ] || continue
  files="$files $p"
  n=$((n + 1))
done < "$EDGE8_PUSH_CHANGED"

# Tests that name a changed file by its path (PP.1). Some tests run a script
# as a process or read a file as text (a workflow, a stylesheet, a shell
# script) instead of importing it, which the import graph cannot see: a
# change to .github/workflows/ci.yml reaches .github/scripts/ci-runs-suite.test.mjs
# only this way, and a stylesheet reaches the contrast tests that read it.
# Deleted files count too: a test that reads one should now fail. A test named
# in the list runs itself, so these join the same `vitest related` call.
named=""
while IFS= read -r p; do
  [ -z "$p" ] && continue
  for t in $(git grep -l -F -e "$p" -- '*.test.js' '*.test.mjs' '*.test.cjs' '*.test.ts' '*.test.tsx' 2>/dev/null); do
    case " $files $named " in *" $t "*) ;; *) named="$named $t" ;; esac
  done
done < "$EDGE8_PUSH_CHANGED"
m=$(printf '%s\n' $named | grep -c . || true)

# add <test file>...: join the run once, whichever rule asked for it.
extra=""
add() {
  for t in "$@"; do
    case " $files $named $extra " in *" $t "*) ;; *) extra="$extra $t" ;; esac
  done
}

# Tests that scan the tree instead of importing it (PP.2). A `*.scope.test`
# file reads every source file for a banned pattern, so it imports none of
# them and no change is ever "related" to it. Until PP.2 these ran only in the
# full tier and in CI's fork-check job, which is how a banned name chain
# reached main on 2026-11-16. They run whenever source under the app roots
# changed.
# shellcheck disable=SC2046
if grep -q -E '^(app|kernel|entities)/.*\.(js|mjs|cjs|jsx|ts|mts|cts|tsx)$' "$EDGE8_PUSH_CHANGED"; then
  add $(git ls-files -- '*.scope.test.js' '*.scope.test.mjs' '*.scope.test.ts' '*.scope.test.tsx' 2>/dev/null)
fi

# Wiring (PP.2, scripts/wiring-paths.sh): the manifest, a generated registry,
# vercel.json, a migration, a fork overlay file. Scripts read these from disk,
# and the tests of those scripts import the script, not the file, so the graph
# stops one step short. Every tooling test runs, and so does every test that
# names the folder a new file landed in: a new migration is named by no test,
# but the tests that read the migrations folder name the folder.
. scripts/wiring-paths.sh
wiring="$(wiring_paths < "$EDGE8_PUSH_CHANGED")"
if [ -n "$wiring" ]; then
  # shellcheck disable=SC2046
  add $(git ls-files -- 'scripts/*.test.mjs' '.github/scripts/*.test.mjs' 2>/dev/null)
  for dir in supabase/migrations fork-overlay; do
    if printf '%s\n' "$wiring" | grep -q -F "$dir/"; then
      # shellcheck disable=SC2046
      add $(git grep -l -F -e "$dir" -- '*.test.js' '*.test.mjs' '*.test.cjs' '*.test.ts' '*.test.tsx' 2>/dev/null)
    fi
  done
fi
x=$(printf '%s\n' $extra | grep -c . || true)

if [ "$n" -eq 0 ] && [ "$m" -eq 0 ] && [ "$x" -eq 0 ]; then
  echo "test-related: no importable file changed and no test names one, no test can be affected"
  exit 0
fi
echo "test-related: vitest related for $n changed file(s), $m test(s) that name one and $x tree-wide or tooling test(s)"
named="$named $extra"
# shellcheck disable=SC2086
exec npx vitest related --run $files $named
