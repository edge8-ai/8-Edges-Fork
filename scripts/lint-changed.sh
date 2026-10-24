#!/bin/sh
#
# ESLint on the files a push changed, when the pre-push hook has named them,
# and on the whole tree otherwise.
#
#   EDGE8_PUSH_CHANGED=<file listing repo-relative paths>  sh scripts/lint-changed.sh
#
# The pre-push hook's "code" tier (scripts/push-scope.sh) runs this in place
# of `npm run lint`. Lint is a per-file judgement — every rule in
# eslint.config.mjs, the generated entity zones included, is decided from the
# file's own path and imports — so linting only the changed files answers the
# same question for them as the full run does. The one thing a scoped run
# cannot see is a change to the configuration itself, and push-scope.sh sends
# those to the full gate before this script is reached.
#
# Without the list (run by hand, or from a gate that did not set it) this is
# exactly `npm run lint`: a missing list never means a smaller check.
set -u
cd "$(dirname "$0")/.."

if [ -z "${EDGE8_PUSH_CHANGED:-}" ] || [ ! -r "$EDGE8_PUSH_CHANGED" ]; then
  echo "lint-changed: no changed-file list, linting the whole tree"
  exec npm run -s lint
fi

# The same roots and extensions `npm run lint` covers; a path outside them is
# not lint's business. A deleted file has nothing to lint.
files=""
n=0
while IFS= read -r p; do
  case "$p" in
    app/*|kernel/*|entities/*) ;;
    *) continue ;;
  esac
  case "$p" in
    *.js|*.mjs|*.cjs|*.jsx|*.ts|*.mts|*.cts|*.tsx) ;;
    *) continue ;;
  esac
  [ -f "$p" ] || continue
  files="$files $p"
  n=$((n + 1))
done < "$EDGE8_PUSH_CHANGED"

if [ "$n" -eq 0 ]; then
  echo "lint-changed: no lintable file changed"
  exit 0
fi
echo "lint-changed: eslint on $n changed file(s)"
# shellcheck disable=SC2086
exec npx eslint --cache --cache-strategy content --cache-location node_modules/.cache/eslint/ $files
