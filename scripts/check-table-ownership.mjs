// Fails when an entity writes a table it does not own, or when its reads of
// another entity's tables grow.
//
// Design rule 5 (docs/engineering/2026-09-03-multi-entity-design.md §3): every
// Supabase table has exactly one owner, declared as a `tables` array on the
// kernel and on each entity in entities.manifest.json. The owner is the only
// entity that may write the table directly; everyone else goes through the
// owner's index or an RPC. Reads are softer: a read of another entity's table
// is counted per ordered pair ("team->company-os") and may not exceed the
// committed baseline in scripts/table-ownership-baseline.json, which only
// shrinks. Kernel tables (identity: people, admins, team_members, ...; the
// messaging log interactions) are readable by all but written only through
// kernel/identity/writes.ts and kernel/messaging/writes.ts, and the
// composition root "app" counts like an entity. A write of another owner's
// table fails outright. ME-02 turned the gate on with an allowlist of the 87
// writes it found; ME-13 emptied it by splitting the kernel's write helpers
// into their owners, correcting ownership where the design named a table's
// reader rather than its writer, and moving every remaining write behind a
// writer the owner exports (entities/*/lib/writes.ts for an entity, the two
// kernel writers for the kernel).
//
// Ownership is validated against the generated types
// (kernel/data/supabase/database.types.ts): every table and view in the
// public, company_os and htt schemas must be owned once. A table the manifest
// owns twice, or not at all, fails the gate. A manifest table the types do
// not know is fine while some file still reads it (a few tables predate the
// generated snapshot or live in the marketing project's own database); one
// that nothing references either is a typo and fails.
//
// Detection is textual, not an AST, and deliberately blunt:
// - An access is `.from("table")` / `.from('table')` on any client
//   (supabase, companyOs, htt, a cookie-session client), OR a PostgREST
//   embedded select inside a select list — `alias:table!fk(cols)`,
//   `table!fk(cols)`, `table(cols)` — which reads the embedded table with no
//   `.from(` anywhere near it. `.rpc("name")` is ignored: RPCs are the
//   sanctioned door. `storage.from("bucket")` is a bucket, not a table, and is
//   skipped. An embed can only READ; a cross-entity write still needs
//   `.from(`, so the embed hole undercounted reads and never let a write past.
// - The statement is the text from `.from(` to the next `;` or `,` at paren
//   depth zero, the next `.from(` at depth zero, the end of the enclosing
//   expression (the unmatched `)` that closes it), or the end of the file. If that text contains `.insert(`,
//   `.update(`, `.upsert(` or `.delete(` the access is a WRITE, else a READ.
// - Known blunt cases: a chain built across several statements
//   (`let q = db.from("x"); q = q.update(...)`) is seen as a read; a statement
//   that mentions `.update(` for a different reason (a Map, a second chain
//   inside a callback on the same statement) is seen as a write; a `.from(`
//   in a template literal or string is seen. All of these are rare here and a
//   false write surfaces as a loud failure, which is the safe direction.
// - A name instead of a string (`.from(TABLE)`) is resolved through a
//   file-level `const TABLE = "literal"` and then counts like the literal. A
//   name that does not resolve (a parameter, an import) is ignored in a read
//   and is a violation in a write: the gate cannot tell whose table a runtime
//   name is, so a write has to name its table or dispatch to the owner's
//   writer (the 2026-09-05 bug-hunt found four such writes to other entities'
//   tables — client_backlog_items, client_roadmap_groups, ideas,
//   equipment_requests — that the literal-only scan had never seen).
// - A select list is read from the argument of `.select(...)` when that is a
//   string or a file-level constant, and from every file-level constant whose
//   name ends in SELECT or Select, which is how this repo holds a list several
//   queries interpolate. A list assembled at runtime, or passed into a door
//   helper from a caller that does not name it in either of those two ways, is
//   still invisible — the remaining blunt case, and the reason `audit:parity`
//   exists alongside this gate.
// - Tests are skipped, like check-entity-imports, and comments are stripped
//   so a commented-out query is not an edge.
//
// `--write-baseline` regenerates the read baseline and refuses to raise any
// pair — the ratchet only shrinks. `--allow-raise "<reason>"` is the one way
// past that, and it writes the reason into the baseline as `_raised`, because
// the question the next reader has is whether a number went up because
// coupling grew or because this scanner started seeing a shape it had always
// missed. `--explain <pair>` lists the file → table edges behind one pair.
//
// Deliberately dependency-free (Node built-ins only), like the other gates.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { KERNEL, entityOf, loadManifest, ownershipEntries } from "./entity-manifest.mjs";

