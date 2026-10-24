#!/bin/sh
#
# Which paths are documentation and nothing else: read by people, by no gate
# that compiles or tests, and by nothing the deployment serves. Sourced by two
# scripts that answer the same question for two different payers:
#
#   - scripts/vercel-ignore-build.sh: should this push get a preview build?
#   - scripts/push-scope.sh (from .githooks/pre-push): should this push pay
#     the full `npm run check`, or only the gates that read documentation?
#
# One definition, so the two can never disagree about what a docs commit is.
# On 2026-10-20 a commit touching GLOSSARY-MAP.md, entities/quests/GLOSSARY.md,
# two ADRs and two engineering docs paid the full six-minute gate twice.
#
# Documentation is: anything under docs/, and any Markdown file anywhere, with
# one exception. Markdown under a __fixtures__/ directory is test input (the
# site's blog post fixtures), so a change there changes what a test sees and
# is not documentation.

# Read repo-relative paths on stdin; print the ones that are NOT documentation.
# An empty output means the whole change is docs.
non_docs_paths() {
  while IFS= read -r p; do
    [ -z "$p" ] && continue
    case "$p" in
      *__fixtures__/*) printf '%s\n' "$p" ;;
      docs/*|*.md) ;;
      *) printf '%s\n' "$p" ;;
    esac
  done
}
