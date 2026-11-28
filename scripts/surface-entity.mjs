// The rules a surface entity keeps (ADR 0025 decision 2). A surface entity holds
// a surface's composite pages, the Team Home and the client hub, which read from
// several owners and write none of their tables. The manifest marks it
// `kind: "surface"`; `team` is the only one. It is held to four rules:
//
//   1. it owns no tables                (check-table-ownership.mjs)
//   2. no entity requires it            (here, run by check-requires.mjs)
//   3. its index.ts exports no lib/     (here)
//   4. its lib/ and ui/ import no other entity's door, so only its route
//      bodies reach other doors and it gains no `requires` edge through them;
//      the one named exception is a privacy funnel, listed with its reason (here)
//
// Rules 3 and 4 are ratchets (Khoa, 2026-11-01): what team exported and imported
// when it was flagged is listed in scripts/surface-baseline.json, which only
// shrinks. A new export or import fails; an entry that no longer happens fails
// as stale, so the list is cut as each cluster moves to its owner. The funnel
// exception is not part of the ratchet: it stays until its rows retire one at a
// time (ADR 0025 decision 5).
//
// Rule 4 counts value imports only. A type-only import adds no `requires` edge
// (check-requires and import/no-cycle both skip it), so it is allowed. It reads
// `import … from`, `export … from` and `import("…")` of `@/entities/<other>`
// and `@/entities/<other>/client`; a deeper path into another entity is already
// refused by check-entity-imports.
//
// In the public fork the internal paths are not sent (team's hours actions reach
// htt), so an entry for a file the fork lacks is not stale there: it is skipped,
// as check-access-may skips its own (fork-tree.mjs says which tree this is).
//
// Deliberately dependency-free (Node built-ins only), like the other gates.
import fs from "node:fs";
import path from "node:path";
import { isForkTree } from "./fork-tree.mjs";

export const SURFACE_BASELINE = "scripts/surface-baseline.json";

/** The entities the manifest marks as surfaces. */
export function surfaceEntities(manifest) {
  return Object.entries(manifest.entities)
    .filter(([, e]) => e.kind === "surface")
    .map(([name]) => name);
}

function readBaseline(root) {
  const file = path.join(root, SURFACE_BASELINE);
  if (!fs.existsSync(file)) return { funnels: {}, exports: {}, imports: {} };
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  return { funnels: parsed.funnels ?? {}, exports: parsed.exports ?? {}, imports: parsed.imports ?? {} };
}

function filesUnder(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(full));
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

/** The lib/ modules an entity's index.ts re-exports, as "lib/<path>" without extension. */
export function libExports(root, name, target) {
  const file = path.join(root, target, "index.ts");
  if (!fs.existsSync(file)) return [];
  const src = stripComments(fs.readFileSync(file, "utf8"));
  const out = new Set();
  const self = `@/entities/${name}/`;
  for (const m of src.matchAll(/^\s*export\s[^;]*?from\s+["']([^"']+)["']/gm)) {
    const spec = m[1].startsWith("./") ? m[1].slice(2) : m[1].startsWith(self) ? m[1].slice(self.length) : null;
    if (spec?.startsWith("lib/")) out.add(spec.replace(/\.(ts|tsx)$/, ""));
  }
  return [...out].sort();
}

/** "<rel file> -> <other entity>" for every value import of another entity's door from lib/ or ui/. */
export function doorImports(root, name, target) {
  const out = new Set();
  for (const sub of ["lib", "ui"]) {
    for (const abs of filesUnder(path.join(root, target, sub))) {
      const rel = path.relative(path.join(root, target), abs).split(path.sep).join("/");
      const src = stripComments(fs.readFileSync(abs, "utf8"));
      const specs = [
        ...[...src.matchAll(/^\s*import\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]),
        ...[...src.matchAll(/^\s*export\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]),
        ...[...src.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]),
      ];
      for (const spec of specs) {
        const door = /^@\/entities\/([a-z][a-z0-9-]*)(?:\/client)?$/.exec(spec);
        if (door && door[1] !== name) out.add(`${rel} -> ${door[1]}`);
      }
    }
  }
  return [...out].sort();
}

