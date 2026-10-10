// Generates .github/fork-sync-exclude.generated.txt from entities.manifest.json.
//
// .github/fork-sync-exclude.txt is hand-written and stays that way: it names the
// documents, scripts and one-off files that must not leave, and no machine can
// infer those. What a machine CAN infer is the product surface — which entities
// are internal, which pockets of a portable entity are internal, and which app/
// mounts those pockets leave dangling.
//
// That inference is the whole point. The hand-written list is default-allow, so
// entities/htt shipped to two client forks simply because nobody added a line
// for it. A generated list cannot forget: adding an entity without deciding its
// portability now fails validateManifest, and deciding it internal excludes it
// everywhere at once — the entity, its app/ mounts, its crons.
//
//   node scripts/gen-fork-excludes.mjs           write the file
//   node scripts/gen-fork-excludes.mjs --check   fail if it is stale (CI)
//
// Same generate/--check shape as scripts/gen-entity-zones.mjs, and for the same
// reason: a derived file that drifts from its source is worse than no file.
//
// Deliberately dependency-free (Node built-ins only), like the other gates.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadManifest, ownershipEntries } from "./entity-manifest.mjs";
import { nonShippingMounts, sourceFiles } from "./check-portability.mjs";

export const GENERATED_FILE = ".github/fork-sync-exclude.generated.txt";

const HEADER = `# GENERATED — do not edit. Run: npm run gen:fork-excludes
#
# Derived from the \`portability\` and \`internalPaths\` fields in
# entities.manifest.json, plus the app/ mounts those leave with nothing to
# re-export. The hand-written companion is .github/fork-sync-exclude.txt;
# stage-fork-tree.sh reads both.
#
# To change anything here, change the manifest — a line edited here is undone by
# the next generate, and CI fails the drift (npm run check:fork-excludes).
`;

/** Every exclude line the manifest implies, sorted and de-duplicated. */
export function forkExcludes(root, manifest = loadManifest(root)) {
  const entries = ownershipEntries(manifest);
  const lines = new Set();

  for (const [name, entity] of Object.entries(manifest.entities)) {
    if (entity.portability === "internal") {
      lines.add(`${entity.target}/`);
      continue;
    }
    for (const inner of entity.internalPaths ?? []) {
      const rel = `${entity.target}/${inner}`;
      const abs = path.join(root, rel);
      // A directory entry needs its trailing slash for rsync; a file must not
      // have one, or rsync silently matches nothing and the file ships.
      if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
        lines.add(`${rel}/`);
        continue;
      }
      lines.add(rel);
      // shipBlocker() takes a named file's extension siblings with it, so the
      // exclusion has to as well. Naming lib/tokens.ts internal and shipping
      // lib/tokens.test.ts sends the test without the module it imports — and
      // an overlay stub does not save it, because the test asserts the real
      // module's shape, not the stub's.
      const stem = rel.replace(/\.[a-z]+$/i, "");
      if (stem !== rel) lines.add(`${stem}.*`);
    }
  }

  // app/ mounts. Excluding the route FILE leaves its directory behind — empty,
  // but present, and `app/api/htt/backfill/` with nothing in it still reads as
  // htt to anyone opening the fork. Collapse to the highest directory whose
  // every source file is non-shipping, so the surface disappears rather than
  // being hollowed out.
  const files = sourceFiles(root);
  const mounts = nonShippingMounts(root, manifest, entries, files);
  const byDir = new Map();
  for (const rel of files) {
    const dir = rel.slice(0, rel.lastIndexOf("/"));
    const list = byDir.get(dir) ?? [];
    list.push(rel);
    byDir.set(dir, list);
  }
  const allBlocked = (dir) =>
    [...byDir].every(([d, fs_]) => !(d === dir || d.startsWith(`${dir}/`)) || fs_.every((f) => mounts.has(f)));

  for (const mount of mounts.keys()) {
    let best = null;
    let dir = mount.slice(0, mount.lastIndexOf("/"));
    // Never collapse past app/ itself, nor past a Next route group boundary the
    // rest of the tree still needs.
    while (dir.includes("/") && allBlocked(dir)) {
      best = dir;
      dir = dir.slice(0, dir.lastIndexOf("/"));
    }
    lines.add(best ? `${best}/` : mount);
  }

  // What an internal entity owns OUTSIDE entities/: its scripts, its Supabase
  // edge functions. Nothing in the tree records that ownership, so it is
  // declared (`ownedPaths`) rather than guessed from the entity's name — the
  // two Deno functions that write htt.man_hour_entries are called
  // ingest-session-start and ingest-session-end, and no name convention would
  // ever have found them.
  for (const [, entity] of Object.entries(manifest.entities)) {
    if (entity.portability !== "internal") continue;
    for (const owned of entity.ownedPaths ?? []) {
      const abs = path.join(root, owned);
      lines.add(fs.existsSync(abs) && fs.statSync(abs).isDirectory() ? `${owned}/` : owned);
    }
  }

  return [...lines].sort();
}

export function render(root, manifest = loadManifest(root)) {
  const lines = forkExcludes(root, manifest);
  const internal = Object.entries(manifest.entities)
    .filter(([, e]) => e.portability === "internal")
    .map(([n]) => n);
  return (
    HEADER +
    `#\n# ${lines.length} paths: ${internal.length} internal entit${internal.length === 1 ? "y" : "ies"}` +
    `${internal.length ? ` (${internal.join(", ")})` : ""}, their internal pockets, and the app/ mounts left dangling.\n\n` +
    lines.join("\n") +
    "\n"
  );
}

function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(here, "..");
  const file = path.join(root, GENERATED_FILE);
  const next = render(root);

  if (process.argv.includes("--check")) {
    const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
    if (current !== next) {
      console.error(
        `gen-fork-excludes: ${GENERATED_FILE} is stale against entities.manifest.json. ` +
          `Run \`npm run gen:fork-excludes\` and commit the result.`,
      );
      process.exit(1);
    }
    console.log(`gen-fork-excludes: ${GENERATED_FILE} matches the manifest.`);
    return;
  }

  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, next);
  console.log(`gen-fork-excludes: wrote ${GENERATED_FILE} (${forkExcludes(root).length} paths).`);
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
