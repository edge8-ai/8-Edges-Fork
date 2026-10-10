#!/usr/bin/env node
// Cascade guard for the design system's layered stylesheets.
//
// The layers do not all load everywhere:
//   - app/styles/tokens.css and app/globals.css load on EVERY page (the root
//     layout imports them), so their classes are always available.
//   - app/styles/utilities.css (the `.u-*` layer) and
//     app/styles/site-components.css (the shared `body .site-*` layer) load
//     ONLY where a route layout imports them, AFTER that route's own sheet so
//     they win the cascade.
//   - app/admin/admin.css loads on the OS surfaces (admin, team, portal) via
//     their (dashboard)/(auth) layouts.
//
// So a class is only safe on a given page if a stylesheet defining it is
// reachable from that page's layout chain. Two mistakes break this, and both
// shipped during the migration before this check existed:
//
//   1. A component rendered by the ROOT layout (the nav, the footer, anything
//      SiteFrame pulls in) uses a `.u-*` class. Utilities never load at the
//      root, so the class is inert on every page. This is the footer bug.
//   2. A page under a route with no layout importing utilities uses `.u-*`
//      (the Vietnam pages). Same silent failure.
//
// This script fails the build on both. It resolves the class -> stylesheet map
// from the CSS itself and the reachable-sheet set from the layout chain, so it
// stays correct as sheets move. Deliberately dependency-free (Node built-ins),
// like the other ratchets.
//
//   node scripts/check-utilities-scope.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The tree being checked. `collectErrors` sets it, so the test can point the
// whole gate at a fixture tree instead of the repo; the gate itself passes the
// repo root and nothing else ever changes it mid-run.
let ROOT = process.cwd();
const GLOBAL_SHEETS = ["app/styles/tokens.css", "app/globals.css"];
const SKIP_DIRS = new Set(["node_modules", ".next"]);

/** Every class selector defined in a stylesheet (subject classes and those in
 *  descendant/compound selectors alike — if the rule exists, the class is
 *  styled). Returns a Set of bare class names. */
function classesDefinedIn(cssPath) {
  const abs = path.join(ROOT, cssPath);
  if (!fs.existsSync(abs)) return new Set();
  const css = fs.readFileSync(abs, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const out = new Set();
  for (const m of css.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) out.add(m[1]);
  return out;
}

/** All stylesheet paths under app/, so we can map any class to its sheets. */
function allStylesheets() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".css")) out.push(path.relative(ROOT, p).split(path.sep).join("/"));
    }
  };
  walk(path.join(ROOT, "app"));
  return out;
}

/** class name -> Set of stylesheet paths that define it. */
function buildClassIndex() {
  const index = new Map();
  for (const sheet of allStylesheets()) {
    for (const cls of classesDefinedIn(sheet)) {
      if (!index.has(cls)) index.set(cls, new Set());
      index.get(cls).add(sheet);
    }
  }
  return index;
}

/** The CSS files a layout.tsx imports, as repo-relative paths. Resolves
 *  `./x.css`, `../x.css` and `@/app/...` / `@/...` forms. */
function cssImportsOf(tsxPath) {
  const abs = path.join(ROOT, tsxPath);
  if (!fs.existsSync(abs)) return [];
  const src = fs.readFileSync(abs, "utf8");
  const out = [];
  for (const m of src.matchAll(/import\s+['"]([^'"]+\.css)['"]/g)) {
    const spec = m[1];
    let rel;
    if (spec.startsWith("@/")) rel = spec.slice(2);
    else rel = path.relative(ROOT, path.resolve(path.dirname(abs), spec)).split(path.sep).join("/");
    out.push(rel);
  }
  return out;
}

/** Every stylesheet reachable from a file's route: the global sheets plus the
 *  CSS imported by any layout.tsx from the file's directory up to app/. */
function reachableSheets(filePath) {
  const sheets = new Set(GLOBAL_SHEETS);
  // A file may import its own stylesheet directly (a pattern page pulling in
  // the sheets it documents), not only inherit one from a layout.
  for (const css of cssImportsOf(filePath)) sheets.add(css);
  let dir = path.dirname(path.join(ROOT, filePath));
  const appDir = path.join(ROOT, "app");
  while (dir.startsWith(appDir)) {
    const layout = path.join(dir, "layout.tsx");
    if (fs.existsSync(layout)) {
      for (const css of cssImportsOf(path.relative(ROOT, layout).split(path.sep).join("/"))) sheets.add(css);
    }
    if (dir === appDir) break;
    dir = path.dirname(dir);
  }
  // app/layout.tsx (the root) is included by the walk above when dir === app.
  return sheets;
}

/** The component/source files rendered by the root layout: SiteFrame and its
 *  transitive local imports. These render on EVERY page, including the bare
 *  root, so they may use only globally-defined classes. */
