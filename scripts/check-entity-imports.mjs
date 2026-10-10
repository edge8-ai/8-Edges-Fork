// Fails on any cross-entity import that does not go through a door.
//
// Every import in app/, entities/ and kernel/ is resolved to a repo path and
// both ends are mapped to their owner through entities.manifest.json. The
// boundary rules of docs/engineering/2026-09-03-multi-entity-design.md §3 are
// then plain errors, not a ratchet: ME-13 deleted the last old-path shims and
// emptied the baseline this script used to carry, so a single edge fails the
// gate. The ESLint zones from scripts/gen-entity-zones.mjs enforce the same
// rules per file; this script is the whole-tree view and the one that can
// `--explain` a pair.
//
// What counts as an edge: importer owner ≠ target owner, the target is not the
// kernel (everyone may use the kernel), and the target is not one of the other
// entity's doors — index.ts, client.ts for browser code, or upstream.ts for
// code that never leaves this repo (design §3,
// "two doors per entity"). The composition root ("app") is held to rule 1: it
// may import an entity's doors and its routes/, api/ and crons/ files (that is
// what a mount is), and nothing else of the entity. "unassigned" is a real
// owner here so a file the manifest forgot shows up as a pair rather than
// vanishing.
//
// `--explain <pair>` lists the importer → target edges behind one pair, which
// is how a fix finds what to move behind a door.
//
// Deliberately dependency-free (Node built-ins only), like the other gates.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { APP_ROOT, KERNEL, entityOf, loadManifest, ownershipEntries } from "./entity-manifest.mjs";

const SCAN_DIRS = ["app", "entities", "kernel"];
const SKIP_DIRS = new Set(["node_modules", ".next"]);
const SOURCE = /\.(ts|tsx|js|jsx|mjs)$/;
// Test files import across entities to exercise seams; they are not architecture edges.
const TEST_FILE = /(^|\/)__tests__\/|\.test\.(ts|tsx|js|jsx|mjs)$/;

function listSourceFiles(root) {
  const out = [];
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(path.join(d, entry.name));
      } else if (SOURCE.test(entry.name)) {
        const rel = path.relative(root, path.join(d, entry.name)).split(path.sep).join("/");
        if (!TEST_FILE.test(rel)) out.push(rel);
      }
    }
  };
  for (const dir of SCAN_DIRS) {
    const abs = path.join(root, dir);
    if (fs.existsSync(abs)) walk(abs);
  }
  return out.sort();
}

/** Source with block and line comments removed, so a commented-out import is not an edge. */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/[^\n]*/g, "$1");
}

/** Import specifiers in a source string: static, dynamic, re-export and bare. */
export function importSpecifiers(source) {
  source = stripComments(source);
  const specs = [];
  const patterns = [
    /\bfrom\s+["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\bimport\s+["']([^"']+)["']/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const re of patterns) {
    for (const m of source.matchAll(re)) specs.push(m[1]);
  }
  return specs;
}

/**
 * Repo-relative path (without extension or trailing /index) for a specifier
 * that points inside the repo, else null. `@/` is the tsconfig alias for the
 * repo root; anything not relative and not aliased is a package.
 */
export function resolveSpecifier(spec, importerRel) {
  let target;
  if (spec.startsWith("@/")) target = spec.slice(2);
  else if (spec.startsWith("./") || spec.startsWith("../")) {
    target = path.posix.normalize(path.posix.join(path.posix.dirname(importerRel), spec));
  } else return null;
  // Assets and data files (css, json, images) are not code and have no owner.
  const ext = target.match(/\.([a-z0-9]+)$/i)?.[1];
  if (ext && !["ts", "tsx", "js", "mjs", "jsx"].includes(ext)) return null;
  target = target.replace(/\.(ts|tsx|js|mjs|jsx)$/, "").replace(/\/index$/, "");
  return target;
}

