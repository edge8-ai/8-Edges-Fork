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
# wiring that happens at runtime rather than through an import — the entity
# manifest, the generated registries under app/, the test configuration — and
# push-scope.sh sends a change to any of those to the full gate before this
# script is reached.
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

if [ "$n" -eq 0 ] && [ "$m" -eq 0 ]; then
  echo "test-related: no importable file changed and no test names one, no test can be affected"
  exit 0
fi
echo "test-related: vitest related for $n changed file(s) and $m test(s) that name one"
# shellcheck disable=SC2086
exec npx vitest related --run $files $named
