#!/bin/sh
#
# Run a command while holding the one machine-wide lock for `npm run check`.
#
#   usage: with-check-lock.sh <command> [args...]
#
# The pre-push hook runs the whole gate: tsc, lint, knip and ~630 vitest files
# on cores-1 workers. One run fits this laptop. On 2026-10-07 three worktrees
# pushed within minutes of each other, so three gates ran at once: load average
# 94 on 8 cores, 5.3 GB of swap in use, a push that took ten minutes, and two
# of them refused on tests that pass alone in 36 s (S.20). A test timeout is a
# wall clock, and every CPU-bound test ran 4-12x slower than its budget.
#
# So gates queue. The lock is a directory, because mkdir is atomic and this Mac
# has no flock(1); the holder's pid sits inside it so a gate that died takes
# its lock with it instead of blocking everyone until a reboot. The wait is
# bounded: past the limit the gate runs anyway, which is what it did before
# this script, with a line saying so. A push is never refused for the lock.
#
# Not -e: the gate's exit status is the point, and -e would exit on it before
# the status is read.
set -u

LOCK_DIR="${EDGE8_CHECK_LOCK_DIR:-${TMPDIR:-/tmp}/edge8-web-check.lock}"
# Seconds between polls, and the most seconds to wait in all. Three queued
# gates at idle speed fit comfortably inside the limit.
POLL="${EDGE8_CHECK_LOCK_POLL:-5}"
LIMIT="${EDGE8_CHECK_LOCK_LIMIT:-1200}"

holder_pid() {
  cat "$LOCK_DIR/pid" 2>/dev/null || true
}

acquire() {
  waited=0
  announced=0
  while ! mkdir "$LOCK_DIR" 2>/dev/null; do
    pid="$(holder_pid)"
    # An empty pid file is a lock mid-creation: give it one poll before
    # calling it stale.
    if [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null; then
      echo "check-lock: process $pid held the lock and is gone; taking it over"
      rm -rf "$LOCK_DIR"
      continue
    fi
    if [ "$waited" -ge "$LIMIT" ]; then
      echo "check-lock: waited ${LIMIT}s for process ${pid:-?}; running alongside it"
      return 1
    fi
    if [ "$announced" -eq 0 ] || [ $((waited % 60)) -eq 0 ]; then
      echo "check-lock: another npm run check (pid ${pid:-?}) is running on this machine; waiting (${waited}s)"
      announced=1
    fi
    sleep "$POLL"
    waited=$((waited + POLL))
  done
  echo "$$" > "$LOCK_DIR/pid"
  return 0
}

held=0
if acquire; then
  held=1
  # Release on any exit, including a signal that interrupts the gate.
  trap 'rm -rf "$LOCK_DIR"' EXIT INT TERM HUP
fi

status=0
"$@" || status=$?
if [ "$held" -eq 1 ]; then
  rm -rf "$LOCK_DIR"
  trap - EXIT INT TERM HUP
fi
exit "$status"