function rootRenderSet() {
  const seen = moduleClosure("app/layout.tsx");
  seen.delete("app/layout.tsx");
  return seen;
}

/** Resolves a module specifier written in `fromFile` to a repo-relative source
 *  path, or null for a package import or anything with no file behind it. */
function resolveSpecifier(spec, fromFile) {
  let rel;
  if (spec.startsWith("@/")) rel = spec.slice(2);
  else if (spec.startsWith(".")) {
    const dir = path.dirname(path.join(ROOT, fromFile));
    rel = path.relative(ROOT, path.resolve(dir, spec)).split(path.sep).join("/");
  } else return null; // package import
  for (const ext of [".tsx", ".ts", "/index.tsx", "/index.ts"]) {
    if (fs.existsSync(path.join(ROOT, rel + ext))) return rel + ext;
  }
  // A bare specifier may name a directory (`@/entities/site` resolves to its
  // index.ts, handled above); only an actual file is a source to read.
  const direct = path.join(ROOT, rel);
  if (fs.existsSync(direct) && fs.statSync(direct).isFile()) return rel;
  return null;
}

/** The bindings of an import/export clause as `{ source, local }` pairs —
 *  `source` is the name in the module being imported FROM, `local` the name
 *  the importing file sees. Returns null when the clause takes everything
 *  (`* as ns`, `export *`), which no name filter can narrow. */
function parseClause(clause) {
  const text = clause.trim();
  if (text.includes("*")) return null;
  const pairs = [];
  const brace = text.match(/\{([\s\S]*)\}/);
  if (brace) {
    for (const raw of brace[1].split(",")) {
      const part = raw.trim().replace(/^type\s+/, "");
      if (!part) continue;
      const as = part.split(/\s+as\s+/);
      pairs.push({ source: as[0].trim(), local: (as[1] ?? as[0]).trim() });
    }
  }
  // A default binding sits outside the braces: `Foo`, or `Foo, { A }`.
  const head = text.split("{")[0].replace(/,\s*$/, "").trim();
  if (head) pairs.push({ source: "default", local: head });
  // Anything that is not a plain identifier means the clause was not really a
  // clause (a stray `from` inside a template string, say). Give up on the
  // names rather than trust a bad parse — the caller then walks everything.
  const IDENT = /^[A-Za-z_$][\w$]*$/;
  if (pairs.some((p) => !IDENT.test(p.source) || !IDENT.test(p.local))) return null;
  return pairs;
}

/** Memoised: every `{ file, names }` edge out of a source file. `names` is the
 *  set of names taken from that file, or null for "everything".
 *
 *  Both `import ... from "x"` and the `export { default } from "@/entities/…"`
 *  form are followed. The re-export form is what every file under app/ is
 *  since the entity move: the markup lives behind it, so a walker that ignored
 *  it would see an empty file and check nothing. Type-only imports are
 *  skipped: a type never renders a class name. */
