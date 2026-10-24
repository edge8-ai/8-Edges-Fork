// Whether a checkout is the public fork's tree rather than this repository.
//
// The fork receives this repository minus what .github/fork-sync-exclude.txt
// and the generated exclude list name, so a few gates in `npm run check` find
// their subject missing there: the migrations (the fork builds its database
// from supabase/01-schema.sql), the sync's own inputs under .github/ (excluded
// wholesale), and the generated artifacts of internal tools. Each such gate
// asks this function and says what it skipped, rather than failing a client's
// first `npm run check` on files it was never sent.
//
// Both halves are needed. The sync's exclude list exists only here, and
// supabase/01-schema.sql exists only in the fork (the overlay puts it there),
// so the answer is false in this repository whatever else is deleted, and a
// gate cannot go quiet upstream by accident.
import fs from "node:fs";
import path from "node:path";

export function isForkTree(root) {
  return (
    !fs.existsSync(path.join(root, ".github", "fork-sync-exclude.txt")) &&
    fs.existsSync(path.join(root, "supabase", "01-schema.sql"))
  );
}

/**
 * Whether a test or gate should expect a repo-relative path to exist. Always in
 * this repository, so a file that goes missing here still fails whatever names
 * it. In the fork only when it is there: the sync removed the internal
 * entities and pockets, and a list naming them (a cron, a mount, an atom's
 * entity) describes the upstream, not the fork.
 */
export function expectedHere(root, rel) {
  return !isForkTree(root) || fs.existsSync(path.join(root, rel));
}

/** Prints why a gate has nothing to check in the fork. */
export function skippedInFork(gate, why) {
  console.log(`${gate}: nothing to check in the fork: ${why}`);
}