/** Every problem with the surface entities in this tree; empty when they keep the rules. */
export function surfaceProblems(root, manifest, fork = isForkTree(root)) {
  const problems = [];
  // An entry naming a file this tree lacks is stale upstream, and absent by design in the fork.
  const sentHere = (target, rel) =>
    !fork || [rel, `${rel}.ts`, `${rel}.tsx`].some((f) => fs.existsSync(path.join(root, target, f)));
  const surfaces = surfaceEntities(manifest);
  const baseline = readBaseline(root);
  for (const [name, entity] of Object.entries(manifest.entities)) {
    if (entity.kind !== undefined && entity.kind !== "surface") {
      problems.push(`${name}: kind "${entity.kind}" is not a kind; the one kind is "surface" (ADR 0025)`);
    }
  }
  for (const surface of surfaces) {
    // Rule 2: a surface composes its owners' work; an entity that needed it
    // would make the composites a dependency, the shape ADR 0025 undid.
    for (const [name, entity] of Object.entries(manifest.entities)) {
      const requires = Array.isArray(entity.requires) ? entity.requires : Object.keys(entity.requires ?? {});
      if (requires.includes(surface)) {
        problems.push(`${name} requires ${surface}, a surface entity — nothing may require a surface (ADR 0025 rule 2); ask ${surface}'s owners instead`);
      }
    }
    const target = manifest.entities[surface].target;
    // Rule 3: the door exports no lib/ beyond the listed ones.
    const allowedExports = new Set(baseline.exports[surface] ?? []);
    const exported = libExports(root, surface, target);
    for (const mod of exported) {
      if (!allowedExports.has(mod)) {
        problems.push(`${surface}/index.ts exports ${mod}, but a surface entity's door exports no lib/ (ADR 0025 rule 3); move it to the owner of what it reads`);
      }
    }
    for (const mod of allowedExports) {
      if (!exported.includes(mod) && sentHere(target, mod)) problems.push(`${SURFACE_BASELINE}: ${surface} no longer exports ${mod} — remove it from "exports"; the list only shrinks`);
    }
    // Rule 4: lib/ and ui/ reach no other door, except a listed funnel.
    const funnels = baseline.funnels[surface] ?? {};
    for (const [file, why] of Object.entries(funnels)) {
      if (!String(why ?? "").trim()) problems.push(`${SURFACE_BASELINE}: the ${surface} funnel ${file} carries no reason`);
    }
    const allowedImports = new Set(baseline.imports[surface] ?? []);
    const imports = doorImports(root, surface, target);
    for (const edge of imports) {
      const file = edge.split(" -> ")[0];
      if (file in funnels || allowedImports.has(edge)) continue;
      problems.push(`${surface}/${edge}: a surface entity's lib/ and ui/ reach no other door (ADR 0025 rule 4); only its route bodies may`);
    }
    for (const edge of allowedImports) {
      if (!imports.includes(edge) && sentHere(target, edge.split(" -> ")[0])) problems.push(`${SURFACE_BASELINE}: ${surface}/${edge} no longer happens — remove it from "imports"; the list only shrinks`);
    }
  }
  return problems;
}

/** The ratchet entries as they stand, for --write-surface-baseline. Funnels are kept as written. */
export function currentSurfaceBaseline(root, manifest) {
  const base = readBaseline(root);
  const exports = {};
  const imports = {};
  for (const surface of surfaceEntities(manifest)) {
    const target = manifest.entities[surface].target;
    exports[surface] = libExports(root, surface, target);
    const funnels = base.funnels[surface] ?? {};
    imports[surface] = doorImports(root, surface, target).filter((e) => !(e.split(" -> ")[0] in funnels));
  }
  return { funnels: base.funnels, exports, imports };
}
