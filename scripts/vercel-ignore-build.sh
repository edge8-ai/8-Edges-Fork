#!/usr/bin/env bash
# Vercel's Ignored Build Step. Exit 0 skips the deployment, exit 1 builds it.
#
# Every push to every branch was building a preview — about four minutes of
# build time each, thirteen previews for seven merges on one day. Two kinds of
# push do not need one:
#
#   1. A push with no pull request. A preview exists to be looked at from a PR;
#      the first push of a branch, before its PR is opened, has nobody to look.
#      Vercel sets VERCEL_GIT_PULL_REQUEST_ID only when the commit belongs to a
#      PR, so an empty value is exactly that push.
#   2. A push whose branch changes nothing the deployment serves: docs, scripts,
#      tests, workflow files, the check plans. The app is identical to the last
#      preview.
#
# The second question is asked of the whole branch, not of the newest commit.
# Until W.163 this read `git diff HEAD^ HEAD`, and for a merge commit HEAD^ is
# the branch's own previous commit, so the diff was only what main brought in.
# A branch whose newest commit merged a docs-only main therefore skipped its
# preview even though the branch itself changed runtime code. The base is now,
# in order of preference:
#
#   - VERCEL_GIT_PREVIOUS_SHA, the commit of this branch's last successful
#     deployment, when this clone can see it as an ancestor of HEAD. Everything
#     since the last preview that was actually built is judged, so a push that
#     was skipped earlier is never forgotten. A force-push that rewrote it out
#     of the history falls through to the next base.
#   - the merge base of HEAD and the production branch, which is the whole
#     branch. Vercel clones shallowly, so the production branch is fetched and
#     the history deepened a bounded number of times until the base is found.
#
# Production (main) always builds. When in doubt — no base to diff against, no
# remote, an unknown target — build; a wasted build costs minutes, a skipped
# one costs a missed regression.
set -u

PRODUCTION_BRANCH="main"
# A clone without credentials must fail its fetch at once, not wait for a
# password prompt nobody will answer.
export GIT_TERMINAL_PROMPT=0

if [ "${VERCEL_ENV:-}" = "production" ]; then
  echo "production: build"
  exit 1
fi

if [ -z "${VERCEL_GIT_PULL_REQUEST_ID:-}" ]; then
  echo "no pull request for this push: skip the preview"
  exit 0
fi

is_shallow() {
  [ "$(git rev-parse --is-shallow-repository 2>/dev/null)" = "true" ]
}

# The refspecs a fetch needs: the production branch, and this branch when
# Vercel names it, so deepening reaches back along both sides of the fork.
refspecs() {
  printf '%s\n' "+refs/heads/$PRODUCTION_BRANCH:refs/remotes/origin/$PRODUCTION_BRANCH"
  if [ -n "${VERCEL_GIT_COMMIT_REF:-}" ] && [ "${VERCEL_GIT_COMMIT_REF}" != "$PRODUCTION_BRANCH" ]; then
    printf '%s\n' "+refs/heads/$VERCEL_GIT_COMMIT_REF:refs/remotes/origin/$VERCEL_GIT_COMMIT_REF"
  fi
}

# Print the base to diff against, or fail when this clone cannot see one yet.
resolve_base() {
  local prev="${VERCEL_GIT_PREVIOUS_SHA:-}"
  if [ -n "$prev" ] && git merge-base --is-ancestor "$prev" HEAD >/dev/null 2>&1; then
    echo "$prev"
    return 0
  fi
  git merge-base HEAD "refs/remotes/origin/$PRODUCTION_BRANCH" 2>/dev/null
}

# One fetch of the production branch first: a Vercel clone usually has no
# origin/main at all. --depth only when the clone is already shallow, because
# on a full clone it would make the history shallow.
if git remote get-url origin >/dev/null 2>&1; then
  # shellcheck disable=SC2046
  if is_shallow; then
    git fetch --quiet --no-tags --depth=50 origin $(refspecs) >/dev/null 2>&1 || true
  else
    git fetch --quiet --no-tags origin $(refspecs) >/dev/null 2>&1 || true
  fi
fi

base=""
for _ in 1 2 3 4 5; do
  base=$(resolve_base) && [ -n "$base" ] && break
  base=""
  is_shallow || break
  # shellcheck disable=SC2046
  git fetch --quiet --no-tags --deepen=200 origin $(refspecs) >/dev/null 2>&1 || break
done

if [ -z "$base" ]; then
  echo "no base to compare this branch with: build"
  exit 1
fi

if ! changed=$(git diff --name-only "$base" HEAD 2>/dev/null); then
  echo "could not diff the branch against $base: build"
  exit 1
fi

# Paths whose changes never reach the served app. Anything else builds.
runtime=$(printf '%s\n' "$changed" | grep -vE '^(docs/|scripts/|\.github/|supabase/|deployments/.*\.md$|[^/]+\.md$|CLAUDE\.md$)|\.test\.(ts|tsx|mjs)$' | grep -v '^$' || true)
if [ -z "$runtime" ]; then
  echo "only non-runtime files changed since $base: skip the preview"
  exit 0
fi

echo "runtime files changed since $base: build"
exit 1
