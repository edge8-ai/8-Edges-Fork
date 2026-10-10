#!/usr/bin/env bash
#
# ship-content.sh — the one-command path for a CONTENT change: a private doc, a
# private workflow page, a blog or marketing edit. One branch off origin/main,
# one commit, one push, one PR, one CI run.
#
#   usage: scripts/ship-content.sh -m "<commit message>" [--author "<handle> <email>"]
#                                  [--branch <name>] [--dry-run] [--no-pr]
#
# Why this exists. On 2026-09-11 a two-file docs PR took 15 minutes and three
# commits: the agent branched from a stale local main (conflict), resolved it
# with a merge commit (hundreds of unrelated files in the PR), pushed before
# running the gates (CI found the file-size ratchet), and pushed a fix-up (a
# second full CI run). Every one of those is a checklist item, so this script
# is the checklist, run in order, refusing to continue when a step fails.
#
# What it does NOT do: merge. The repo has no branch protection (GitHub Free),
# so a merge is a human decision; the script prints the command.
#
# What it refuses: any change outside the content paths below. A change that
# touches product code goes through the normal flow (`npm run check`, then a
# PR), because the cheap preflight here is only complete for content.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

MSG="" AUTHOR="" BRANCH="" DRY_RUN=0 NO_PR=0
while [ $# -gt 0 ]; do
  case "$1" in
    -m|--message) MSG="${2:?-m needs a message}"; shift 2 ;;
    --author) AUTHOR="${2:?--author needs \"<handle> <email>\"}"; shift 2 ;;
    --branch) BRANCH="${2:?--branch needs a name}"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --no-pr) NO_PR=1; shift ;;
    -h|--help) sed -n '2,25p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
[ -n "$MSG" ] || { echo "error: -m \"<commit message>\" is required" >&2; exit 2; }

