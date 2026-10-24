// Fails when another entity, or app/, calls more of an entity's raw door
// helpers than it did before.
//
// ADR 0018 (a door answers questions): an entity's `lib/reads.ts` and
// `lib/writes.ts` hold its private builders, thin functions such as
// `selectMeetings(columns)` that hand back a raw PostgREST builder. Until the
// H1 cards, every door did `export * from "./lib/reads"`, so other entities
// called those builders, chose their own columns, added their own filters and
// cast the rows to their own types. That re-spells the owner's rules in every
// caller, lets a renamed column still compile in the caller, and lets
// check:table-ownership count a foreign read as the owner's own. The door is
// meant to export questions and commands instead. This gate holds the line
// while the H1 cards convert the callers: the number of outside calls of each
// raw helper may only go down.
//
// What it counts:
// - A raw helper is an `export const|function|async function` whose name is
//   `select|insert|update|upsert|delete|count` followed by a capital letter, in
//   `entities/<owner>/lib/reads.ts` or `entities/<owner>/lib/writes.ts`.
// - An outside call is `name(` (whitespace allowed before the paren) in a
//   `.ts`/`.tsx` file under `entities/<other>/` or `app/`. `app/` counts as
//   outside every entity. Test files (`*.test.ts(x)`, anything under
//   `__tests__/`) are exempt: a test may build any state it needs. A call
//   inside the owner itself is the owner's business and is not counted.
// - A member call counts too, so `(await import("@/entities/crm")).selectMeetings(`
//   and `crm.selectMeetings(` after `import * as crm` are both seen.
// - An import under another name, `import { selectMeetings as meetings }`,
//   counts each `meetings(` in that file as a call of `selectMeetings`.
//
// Detection is textual, not an AST, like check-table-ownership.mjs, and it
// has the same kind of blunt edges:
// - Comments are stripped, so a commented-out call is not counted; a call
//   spelled inside a string or template literal is.
// - A helper passed as a value (`rows.map(selectX)`, `const q = selectX;
//   q("id")`) is not a call and is not seen. None exists today; a reviewer
//   should read one as an attempt to hide a call.
// - A local function in the calling entity that happens to share a helper's
//   name would be counted against the owner. A declaration itself
//   (`function selectX(`) is not counted, and an entity whose own reads.ts or
//   writes.ts exports the same name is taken to be calling its own. Both
//   errors point the safe way: an over-count fails loudly, it never hides a
//   call.
// - When two other owners export the same helper name, a call is credited to
//   the owner whose door (`@/entities/<owner>`) the calling file names; if it
//   names neither, or both, the call is counted for each.
//
// Baselines: one file per owner, scripts/door-helpers-baseline/<owner>.json,
// `{ "<helper>": <outside calls> }` sorted by helper, listing only helpers
// with outside calls. One file per owner so that the H1 cards, which run in
// parallel, never edit the same file. The gate fails, one line per problem,
// when a helper's outside calls rise above its baseline, when a helper with
// outside calls has no baseline entry, and when a count falls below its
// baseline: a gain is written down by the card that made it, or the next card
// could quietly spend it.
//
//   node scripts/check-door-helpers.mjs                         check
//   node scripts/check-door-helpers.mjs --report                per-owner table
//   node scripts/check-door-helpers.mjs --write-baseline [owner ...]
//   node scripts/check-door-helpers.mjs --root <dir> ...        another tree
//
// `--write-baseline` rewrites the named owners' files (every owner when none
// is named) to the current counts and refuses to raise any count.
// `--allow-raise` lets it raise; it exists for card A.62's first write of the
// baselines and for nothing after it.
//
// In the public fork the internal entities and pockets are gone, so counts
// fall without anyone lowering a baseline. There only a rise fails.
//
// Deliberately dependency-free (Node built-ins only), like the other gates.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isForkTree } from "./fork-tree.mjs";

