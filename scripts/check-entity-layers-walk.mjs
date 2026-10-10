// The two pieces of the door-graph walk that outlived check-entity-layers:
// reading a file's *value* imports (type-only ones are erased at build and
// cannot pull an entity in), and resolving a specifier to a repo-relative path.
// check-requires.mjs uses them to measure what each entity actually reaches.
import fs from "node:fs";
import path from "node:path";

export function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/[^\n]*/g, "$1");
}

/**
 * Every static, dynamic and re-export specifier in `source` that survives
 * compilation. `import type`, `export type … from` and an import whose every
 * specifier is inline `type` are erased by TypeScript and load nothing, so a
 * type taken from another entity is not an edge.
 */
export function valueSpecifiers(source) {
  const out = [];
  const src = stripComments(source)
    // A type-only statement is erased only within its own statement (no ";" and
    // no blank line between `type` and `from`), so an `export type X = {...}`
    // followed later by a real value import cannot swallow that import.
    .replace(/\b(import|export)\s+type\s[^;]*?from\s+["'][^"']+["']/g, "")
    .replace(/\bimport\s*\{\s*(type\s+[\w$]+(\s+as\s+[\w$]+)?\s*,\s*)*type\s+[\w$]+(\s+as\s+[\w$]+)?\s*,?\s*\}\s*from\s+["'][^"']+["']/g, "");
  for (const re of [/\bfrom\s+["']([^"']+)["']/g, /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g, /\bimport\s+["']([^"']+)["']/g]) {
    for (const m of src.matchAll(re)) out.push(m[1]);
  }
  return out;
}

/** Repo-relative .ts/.tsx file for a relative or `@/` specifier; null for a package or asset. */
export function resolveLocal(root, spec, importerRel) {
  let stem;
  if (spec.startsWith("@/")) stem = spec.slice(2);
  else if (spec.startsWith("./") || spec.startsWith("../")) {
    stem = path.posix.normalize(path.posix.join(path.posix.dirname(importerRel), spec));
  } else return null;
  if (/\.(css|json|svg|png|jpg|webp)$/.test(stem)) return null;
  const bare = stem.replace(/\.(ts|tsx)$/, "");
  for (const candidate of [`${bare}.ts`, `${bare}.tsx`, `${bare}/index.ts`, `${bare}/index.tsx`]) {
    if (fs.existsSync(path.join(root, candidate))) return candidate;
  }
  return null;
}

/** Layer per entity name, validated: every entity needs a non-negative integer. */