export const BASELINE_FILE = "scripts/table-ownership-baseline.json";
export const TYPES_FILE = "kernel/data/supabase/database.types.ts";
export const SCHEMAS = ["public", "company_os", "htt"];
export 
const SCAN_DIRS = ["app", "entities", "kernel"];
const SKIP_DIRS = new Set(["node_modules", ".next"]);
const SOURCE = /\.(ts|tsx|js|jsx|mjs)$/;
// Test files reach into any table to set up state; they are not architecture edges.
const TEST_FILE = /(^|\/)__tests__\/|\.test\.(ts|tsx|js|jsx|mjs)$/;
const WRITE_CALL = /\.(insert|update|upsert|delete)\s*\(/;

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

/** Source with block and line comments removed, so a commented-out query is not an edge. */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/[^\n]*/g, "$1");
}

/**
 * Every table and view in the generated types, as [{ schema, name, kind }].
 * The generated file nests `<schema>: { Tables: { <name>: { ... } } Views: {...} }`
 * with fixed two-space indentation, so the parse walks indentation rather than
 * a full TypeScript grammar. A schema with no tables is emitted as
 * `[_ in never]: never` and yields nothing.
 */
export function listTables(root, file = path.join(root, TYPES_FILE)) {
  const lines = fs.readFileSync(file, "utf8").split("\n");
  const out = [];
  let schema = null;
  let section = null;
  let inDatabase = false;
  for (const line of lines) {
    // The file also carries a `Constants` object with the same schema names;
    // only the `Database` type's schemas carry Tables/Views.
    if (/^export type Database = \{/.test(line)) { inDatabase = true; continue; }
    if (inDatabase && /^\}/.test(line)) { inDatabase = false; schema = null; continue; }
    if (!inDatabase) continue;
    let m;
    if ((m = line.match(/^  ([A-Za-z_][A-Za-z0-9_]*): \{$/))) {
      schema = SCHEMAS.includes(m[1]) ? m[1] : null;
      section = null;
    } else if (schema && (m = line.match(/^    (Tables|Views|Functions|Enums|CompositeTypes): \{$/))) {
      section = m[1] === "Tables" ? "table" : m[1] === "Views" ? "view" : null;
    } else if (schema && section && (m = line.match(/^      ([A-Za-z_][A-Za-z0-9_]*): \{$/))) {
      out.push({ schema, name: m[1], kind: section });
    }
  }
  return out;
}

/** Owner per declared table name: { tableName: owner }. Throws on a table owned twice. */
export function tableOwners(manifest) {
  const owners = {};
  const claim = (name, owner) => {
    if (owners[name] && owners[name] !== owner) {
      throw new Error(`table "${name}" is owned by both ${owners[name]} and ${owner}`);
    }
    owners[name] = owner;
  };
  for (const name of manifest.kernel.tables ?? []) claim(name, KERNEL);
  for (const [entity, def] of Object.entries(manifest.entities)) {
    for (const name of def.tables ?? []) claim(name, entity);
  }
  return owners;
}

/**
 * Problems with the declared ownership against the generated types: tables
 * owned twice, tables the types know but nobody owns, and declared tables
 * that neither the types nor any scanned file (`referenced`) know. Empty
 * means the manifest is sound.
 */
export function validateOwnership(manifest, tables, referenced = new Set()) {
  const problems = [];
  const seen = new Map();
  const declare = (name, owner) => {
    if (seen.has(name) && seen.get(name) !== owner) {
      problems.push(`table "${name}" is owned by both ${seen.get(name)} and ${owner}`);
    } else if (seen.has(name)) {
      problems.push(`table "${name}" is listed twice under ${owner}`);
    }
    seen.set(name, owner);
  };
  for (const name of manifest.kernel.tables ?? []) declare(name, KERNEL);
  for (const [entity, def] of Object.entries(manifest.entities)) {
    for (const name of def.tables ?? []) declare(name, entity);
  }
  const known = new Set(tables.map((t) => t.name));
  for (const t of tables) {
    if (!seen.has(t.name)) problems.push(`${t.schema}.${t.name} (${t.kind}) has no owner in entities.manifest.json`);
  }
  for (const name of seen.keys()) {
    if (!known.has(name) && !referenced.has(name)) {
      problems.push(`table "${name}" is declared in entities.manifest.json but neither ${TYPES_FILE} nor any file knows it`);
    }
  }
  return problems;
}

/**
 * The text of the statement that starts at `start` (the index of `.from(`):
 * up to the first `;` at paren depth zero, or the `)` that closes the
 * enclosing expression, or the end of the source.
 */
function statementFrom(source, start) {
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "(" || ch === "[" || ch === "{") depth += 1;
    else if (ch === ")" || ch === "]" || ch === "}") {
      depth -= 1;
      if (depth < 0) return source.slice(start, i);
    } else if (depth === 0 && (ch === ";" || ch === ",")) {
      // A depth-zero comma ends the chain too: siblings inside Promise.all([...])
      // or an object literal must not share one classification.
      return source.slice(start, i);
    } else if (depth === 0 && i > start && source.startsWith(".from(", i)) {
      // The next chain on the same statement starts its own classification.
      return source.slice(start, i);
    }
  }
  return source.slice(start);
}

/** File-level `const NAME = "literal"` (optionally `as const`) declarations. */
function constTableNames(source) {
  const names = new Map();
  for (const m of source.matchAll(/^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*(?::\s*[^=]+)?=\s*["']([A-Za-z_][A-Za-z0-9_]*)["']\s*(?:as\s+const)?\s*;?/gm)) {
    names.set(m[1], m[2]);
  }
  return names;
}

// PostgREST aggregate keywords, which sit where an embedded table sits and are
// not tables. A real table by one of these names does not exist here.
const EMBED_NOT_A_TABLE = new Set(["count", "sum", "avg", "min", "max"]);

/**
 * File-level string constants, by name: `const X = "..."` and `const X = `...``.
 * A template's `${...}` holes are blanked — each hole is another constant this
 * same map already carries, so nothing is lost by not resolving them here.
 */
function stringConstants(source) {
  const out = new Map();
  for (const m of source.matchAll(/^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*(?::\s*[^=]+)?=\s*(["'`])([\s\S]*?)\2\s*(?:as\s+const)?\s*;?$/gm)) {
    out.set(m[1], m[3].replace(/\$\{[^}]*\}/g, " "));
  }
  return out;
}

/**
 * The tables an embedded select reads: `alias:table!fk(cols)`, `table!fk(cols)`,
 * `table(cols)` and the un-aliased and spread forms, nesting included. More
 * than one `!` hint is allowed — `people!person_id!inner(...)` names the
 * foreign key and the join type, and reading only the first would report
 * `person_id` as a table.
 */
export function embeddedTables(selectList) {
  const out = [];
  for (const m of selectList.matchAll(/(?:([A-Za-z_][\w]*)\s*:\s*)?([A-Za-z_][\w]*)\s*(?:!\s*[A-Za-z_][\w]*\s*)*\(/g)) {
    const table = m[2];
    if (!EMBED_NOT_A_TABLE.has(table)) out.push(table);
  }
  return out;
}

/**
 * Every select list in a source string: the argument of each `.select(...)`,
 * whether written inline or named by a file-level constant, plus every
 * file-level constant whose name ends in SELECT or Select, which is how this
 * repo holds a select list that more than one query interpolates.
 */
function selectLists(source, consts) {
  const lists = [];
  const named = new Set();
  for (const m of source.matchAll(/\.select\s*(?:<[^>]*>)?\s*\(\s*(?:(["'`])([\s\S]*?)\1|([A-Za-z_$][\w$]*))/g)) {
    if (m[2] !== undefined) lists.push(m[2].replace(/\$\{[^}]*\}/g, " "));
    else if (m[3] !== undefined && consts.has(m[3])) {
      lists.push(consts.get(m[3]));
      named.add(m[3]);
    }
  }
  // A SELECT-named constant this file already passed to `.select(...)` was
  // counted at its use site; counting it again here would double every embed
  // it carries. What is left is the constant a caller elsewhere interpolates
  // or hands to a door helper, which is counted once for the file that
  // declares it.
  for (const [name, value] of consts) if (/(SELECT|Select)$/.test(name) && !named.has(name)) lists.push(value);
  return lists;
}

/**
 * Every table access in a source string: [{ table, write, embedded }].
 *
 * Two shapes reach a table. `.from("table")` is the one the gate has always
 * seen; a `.from(NAME)` resolves through a file-level const, and one that does
 * not resolve is reported as `{ table: null, name, write: true }` when the
 * chain writes and skipped when it only reads.
 *
 * The second is a PostgREST embedded select — `.select("policies:leave_policies!fk(name)")`
 * reads `leave_policies` with no `.from(` anywhere near it. Those were
 * invisible until A.8, which is why a live cross-entity read
 * (entities/team/lib/data.ts reading time-off's leave_policies) never reached
 * the baseline. An embed can only READ: a cross-entity write still needs
 * `.from(`, which the gate does see and does block, so the hole undercounted
 * reads, the softer ratcheted category.
 */
export function tableAccesses(source) {
  source = stripComments(source);
  const consts = constTableNames(source);
  const out = [];
  for (const m of source.matchAll(/\.from\(\s*(?:["']([A-Za-z_][A-Za-z0-9_]*)["']|([A-Za-z_$][\w$]*))\s*\)/g)) {
    if (/storage\s*$/.test(source.slice(0, m.index))) continue;
    const statement = statementFrom(source, m.index);
    const write = WRITE_CALL.test(statement.slice(m[0].length));
    const table = m[1] ?? consts.get(m[2]) ?? null;
    if (table) out.push({ table, write });
    else if (write) out.push({ table: null, name: m[2], write });
  }
  for (const list of selectLists(source, stringConstants(source))) {
    for (const table of embeddedTables(list)) out.push({ table, write: false, embedded: true });
  }
  return out;
}

/**
 * Every cross-owner access in the tree: { file, from, table, to, write }.
 * Same-owner accesses and reads of kernel tables are not edges; a table the
 * manifest does not own is attributed to "unowned" so it surfaces.
 */
export function collectAccesses(root, manifest = loadManifest(root)) {
  const entries = ownershipEntries(manifest);
  const owners = tableOwners(manifest);
  const edges = [];
  for (const rel of listSourceFiles(root)) {
    const from = entityOf(rel, manifest, entries);
    const source = fs.readFileSync(path.join(root, rel), "utf8");
    for (const { table, name, write, embedded } of tableAccesses(source)) {
      if (table === null) {
        edges.push({ file: rel, from, table: null, name, to: "unknown", write, embedded });
        continue;
      }
      const to = owners[table] ?? "unowned";
      if (to === from) continue;
      // Kernel tables (the identity rows and the messaging log) are readable by
      // all; a write goes through kernel/identity/writes.ts or
      // kernel/messaging/writes.ts, so a raw entity write is an edge (ME-13).
      if (to === KERNEL && !write) continue;
      edges.push({ file: rel, from, table, to, write, embedded });
    }
  }
  return edges;
}

/** Every table name any scanned file accesses, whoever owns it. */
export function referencedTables(root) {
  const names = new Set();
  for (const rel of listSourceFiles(root)) {
    for (const { table } of tableAccesses(fs.readFileSync(path.join(root, rel), "utf8"))) names.add(table);
  }
  return names;
}

/** Per-pair read counts, keys "from->to", sorted. */
export function measure(root, manifest = loadManifest(root)) {
  const counts = {};
  for (const e of collectAccesses(root, manifest)) {
    if (e.write) continue;
    const key = `${e.from}->${e.to}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.keys(counts).sort().map((k) => [k, counts[k]]));
}

/**
 * Pairs whose read count exceeds the baseline. Iterating `current` means a
 * `_raised` note in the baseline file is never compared against anything.
 */
export function compare(current, baseline) {
  const violations = [];
  for (const [pair, n] of Object.entries(current)) {
    const allowed = baseline[pair] ?? 0;
    if (n > allowed) violations.push(`${pair}: ${n} cross-entity table read(s), baseline allows ${allowed}`);
  }
  return violations;
}

export function loadJson(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function serialize(counts, note = null) {
  const body = Object.keys(counts).sort().map((k) => `  ${JSON.stringify(k)}: ${counts[k]}`);
  if (note) body.unshift(`  "_raised": ${JSON.stringify(note)}`);
  return `{\n${body.join(",\n")}\n}\n`;
}

/** Every cross-owner write, one line per (file, table). */
export function checkWrites(edges) {
  const violations = [];
  for (const e of edges) {
    if (!e.write) continue;
    if (e.table === null) {
      violations.push(
        `${e.file} writes a table named at runtime (.from(${e.name})); name the table or dispatch to the owner's writer`,
      );
      continue;
    }
    violations.push(`${e.file} writes ${e.table}, owned by ${e.to} (file owner: ${e.from})`);
  }
  return { violations: [...new Set(violations)] };
}

export function writeBaseline(root, file = path.join(root, BASELINE_FILE), manifest = loadManifest(root), raiseReason = null) {
  const current = measure(root, manifest);
  const existing = loadJson(file);
  const increases = existing ? compare(current, existing) : [];
  if (increases.length > 0 && !raiseReason) return { written: false, increases, current };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // A raise keeps its reason in the file. The next person to read a number
  // here needs to know whether it went up because coupling grew or because the
  // detector started seeing a shape it had always missed; a commit message is
  // not where they will look.
  const note = raiseReason ?? (existing && typeof existing._raised === "string" ? existing._raised : null);
  fs.writeFileSync(file, serialize(current, note));
  return { written: true, current, raised: increases };
}

export function checkTableOwnership(
  root,
  {
    baselineFile = path.join(root, BASELINE_FILE),
    typesFile = path.join(root, TYPES_FILE),
    manifest = loadManifest(root),
  } = {},
) {
  const ownership = validateOwnership(manifest, listTables(root, typesFile), referencedTables(root));
  if (ownership.length > 0) return { current: {}, violations: ownership };
  const edges = collectAccesses(root, manifest);
  const current = measure(root, manifest);
  const violations = [];
  const baseline = loadJson(baselineFile);
  if (!baseline) violations.push(`${BASELINE_FILE} is missing; run with --write-baseline to create it`);
  else violations.push(...compare(current, baseline));
  violations.push(...checkWrites(edges).violations);
  return { current, violations };
}

function total(counts) {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(here, "..");
  const argv = process.argv.slice(2);

  const explainAt = argv.indexOf("--explain");
  if (explainAt !== -1) {
    const pair = argv[explainAt + 1];
    const [from, to] = (pair ?? "").split(/->|:/);
    if (!from || !to) {
      console.error("check-table-ownership: --explain needs a pair such as team->company-os");
      process.exit(2);
    }
    const edges = collectAccesses(root).filter((e) => e.from === from && e.to === to);
    for (const e of edges) console.log(`${e.file} -> ${e.table}${e.write ? " (write)" : e.embedded ? " (embedded select)" : ""}`);
    console.log(`\n${edges.length} edge(s) for ${pair}.`);
    return;
  }

  if (argv.includes("--write-baseline")) {
    const ownership = validateOwnership(loadManifest(root), listTables(root), referencedTables(root));
    if (ownership.length > 0) {
      for (const line of ownership) console.error(line);
      console.error(`\ncheck-table-ownership: fix table ownership in entities.manifest.json before writing.`);
      process.exit(1);
    }
    {
      const raiseAt = argv.indexOf("--allow-raise");
      const raiseReason = raiseAt === -1 ? null : argv[raiseAt + 1];
      if (raiseAt !== -1 && (!raiseReason || raiseReason.startsWith("--"))) {
        console.error("check-table-ownership: --allow-raise needs a reason, which is written into the baseline.");
        process.exit(2);
      }
      const res = writeBaseline(root, path.join(root, BASELINE_FILE), loadManifest(root), raiseReason);
      if (!res.written) {
        for (const line of res.increases) console.error(line);
        console.error(
          `\ncheck-table-ownership: refusing to write ${BASELINE_FILE} — it would raise ` +
            `${res.increases.length} pair(s). The baseline only shrinks; read through the ` +
            `owner's index or an RPC.`,
        );
        process.exit(1);
      }
      if (res.raised?.length) {
        for (const line of res.raised) console.log(`  raised: ${line}`);
      }
      console.log(
        `check-table-ownership: wrote ${BASELINE_FILE} (${total(res.current)} cross-entity table reads ` +
          `across ${Object.keys(res.current).length} pairs)${res.raised?.length ? `, raising ${res.raised.length} pair(s)` : ""}.`,
      );
    }
    return;
  }

  const { violations, current } = checkTableOwnership(root);
  if (violations.length > 0) {
    for (const line of violations) console.error(line);
    console.error(
      `\ncheck-table-ownership: ${violations.length} problem(s). Every table has one owner; ` +
        `cross-entity reads may not grow and cross-entity writes go through the owner's ` +
        `index or an RPC. Run \`node scripts/check-table-ownership.mjs --explain <pair>\` to ` +
        `list the edges. See the header of scripts/check-table-ownership.mjs.`,
    );
    process.exit(1);
  }
  console.log(
    `check-table-ownership: ${total(current)} cross-entity table reads across ` +
      `${Object.keys(current).length} pairs; nothing above baseline, no cross-entity writes.`,
  );
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