export const BASELINE_DIR = "scripts/door-helpers-baseline";
const DOOR_FILES = ["lib/reads.ts", "lib/writes.ts"];
const HELPER_DEF =
  /export\s+(?:const|function|async\s+function)\s+((?:select|insert|update|upsert|delete|count)[A-Z][A-Za-z0-9_]*)/g;
const SOURCE = /\.tsx?$/;
const TEST_FILE = /(^|\/)__tests__\/|\.test\.tsx?$/;
const SKIP_DIRS = new Set(["node_modules", ".next"]);

/** Source with block and line comments removed, so a commented-out call is not counted. */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/[^\n]*/g, "$1");
}

function escape(name) {
  return name.replace(/[$]/g, "\\$");
}

/** Every raw helper, as Map<helper, owner[]>. */
export function listHelpers(root) {
  const helpers = new Map();
  const entitiesDir = path.join(root, "entities");
  if (!fs.existsSync(entitiesDir)) return helpers;
  for (const owner of fs.readdirSync(entitiesDir).sort()) {
    for (const rel of DOOR_FILES) {
      const file = path.join(entitiesDir, owner, rel);
      if (!fs.existsSync(file)) continue;
      for (const m of stripComments(fs.readFileSync(file, "utf8")).matchAll(HELPER_DEF)) {
        const owners = helpers.get(m[1]) ?? [];
        if (!owners.includes(owner)) owners.push(owner);
        helpers.set(m[1], owners);
      }
    }
  }
  return helpers;
}

/** The owners that export at least one raw helper. */
export function listOwners(helpers) {
  return [...new Set([...helpers.values()].flat())].sort();
}

/** Non-test .ts/.tsx files under entities/ and app/, with the entity each belongs to ("app" for app/). */
function callerFiles(root) {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(abs);
        continue;
      }
      if (!SOURCE.test(entry.name)) continue;
      const rel = path.relative(root, abs).split(path.sep).join("/");
      if (TEST_FILE.test(rel)) continue;
      const parts = rel.split("/");
      out.push({ file: rel, entity: parts[0] === "app" ? "app" : parts[1] });
    }
  };
  for (const dir of ["entities", "app"]) {
    const abs = path.join(root, dir);
    if (fs.existsSync(abs)) walk(abs);
  }
  return out.sort((a, b) => a.file.localeCompare(b.file));
}

/** Local names a file imports each helper under: Map<helper, Set<localName>>. */
function importedNames(source, helpers) {
  const names = new Map();
  for (const m of source.matchAll(/import\s*(?:type\s+)?\{([^}]*)\}\s*from/g)) {
    for (const spec of m[1].split(",")) {
      const alias = spec.trim().match(/^(?:type\s+)?([A-Za-z0-9_$]+)\s+as\s+([A-Za-z0-9_$]+)$/);
      if (alias && helpers.has(alias[1])) {
        if (!names.has(alias[1])) names.set(alias[1], new Set());
        names.get(alias[1]).add(alias[2]);
      }
    }
  }
  return names;
}

function countCalls(source, name) {
  // Not preceded by a word character (part of a longer name) or by
  // `function ` (a declaration); `.name(` is a member call and counts.
  const re = new RegExp(`(?<![A-Za-z0-9_$])(?<!function\\s+)${escape(name)}\\s*\\(`, "g");
  return (source.match(re) ?? []).length;
}

/**
 * Every outside call, as [{ owner, helper, file, entity, calls }], one row per
 * (owner, helper, file).
 */