function edgesOf(f) {
  const cached = importCache.get(f);
  if (cached) return cached;
  const out = [];
  importCache.set(f, out); // set first: an import cycle must not recurse forever
  const abs = path.join(ROOT, f);
  if (!fs.existsSync(abs)) return out;
  const src = fs.readFileSync(abs, "utf8");
  for (const m of src.matchAll(/\b(?:import|export)\s+(type\s+)?([^'"();=]*?)\bfrom\s*['"]([^'"]+)['"]/g)) {
    if (m[1]) continue; // `import type { … } from` — no runtime markup behind it
    const spec = m[3];
    if (spec.endsWith(".css")) continue;
    const file = resolveSpecifier(spec, f);
    if (!file) continue;
    const pairs = parseClause(m[2]);
    out.push({ file, names: pairs ? new Set(pairs.map((p) => p.source)) : null });
  }
  // Side-effect imports (`import "./x"`) bring the whole module in.
  for (const m of src.matchAll(/\bimport\s*['"]([^'"]+)['"]/g)) {
    if (m[1].endsWith(".css")) continue;
    const file = resolveSpecifier(m[1], f);
    if (file) out.push({ file, names: null });
  }
  return out;
}
let importCache = new Map();

/** Memoised: what a file's `export … from "…"` lines forward.
 *  `named` maps an exported name to `{ file, name }` in the module behind it;
 *  `stars` lists the files behind `export * from "…"`, whose names are only
 *  knowable by looking inside them. */
function reexports(f) {
  const cached = reexportCache.get(f);
  if (cached) return cached;
  const out = { named: new Map(), stars: [] };
  reexportCache.set(f, out);
  const abs = path.join(ROOT, f);
  if (!fs.existsSync(abs)) return out;
  const src = fs.readFileSync(abs, "utf8");
  for (const m of src.matchAll(/\bexport\s+(type\s+)?([^'"();=]*?)\bfrom\s*['"]([^'"]+)['"]/g)) {
    if (m[1]) continue;
    const file = resolveSpecifier(m[3], f);
    if (!file) continue;
    const pairs = parseClause(m[2]);
    if (pairs) for (const p of pairs) out.named.set(p.local, { file, name: p.source });
    else out.stars.push(file);
  }
  return out;
}
let reexportCache = new Map();

/** True when `f` itself declares the export `name` (rather than forwarding
 *  it), so `f` is where that symbol's markup lives. */
function declaresExport(f, name) {
  const abs = path.join(ROOT, f);
  if (!fs.existsSync(abs)) return false;
  const src = fs.readFileSync(abs, "utf8");
  if (name === "default") return /\bexport\s+default\b/.test(src);
  const decl = new RegExp(`\\bexport\\s+(?:async\\s+)?(?:function|const|let|var|class|enum)\\s+${name}\\b`);
  if (decl.test(src)) return true;
  // `export { Foo }` with no `from`: a local binding re-exported by name.
  for (const m of src.matchAll(/\bexport\s*\{([^}]*)\}\s*(?!\s*from)/g)) {
    if (m[1].split(",").some((p) => p.trim().split(/\s+as\s+/).pop().trim() === name)) return true;
  }
  return false;
}

/** The file that actually declares `name` as seen through `f`, following
 *  re-export chains and `export *` barrels. Null when the chain cannot be
 *  followed — the caller then falls back to walking everything, so an unparsed
 *  shape can only make the check stricter, never blinder. */
function resolveExport(f, name, guard = new Set()) {
  const key = `${f}|${name}`;
  if (guard.has(key)) return null;
  guard.add(key);
  if (resolveCache.has(key)) return resolveCache.get(key);
  let answer = null;
  if (declaresExport(f, name)) answer = f;
  else {
    const { named, stars } = reexports(f);
    const direct = named.get(name);
    if (direct) answer = resolveExport(direct.file, direct.name, guard);
    else for (const s of stars) {
      answer = resolveExport(s, name, guard);
      if (answer) break;
    }
  }
  resolveCache.set(key, answer);
  return answer;
}
let resolveCache = new Map();

/** The edges behind names `f` declares as plain aliases of imports — `export
 *  const SiteFrame: T = SiteFrameProvided;` — or null when any requested name is
 *  declared some other way. app/shell.ts is made of such lines: the root
 *  layout takes SiteFrame from it, and following every import of the module
 *  would say the root renders each page slot's provider too (the member's
 *  claims, a trip's cost), which only the pages that take a slot render. A
 *  name bound to a literal or a local value (a fallback) adds no edge. Null
 *  makes the caller walk everything, so a shape this does not read only makes
 *  the check stricter. */
function aliasedImports(f, names) {
  const abs = path.join(ROOT, f);
  if (!fs.existsSync(abs)) return null;
  const src = fs.readFileSync(abs, "utf8");
  const targets = [];
  for (const name of names) {
    const m = src.match(new RegExp(`\\bexport\\s+const\\s+${name}\\b[^;]*?=\\s*([A-Za-z_$][\\w$]*)\\s*;`));
    if (!m) return null;
    targets.push(m[1]);
  }
  const edges = [];
  for (const m of src.matchAll(/\bimport\s+(type\s+)?([^'"();=]*?)\bfrom\s*['"]([^'"]+)['"]/g)) {
    if (m[1]) continue;
    const pairs = parseClause(m[2]);
    if (!pairs) return null;
    const wanted = pairs.filter((p) => targets.includes(p.local));
    if (wanted.length === 0) continue;
    const file = resolveSpecifier(m[3], f);
    if (file) edges.push({ file, names: new Set(wanted.map((p) => p.source)) });
  }
  return edges;
}

/** True when `f` declares any of these names itself — then it is a real source
 *  file reached by name, not a barrel, and everything it imports renders with
 *  it. */
function declaresAny(f, names) {
  return [...names].some((n) => declaresExport(f, n));
}

/** Every source file reachable from `entry` through imports and re-exports,
 *  `entry` included.
 *
 *  The walk is name-aware, and that is the whole point: an entity door is a
 *  barrel over the entity's entire UI, so following it wholesale would say the
 *  privacy page renders the sprint board. When a file's requested names are all
 *  satisfied by its own `export … from` lines it is a pass-through, and only
 *  those lines are followed. */
function moduleClosure(entry) {
  const seen = new Set();
  const done = new Set();
  const queue = [[entry, null]];
  while (queue.length) {
    const [f, names] = queue.shift();
    const key = `${f}|${names ? [...names].sort().join(",") : "*"}`;
    if (done.has(key)) continue;
    done.add(key);
    seen.add(f);
    if (names && names.size && !declaresAny(f, names)) {
      const owners = [...names].map((n) => resolveExport(f, n));
      if (owners.every(Boolean)) {
        for (const owner of owners) queue.push([owner, null]);
        continue; // a pure pass-through: its other imports render nothing here
      }
    }
    const aliased = names && names.size ? aliasedImports(f, names) : null;
    if (aliased) {
      for (const e of aliased) queue.push([e.file, e.names]);
      continue; // each name is an alias of one import; the others render nothing here
    }
    for (const e of edgesOf(f)) queue.push([e.file, e.names]);
  }
  return seen;
}

/** Classes referenced in a tsx file's className attributes (string and
 *  template-literal forms), restricted to the design-system namespaces. */
function referencedClasses(src) {
  const out = new Set();
  for (const m of src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{"([^"]*)"\})/g)) {
    const body = m[1] ?? m[2] ?? m[3] ?? "";
    for (const tok of body.split(/[\s${}()?:"'`]+/)) {
      if (/^(u|site)-[a-z]/.test(tok)) out.add(tok);
    }
  }
  return out;
}

/** Memoised `referencedClasses` for a repo-relative source file. */
function classesOf(f) {
  const cached = classCache.get(f);
  if (cached) return cached;
  const abs = path.join(ROOT, f);
  const refs = fs.existsSync(abs) ? referencedClasses(fs.readFileSync(abs, "utf8")) : new Set();
  classCache.set(f, refs);
  return refs;
}
let classCache = new Map();

function* tsxFiles(dir) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) yield* tsxFiles(rel);
    else if (e.name.endsWith(".tsx")) yield rel;
  }
}

/** Every utilities-scope problem in the tree at `root` (the repo root when the
 *  gate runs; a fixture tree in the test). */
export function collectErrors(root = process.cwd()) {
  ROOT = root;
  importCache = new Map();
  reexportCache = new Map();
  resolveCache = new Map();
  classCache = new Map();

  const index = buildClassIndex();
  const rootSet = rootRenderSet();
  const errors = [];

  // Rule 1 — the root-render set may use only globally-defined classes.
  for (const f of rootSet) {
    if (!f.endsWith(".tsx")) continue;
    for (const cls of classesOf(f)) {
      const sheets = index.get(cls) ?? new Set();
      const global = [...sheets].some((s) => GLOBAL_SHEETS.includes(s));
      if (!global) {
        errors.push(
          `${f}: uses "${cls}", but this file is rendered by the root layout and ` +
          `"${cls}" is only in ${[...sheets].join(", ") || "no stylesheet"}, which the root does not load. ` +
          `Use a class defined in app/globals.css, or move this rule there.`,
        );
      }
    }
  }

  // Rule 2 — every app/ route may use only classes a reachable sheet defines.
  //
  // Since the entity move every file under app/ is a thin re-export mount and
  // the markup lives under entities/, so reading the mount's own text finds no
  // classes at all. The rule therefore walks each mount's whole module closure
  // — the entity route body it re-exports, and everything that body imports —
  // and holds every class those files name against the sheets THIS route's
  // layout chain loads. The layout chain is still read from app/, because the
  // route stylesheets and the layouts that import them stayed with the mounts.
  const reported = new Set();
  for (const mount of tsxFiles("app")) {
    if (rootSet.has(mount)) continue; // already covered, and by the stricter rule
    // A test file under app/ is not a route: it imports many route bodies at
    // once and sits in no layout chain, so every class they use would look
    // unreachable. Only what Next actually renders is a mount.
    if (/(^|\/)__tests__\//.test(mount) || mount.endsWith(".test.tsx")) continue;
    const reach = reachableSheets(mount);
    for (const f of moduleClosure(mount)) {
      if (rootSet.has(f)) continue;
      for (const cls of classesOf(f)) {
        const sheets = index.get(cls) ?? new Set();
        if ([...sheets].some((s) => reach.has(s))) continue;
        // One shared component is reached from many mounts; report each
        // mount/file/class triple once so a widely-used file cannot bury the
        // list under the same problem repeated.
        const key = `${mount}|${f}|${cls}`;
        if (reported.has(key)) continue;
        reported.add(key);
        errors.push(
          `${f}: uses "${cls}", but no stylesheet in the layout chain of ${mount} defines it ` +
          `(${[...sheets].join(", ") || "no stylesheet defines it at all"}). ` +
          `Add the import to a layout, or use a class this route already loads.`,
        );
      }
    }
  }

  return errors;
}

function main() {
  const errors = collectErrors(process.cwd());
  if (errors.length) {
    console.error(`\n${errors.length} utilities-scope problem(s):\n\n  - ${errors.join("\n  - ")}\n`);
    process.exit(1);
  }
  console.log(`utilities scope OK: root-render set and every app/ route reach the classes they use.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

