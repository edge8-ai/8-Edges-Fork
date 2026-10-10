// A module-scope read of a value taken through another entity's server door is
// a load-order bug waiting to happen (ME-13). The doors are barrels, several
// entity pairs depend on each other in both directions, and webpack wires a
// re-exported binding as a getter over a module variable that is assigned only
// when the barrel reaches that line — so a file that the barrel pulls in while
// it is still initialising sees `undefined` for anything exported later. That
// is exactly how `next build` failed on /api/stripe/webhook after the shims
// went: company-os → boards → team → hub UI, which built a constant array from
// company-os stage colours at module scope.
//
// Routes, API handlers and crons are entry points, evaluated after every
// barrel they import has finished, so they may read door values at top level
// (the opengraph-image routes do). Anything else under an entity is reachable
// from its own index and must read door values inside a function. The client
// door (client.ts) is a leaf barrel and is exempt.
//
// Detection is textual: a top-level `const`/`let`/`var` whose initialiser is
// not a function and mentions a value imported from `@/entities/<other>`,
// either by name or as a member of a namespace import (`import * as ns`, then
// `ns.y`), and an `export default { ... }` object literal that does the same.
// Known blind spots, left until one bites: a read inside a top-level class
// field or static block, a top-level call expression that is not assigned
// (`register(DOOR)`), a door value reached through a re-export chain the file
// aliases first, and a `default` import from a door (the doors have none).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENTRY = /^entities\/[^/]+\/(routes|api|crons)\//;

function sources() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(path.relative(ROOT, p));
    }
  };
  walk(path.join(ROOT, "entities"));
  return out.sort();
}

/** Names imported as values from another entity's server door. */
export function doorValueImports(source, ownEntity) {
  const names = new Set();
  for (const m of source.matchAll(/import\s+(?!type\b)\{([^}]*)\}\s+from\s+["']@\/entities\/([a-z-]+)["']/g)) {
    if (m[2] === ownEntity) continue;
    for (let n of m[1].split(",")) {
      n = n.trim();
      if (!n || n.startsWith("type ")) continue;
      names.add(n.split(/\s+as\s+/).pop());
    }
  }
  // A namespace import is a live view of the whole barrel; `ns.y` at module
  // scope is the same eager read, so the namespace name counts as a value.
  for (const m of source.matchAll(/import\s+\*\s+as\s+([\w$]+)\s+from\s+["']@\/entities\/([a-z-]+)["']/g)) {
    if (m[2] !== ownEntity) names.add(m[1]);
  }
  return names;
}

/** Top-level bindings whose initialiser reads one of `names` eagerly. */
export function moduleScopeReads(source, names) {
  const hits = [];
  if (names.size === 0) return hits;
  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const isBinding = /^(export\s+)?(const|let|var)\s/.test(lines[i]);
    const isDefault = /^export\s+default\s/.test(lines[i]);
    if (!isBinding && !isDefault) continue;
    let stmt = lines[i];
    let j = i + 1;
    while (j < lines.length && !/^\S/.test(lines[j])) stmt += `\n${lines[j++]}`;
    // `export default { a: DOOR }` is evaluated at load like a binding is; the
    // initialiser is everything after the keyword.
    const init = (isDefault ? stmt.replace(/^export\s+default\s+/, "") : stmt.slice(stmt.indexOf("=") + 1)).trim();
    if (isDefault && /^class\b/.test(init)) continue;
    // A function body runs later; only an eager initialiser is a load-order read.
    if (/^(async\s*)?(\([^)]*\)|[\w$]+)\s*(:[^=]*)?=>/.test(init) || /^(async\s+)?function\b/.test(init)) continue;
    for (const n of names) if (new RegExp(`\\b${n}\\b`).test(init)) hits.push({ line: i + 1, name: n });
  }
  return hits;
}

describe("door values are never read at module scope outside an entry point", () => {
  it("finds no eager read in entity code the index can reach", () => {
    const offenders = [];
    for (const rel of sources()) {
      if (ENTRY.test(rel)) continue;
      const own = rel.split("/")[1];
      const source = fs.readFileSync(path.join(ROOT, rel), "utf8");
      for (const hit of moduleScopeReads(source, doorValueImports(source, own))) {
        offenders.push(`${rel}:${hit.line} reads ${hit.name} at module scope`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("would catch the shape that broke the build", () => {
    const src = `import { STAGE_LEAD, type Card } from "@/entities/company-os";\nconst ACCENTS = [STAGE_LEAD];\nconst lazy = () => [STAGE_LEAD];\n`;
    expect(moduleScopeReads(src, doorValueImports(src, "team"))).toEqual([{ line: 2, name: "STAGE_LEAD" }]);
  });

  it("sees a member read through a namespace import", () => {
    const src = `import * as cos from "@/entities/company-os";\nconst ACCENTS = [cos.STAGE_LEAD];\nconst lazy = () => cos.STAGE_LEAD;\n`;
    expect(moduleScopeReads(src, doorValueImports(src, "team"))).toEqual([{ line: 2, name: "cos" }]);
    expect(doorValueImports(src, "company-os").size).toBe(0);
  });

  it("sees a door value inside an exported default object", () => {
    const src = `import { STAGE_LEAD } from "@/entities/company-os";\nexport default {\n  accent: STAGE_LEAD,\n};\n`;
    expect(moduleScopeReads(src, doorValueImports(src, "team"))).toEqual([{ line: 2, name: "STAGE_LEAD" }]);
    const fn = `import { STAGE_LEAD } from "@/entities/company-os";\nexport default function Page() {\n  return STAGE_LEAD;\n}\n`;
    expect(moduleScopeReads(fn, doorValueImports(fn, "team"))).toEqual([]);
  });
});