export function collectCalls(root, helpers = listHelpers(root)) {
  const rows = [];
  for (const { file, entity } of callerFiles(root)) {
    const source = stripComments(fs.readFileSync(path.join(root, file), "utf8"));
    const aliases = importedNames(source, helpers);
    for (const [helper, owners] of helpers) {
      // An entity that exports the same name itself is calling its own.
      if (owners.includes(entity)) continue;
      let calls = countCalls(source, helper);
      for (const local of aliases.get(helper) ?? []) calls += countCalls(source, local);
      if (calls === 0) continue;
      let credited = owners;
      if (owners.length > 1) {
        const named = owners.filter((o) => new RegExp(`["']@/entities/${escape(o)}(?:/[^"']*)?["']`).test(source));
        if (named.length === 1) credited = named;
      }
      for (const owner of credited) rows.push({ owner, helper, file, entity, calls });
    }
  }
  return rows;
}

/** Current outside calls: { owner: { helper: count } }, for every owner that exports a helper. */
export function measure(root, helpers = listHelpers(root), rows = collectCalls(root, helpers)) {
  const current = {};
  for (const owner of listOwners(helpers)) current[owner] = {};
  for (const r of rows) current[r.owner][r.helper] = (current[r.owner][r.helper] ?? 0) + r.calls;
  return current;
}

function sortKeys(obj) {
  return Object.fromEntries(Object.entries(obj).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

export function serialize(counts) {
  return `${JSON.stringify(sortKeys(Object.fromEntries(Object.entries(counts).filter(([, n]) => n > 0))), null, 2)}\n`;
}

function baselineFile(root, owner) {
  return path.join(root, BASELINE_DIR, `${owner}.json`);
}

/** Every committed baseline: { owner: { helper: count } }. */
export function loadBaselines(root) {
  const dir = path.join(root, BASELINE_DIR);
  const out = {};
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir).sort()) {
    if (!name.endsWith(".json")) continue;
    out[name.slice(0, -".json".length)] = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
  }
  return out;
}

function filesOf(rows, owner, helper) {
  return rows
    .filter((r) => r.owner === owner && r.helper === helper)
    .map((r) => `${r.file} (${r.calls})`)
    .join(", ");
}

/** One line per problem, comparing current counts with the baselines. */
export function compare(current, baselines, rows = [], { fork = false } = {}) {
  const problems = [];
  const owners = [...new Set([...Object.keys(current), ...Object.keys(baselines)])].sort();
  for (const owner of owners) {
    const now = current[owner] ?? {};
    const base = baselines[owner] ?? {};
    const helpers = [...new Set([...Object.keys(now), ...Object.keys(base)])].sort();
    for (const helper of helpers) {
      const n = now[helper] ?? 0;
      const b = base[helper];
      if (n > 0 && b === undefined) {
        problems.push(
          `${owner}: ${helper} is called from outside ${n} time(s) and has no entry in ${BASELINE_DIR}/${owner}.json: ${filesOf(rows, owner, helper)}`,
        );
      } else if (b !== undefined && n > b) {
        problems.push(`${owner}: ${helper} is called from outside ${n} time(s), baseline ${b}: ${filesOf(rows, owner, helper)}`);
      } else if (!fork && b !== undefined && n < b) {
        problems.push(
          `${owner}: ${helper} is called from outside ${n} time(s), baseline ${b}. Stale: lower it with --write-baseline ${owner}`,
        );
      }
    }
  }
  return problems;
}

export function checkDoorHelpers(root) {
  const helpers = listHelpers(root);
  const rows = collectCalls(root, helpers);
  const current = measure(root, helpers, rows);
  const problems = compare(current, loadBaselines(root), rows, { fork: isForkTree(root) });
  return { current, rows, problems };
}

/**
 * Rewrites the named owners' baselines (every owner when none is named) to the
 * current counts. Refuses, writing nothing, when any count would rise, unless
 * allowRaise.
 */