step() { printf '\n\033[1m▶ %s\033[0m\n' "$*"; }
fail() { printf '\n\033[31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

# ── Content paths. Anything else is product code and leaves this lane. ───────
# Kept as one ERE so the rule is readable in a single place. Each alternative
# is anchored at the start of the repo-relative path.
CONTENT_PATHS='^(private-docs/|docs/|public/|app/styles/|app/workflows/|entities/library/routes/workflows/|entities/library/lib/(codePageLinks|workflowsData)\.ts$|entities/site/routes/|entities/site/lib/(postData|caseStudies|caseStudyStories|pillars|jobs|gallery|home-endorsements)\.ts$|entities/site/lib/__fixtures__/)'

# ── 1. Fresh base. Every past conflict came from a stale local main. ────────
step "Fetching origin/main"
git fetch --quiet origin main

CURRENT="$(git rev-parse --abbrev-ref HEAD)"
if [ -z "$BRANCH" ]; then
  if [ "$CURRENT" = "main" ] || [ "$CURRENT" = "staging" ] || [ "$CURRENT" = "HEAD" ]; then
    slug="$(printf '%s' "$MSG" | sed -E 's/^[a-z]+(\([^)]*\))?:\s*//' | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g' | cut -c1-48)"
    BRANCH="content/${slug:-change}"
  else
    BRANCH="$CURRENT"
  fi
fi

OWN_COMMITS="$(git rev-list --count origin/main..HEAD)"
BEHIND="$(git rev-list --count HEAD..origin/main)"
PUSHED=0
git rev-parse --verify --quiet "origin/$BRANCH" >/dev/null && PUSHED=1

if [ "$CURRENT" != "$BRANCH" ]; then
  # Uncommitted edits ride along onto the new branch; git refuses if they collide.
  step "Branching $BRANCH from origin/main"
  git switch --quiet -c "$BRANCH" origin/main
elif [ "$BEHIND" -gt 0 ]; then
  if [ "$OWN_COMMITS" -eq 0 ]; then
    step "Moving $BRANCH to origin/main (no commits of its own yet)"
    git reset --quiet --soft origin/main   # keeps the working tree, moves the pointer
  elif [ "$PUSHED" -eq 0 ]; then
    step "Rebasing $OWN_COMMITS unpushed commit(s) onto origin/main"
    git rebase --quiet origin/main || fail "rebase conflict — resolve it, then re-run"
  else
    fail "$BRANCH is $BEHIND behind origin/main and already pushed. Decide: rebase + force-push (with the owner's OK) or merge. Not this script's call."
  fi
fi

# ── 2. Scope. Content only, or leave the lane. ───────────────────────────────
step "Checking the change is content only"
CHANGED="$( { git diff --name-only origin/main...HEAD; git diff --name-only HEAD; git diff --name-only --cached; git ls-files --others --exclude-standard; } | sort -u | sed '/^$/d')"
[ -n "$CHANGED" ] || fail "nothing to ship: no changes against origin/main"
printf '%s\n' "$CHANGED" | sed 's/^/  /'
OUTSIDE="$(printf '%s\n' "$CHANGED" | grep -vE "$CONTENT_PATHS" || true)"
if [ -n "$OUTSIDE" ]; then
  printf '\nThese paths are product code, not content:\n%s\n' "$(printf '%s\n' "$OUTSIDE" | sed 's/^/  /')" >&2
  fail "use the normal flow: npm run check, then a PR"
fi

# ── 3. The gates a content PR actually trips, locally, before any push. ─────
# Each writes to a log and the exit code is read from $? — never piped through
# head/tail (CLAUDE.md). The fork-sync test is the one that answers the real
# question: does this change leak anything into 8-Edges-Fork.
LOG="${TMPDIR:-/tmp}/ship-content-$$.log"
gate() {
  local name="$1"; shift
  step "Gate: $name"
  if "$@" >"$LOG" 2>&1; then echo "  ok"; else cat "$LOG" >&2; fail "$name failed — fix it, then re-run"; fi
}
gate "file-size ratchet"         node scripts/check-file-sizes.mjs
gate "private pages stay gated"  node scripts/check-private-pages.mjs
gate "fork exclude list is fresh" node scripts/gen-fork-excludes.mjs --check
gate "fork sync: nothing leaks"  npx vitest run .github/scripts/fork-sync.test.mjs
TS_FILES="$(printf '%s\n' "$CHANGED" | grep -E '\.(ts|tsx)$' | while read -r f; do [ -f "$f" ] && echo "$f"; done || true)"
if [ -n "$TS_FILES" ]; then
  gate "typecheck" npx tsc --noEmit
  # shellcheck disable=SC2086
  gate "lint changed files" npx eslint $TS_FILES
fi
if printf '%s\n' "$CHANGED" | grep -qE '\.css$|\.tsx$'; then
  gate "design ratchet" node scripts/check-design-ratchet.mjs
fi
rm -f "$LOG"

if [ "$DRY_RUN" -eq 1 ]; then
  step "Dry run: all gates green on $BRANCH; nothing committed or pushed"
  exit 0
fi

# ── 4. One commit, one push, one PR. ─────────────────────────────────────────
step "Committing"
git add -A
if git diff --cached --quiet && [ "$OWN_COMMITS" -gt 0 ]; then
  echo "  nothing new to commit; shipping the existing $OWN_COMMITS commit(s)"
else
  git commit --quiet -m "$MSG" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
fi
if [ "$(git rev-list --count origin/main..HEAD)" -gt 1 ]; then
  echo "  note: $BRANCH carries more than one commit; merge it with --squash so main gets one"
fi

step "Pushing once"
git push --quiet -u origin "$BRANCH"

[ "$NO_PR" -eq 0 ] || exit 0
if [ -z "$AUTHOR" ]; then
  email="$(git config user.email || true)"
  AUTHOR="${email%%@*} ${email}"
fi
step "Opening the PR"
BODY="$(cat <<EOF
## Summary
- ${MSG}

## Test Plan
- [x] \`scripts/ship-content.sh\` ran the content gates locally (file sizes, private-page gating, fork exclude list, fork-sync leak scan$( [ -n "$TS_FILES" ] && printf ', typecheck, lint')) before the push
- [ ] CI green (one run)

<!-- author: ${AUTHOR} -->

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
URL="$(gh pr create --base main --head "$BRANCH" --title "$MSG" --body "$BODY")"
echo "  $URL"

cat <<EOF

Next, and only after ONE green CI run (no polling loops — check once, then wait a bounded time):
  gh pr checks $URL --watch --fail-fast
  gh pr merge $URL --squash --delete-branch
EOF
