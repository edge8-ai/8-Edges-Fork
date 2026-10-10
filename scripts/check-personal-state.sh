#!/usr/bin/env bash
#
# Khoa's security rail. Refuses a commit that would put one person's local or
# agent state into the shared repo, and a push that would put anything but
# main onto the public fork.
#
#   usage: check-personal-state.sh commit            # inspects the staged index
#          check-personal-state.sh push <remote-url>  # reads pre-push's stdin
#
# Why this exists (all in the week of 2026-09-15):
#   - #1468 committed docs/agents/ and an "## Agent skills" block into CLAUDE.md:
#     one developer's agent workflow, auto-loaded into every colleague's agent
#     and, until #1469, mirrored to the public fork.
#   - A git worktree's `.git` FILE, holding the developer's home path, was
#     staged for the fork by a local sync (fixed in #1471).
#   - .infisical.json, naming the company's secrets-manager workspace, sat in a
#     public repo that claims its contents are fabricated.
#   - The public fork carried 326 unfiltered upstream branches for nineteen
#     days because something once pushed every ref to it (deleted 2026-09-19,
#     guarded on the mirror side by check-fork-refs.sh; this rail is the
#     developer side of the same guard).
#   - Three repo-tracked skills under .claude/ carried a person's people.id, a
#     remark about what the board is paid against, a second person's id and
#     three email addresses, one a client's — readable by nineteen
#     collaborators (scrubbed in #1499, 2026-09-19).
# Each of these was a person's local context leaking outward. None was caught
# by the gates, because the gates inspect the tree that becomes main, not what
# a person is about to add to it. This runs at the keyboard instead.
#
# Bypass: there is none by design. `git commit --no-verify` exists, and using
# it on one of these paths is a decision the reviewer will see in the diff.
#
set -euo pipefail

MODE="${1:?usage: check-personal-state.sh commit | push <remote-url>}"

say_blocked() {
  echo "" >&2
  echo "BLOCKED — Khoa's security rail." >&2
  echo "$1" >&2
  echo "" >&2
}

# ── commit: personal or local state in the staged index ─────────────────────
if [ "$MODE" = "commit" ]; then
  fail=0

  # Paths that are someone's machine, not the product. Checked on ADDED paths
  # only, so a file that is already tracked (like .infisical.json today) can
  # still be edited or removed; it just cannot come back once removed.
  added="$(git diff --cached --name-only --diff-filter=A || true)"
  personal='^(docs/agents/|CLAUDE\.local\.md$|\.mcp\.json$|\.infisical\.json$|\.claude/settings\.local\.json$|\.claude/\.credentials\.json$|\.claude/memory/|\.claude/worktrees/|\.vercel/|\.env)'
  hits="$(printf '%s\n' "$added" | grep -E "$personal" || true)"
  if [ -n "$hits" ]; then
    say_blocked "These paths are one person's local or agent state. Committing them is a security risk: they are auto-loaded into every colleague's agent, or they name this developer's machine or accounts, and the public fork mirrors what main holds.
$(printf '  %s\n' $hits)
Keep them out of the repo: agent registration lives in ~/.claude/projects/<repo>/ (see the private tracker note); tool state stays gitignored."
    fail=1
  fi

  # Content rules on anything added or modified.
  changed="$(git diff --cached --name-only --diff-filter=ACM || true)"
  for f in $changed; do
    blob="$(git show ":$f" 2>/dev/null || true)"
    case "$f" in
      CLAUDE.md|*/CLAUDE.md|AGENTS.md)
        if printf '%s\n' "$blob" | grep -qE '^## Agent skills'; then
          say_blocked "$f gains an '## Agent skills' block. That is one person's skill-chain registration, and CLAUDE.md is auto-loaded into every colleague's agent session — a security risk and a working-behaviour leak. It belongs in ~/.claude/projects/<repo>/, not here (#1468 → #1470)."
          fail=1
        fi
        ;;
    esac
    # A home path is a machine, never the product. Docs under docs/ may quote
    # one (they are fork-excluded and human-read); code, config and skills may not.
    case "$f" in docs/*) continue;; esac
    if printf '%s\n' "$blob" | grep -qE '/Users/[A-Za-z0-9._-]+/|/home/[A-Za-z0-9._-]+/'; then
      say_blocked "$f contains a developer's home path. That identifies a machine and a person in a repo that is mirrored publicly — a security risk. Use a relative path or an environment variable."
      fail=1
    fi
  done

  # Repo-tracked agent config is read by every collaborator's agent. A person's
  # id, address or pay does not belong in it; the rules, and the tree-wide gate
  # CI runs so --no-verify cannot get past them, live in one place.
  node "$(dirname "$0")/check-agent-config-privacy.mjs" --staged || fail=1

  [ "$fail" -eq 0 ] && echo "security rail: no personal state staged."
  exit "$fail"
fi

# ── push: only main may ever reach the public fork ──────────────────────────
if [ "$MODE" = "push" ]; then
  REMOTE_URL="${2:-}"
  case "$REMOTE_URL" in
    *8-Edges-Fork*|*8-edges-fork*) ;;
    *) exit 0 ;;   # any other remote is not this rail's business
  esac
  stray=""
  while read -r local_ref local_sha remote_ref remote_sha; do
    [ -z "${remote_ref:-}" ] && continue
    [ "$remote_ref" = "refs/heads/main" ] && continue
    stray="$stray  $remote_ref"$'\n'
  done
  if [ -n "$stray" ]; then
    say_blocked "You are pushing refs other than main to the PUBLIC fork:
$stray
Only the mirror workflow writes to that repo, and it writes one squashed main. Any other ref is unfiltered upstream history in public — this is exactly how 326 branches of client material sat public for nineteen days. Blocked as a security risk."
    exit 1
  fi
  exit 0
fi

echo "check-personal-state.sh: unknown mode '$MODE'" >&2
exit 2