export function writeBaselines(root, owners = [], { allowRaise = false } = {}) {
  const helpers = listHelpers(root);
  const current = measure(root, helpers);
  const baselines = loadBaselines(root);
  const targets = owners.length > 0 ? owners : [...new Set([...Object.keys(current), ...Object.keys(baselines)])].sort();
  const raises = [];
  for (const owner of targets) {
    const now = current[owner] ?? {};
    const base = baselines[owner] ?? {};
    for (const [helper, n] of Object.entries(now)) {
      if (n > (base[helper] ?? 0)) raises.push(`${owner}: ${helper} ${base[helper] ?? 0} -> ${n}`);
    }
  }
  if (raises.length > 0 && !allowRaise) return { written: [], raises };
  fs.mkdirSync(path.join(root, BASELINE_DIR), { recursive: true });
  for (const owner of targets) fs.writeFileSync(baselineFile(root, owner), serialize(current[owner] ?? {}));
  return { written: targets, raises };
}

/** Per-owner summary rows, most call sites first. */
export function report(root) {
  const helpers = listHelpers(root);
  const rows = collectCalls(root, helpers);
  const out = listOwners(helpers).map((owner) => {
    const mine = rows.filter((r) => r.owner === owner);
    return {
      owner,
      helpers: new Set(mine.map((r) => r.helper)).size,
      sites: mine.reduce((a, r) => a + r.calls, 0),
      callers: [...new Set(mine.map((r) => r.entity))].sort(),
    };
  });
  return out.sort((a, b) => b.sites - a.sites || a.owner.localeCompare(b.owner));
}

function totals(current) {
  let helpers = 0;
  let sites = 0;
  for (const counts of Object.values(current)) {
    for (const n of Object.values(counts)) {
      if (n > 0) helpers += 1;
      sites += n;
    }
  }
  return { helpers, sites };
}

function main() {
  const argv = process.argv.slice(2);
  const rootAt = argv.indexOf("--root");
  const root =
    rootAt === -1 ? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..") : path.resolve(argv[rootAt + 1] ?? ".");

  if (argv.includes("--report")) {
    const rows = report(root);
    console.log("owner\thelpers used outside\tcall sites\tcalling entities");
    for (const r of rows) console.log(`${r.owner}\t${r.helpers}\t${r.sites}\t${r.callers.join(", ")}`);
    const all = rows.reduce((a, r) => ({ helpers: a.helpers + r.helpers, sites: a.sites + r.sites }), { helpers: 0, sites: 0 });
    console.log(`\n${all.helpers} raw helper(s) called from outside their owner, at ${all.sites} call site(s).`);
    return;
  }

  const writeAt = argv.indexOf("--write-baseline");
  if (writeAt !== -1) {
    const owners = [];
    for (const arg of argv.slice(writeAt + 1)) {
      if (arg.startsWith("--")) break;
      owners.push(arg);
    }
    const res = writeBaselines(root, owners, { allowRaise: argv.includes("--allow-raise") });
    if (res.written.length === 0 && res.raises.length > 0) {
      for (const line of res.raises) console.error(`would raise ${line}`);
      console.error(
        `\ncheck-door-helpers: refusing to write: ${res.raises.length} count(s) would rise. Outside calls of ` +
          `raw door helpers only go down; call a question or command the owner's door exports (ADR 0018).`,
      );
      process.exit(1);
    }
    for (const line of res.raises) console.log(`  raised: ${line}`);
    console.log(`check-door-helpers: wrote ${res.written.length} baseline file(s) under ${BASELINE_DIR}/.`);
    return;
  }

  const { current, problems } = checkDoorHelpers(root);
  if (problems.length > 0) {
    for (const line of problems) console.error(line);
    console.error(
      `\ncheck-door-helpers: ${problems.length} problem(s). Another entity calls a door's raw reads.ts or ` +
        `writes.ts helper; call a question or command the owner's door exports instead (ADR 0018). ` +
        `\`--report\` lists the call sites per owner. See the header of scripts/check-door-helpers.mjs.`,
    );
    process.exit(1);
  }
  const t = totals(current);
  console.log(
    `check-door-helpers: ${t.helpers} raw door helper(s) called from outside their owner at ${t.sites} ` +
      `call site(s); nothing above baseline.`,
  );
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