/**
 * Whether `target` is one of some entity's doors. resolveSpecifier strips a
 * trailing /index, so `@/entities/site/index` and `@/entities/site` both arrive
 * as the entity's target directory; the client door arrives as
 * `entities/site/client`.
 *
 * The third door, `upstream.ts`, carries the half of an entity that never
 * leaves this repo. It is a door here — a cross-entity import of it is as legal
 * as one of index.ts — because the boundary it belongs to is portability, not
 * encapsulation, and scripts/check-portability.mjs is what enforces that one:
 * the file is an internal path, so any SHIPPING file importing it fails there.
 */
export function isEntityDoor(target, manifest) {
  return Object.values(manifest.entities).some(
    (e) => target === e.target || target === `${e.target}/client` || target === `${e.target}/upstream`,
  );
}

/**
 * Whether `target` is a file the composition root may mount: an entity's
 * routes/, api/ or crons/ (design §3 rule 1). Only app/ gets this allowance —
 * for another entity a route body is as private as anything else.
 */
export function isMountTarget(target, manifest) {
  return Object.values(manifest.entities).some((e) =>
    ["routes", "api", "crons"].some((dir) => target.startsWith(`${e.target}/${dir}/`)),
  );
}

/** Every counted edge in the tree: { importer, target, from, to }. */
export function collectEdges(root, manifest = loadManifest(root)) {
  const entries = ownershipEntries(manifest);
  const edges = [];
  for (const rel of listSourceFiles(root)) {
    const from = entityOf(rel, manifest, entries);
    const source = fs.readFileSync(path.join(root, rel), "utf8");
    for (const spec of importSpecifiers(source)) {
      const target = resolveSpecifier(spec, rel);
      if (!target) continue;
      const to = entityOf(target, manifest, entries);
      if (to === from || to === KERNEL) continue;
      if (isEntityDoor(target, manifest)) continue;
      if (from === APP_ROOT && isMountTarget(target, manifest)) continue;
      edges.push({ importer: rel, target, from, to });
    }
  }
  return edges;
}

/** Per-pair counts, keys "from->to", sorted. */
export function measure(root, manifest = loadManifest(root)) {
  const counts = {};
  for (const e of collectEdges(root, manifest)) {
    const key = `${e.from}->${e.to}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.keys(counts).sort().map((k) => [k, counts[k]]));
}

export function checkEntityImports(root, manifest = loadManifest(root)) {
  const current = measure(root, manifest);
  const violations = Object.entries(current).map(
    ([pair, n]) => `${pair}: ${n} cross-entity import(s) outside the owner's doors`,
  );
  return { current, violations };
}

function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(here, "..");
  const argv = process.argv.slice(2);

  const explainAt = argv.indexOf("--explain");
  if (explainAt !== -1) {
    // Accept "team->company-os" and "team:company-os". The arrow form must be
    // quoted in a shell or ">" becomes a redirect and leaves a stray file named
    // after the target entity at the repo root, which is how two such files got
    // committed-adjacent during stage 3b.
    const pair = argv[explainAt + 1];
    const [from, to] = (pair ?? "").split(/->|:/);
    if (!from || !to) {
      console.error("check-entity-imports: --explain needs a pair, e.g. --explain team:company-os (or quoted 'team->company-os')");
      process.exit(2);
    }
    const edges = collectEdges(root).filter((e) => e.from === from && e.to === to);
    for (const e of edges) console.log(`${e.importer} -> ${e.target}`);
    console.log(`\n${edges.length} edge(s) for ${pair}.`);
    return;
  }

  const { violations } = checkEntityImports(root);
  if (violations.length > 0) {
    for (const line of violations) console.error(line);
    console.error(
      `\ncheck-entity-imports: ${violations.length} pair(s) cross an entity boundary. Import ` +
        `through the entity's index.ts (client.ts from browser code) or move the shared piece into ` +
        `kernel/. Run \`node scripts/check-entity-imports.mjs --explain <pair>\` to list the edges. ` +
        `See the header of scripts/check-entity-imports.mjs.`,
    );
    process.exit(1);
  }
  console.log("check-entity-imports: no cross-entity import outside the owners' doors.");
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
