#!/bin/sh
#
# Wiring: files that ordinary feature work changes and that other code reads at
# run time rather than through an import. Adding a table edits the entity
# manifest, adding a page or a permission regenerates a registry under app/,
# a schema change adds a migration, and a module the fork must not receive gets
# an overlay stub.
#
# Until PP.2 (2026-11-18) these were shared configuration, so a push carrying
# one paid the whole lint and the whole suite. A replay of 154 pull requests
# found a listed file in 31% of them, and 61 of the 69 commits behind that
# touched nothing but the files below. They are judged by the code tier
# instead, which stays safe for three reasons:
#
#   - Every gate still runs, and the gates are what read these files: the
#     generated registries and the ESLint zones must be fresh (check:generated,
#     check:entity-zones), the manifest must close (check:requires,
#     check:deployment, check:table-ownership), the migrations ratchet holds
#     (check:migrations), and a fork overlay change always runs check:fork-safe
#     (scripts/run-gates.mjs).
#   - A manifest change that moves a lint boundary regenerates
#     eslint.entities.mjs, which is still shared configuration, so that push
#     still pays the whole lint.
#   - scripts/test-related.sh runs every tooling test and every test that names
#     the folder whenever one of these changes, beside the tests the import
#     graph reaches.
#
# Sourced by scripts/test-related.sh, and pinned against scripts/push-scope.sh
# by scripts/pre-push-docs-path.test.mjs: a path here must never also be
# shared configuration, or the list below would be dead.
#
# Read paths on stdin; print the ones that are wiring.
wiring_paths() {
  while IFS= read -r p; do
    [ -z "$p" ] && continue
    case "$p" in
      entities.manifest.json|vercel.json) printf '%s\n' "$p" ;;
      app/events.ts|app/nav.ts|app/env.ts|app/shell.ts|app/search.ts|app/permissions.ts|app/access.ts|app/routines.ts) printf '%s\n' "$p" ;;
      supabase/migrations/*|.github/fork-overlay/*|.github/fork-sync-exclude.generated.txt) printf '%s\n' "$p" ;;
    esac
  done
}
