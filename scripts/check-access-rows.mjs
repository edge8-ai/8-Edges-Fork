// Fails a declared default holder that no migration grants (ADR 0013).
//
// An entity's `permissions.ts` says which roles hold each atom (`holders`) and
// which atoms a role bundle carries (`roles`), and the kernel's bundles do the
// same for Admin and Super Admin. None of that grants anything in production:
// the resolver reads company_os.access_role_permissions, and a row reaches that
// table only through a migration (the "access rows" pattern,
// supabase/migrations/20261021120100_ladders_access_rows.sql). On 2026-10-24
// PR #2314 declared finance.pnl for Super Admin and shipped its page with no
// such migration, so the page refused every Super Admin while every gate was
// green (fixed by PR #2315). This gate closes that gap: every (role, atom,
// scope) the declarations imply must be inserted by some migration.
//
// The migrations write those rows in five shapes, all read here: a
// ('role', 'atom', 'scope') values list; a ('role', 'atom') list with the scope
// as a literal in the select; an ('atom') list for one role named by
// `r.key = 'role'` or by a role the same statement seeds into access_roles; and
// a single literal atom in the select. A pair deliberately left without a
// migration (seeded by hand with `npm run access:sync`, or held at another
// scope on purpose) goes on scripts/access-rows-allowlist.json with its reason.
// An entry that a migration now covers, or that no declaration implies any
// more, is stale and fails, so the list never outlives its reason.
//
// The public fork receives no migrations (it builds its database from
// supabase/01-schema.sql), so there is nothing to check there.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadManifest } from "./entity-manifest.mjs";
import { declarationsOf, holderGrants } from "./access-declarations.mjs";
import { isForkTree, skippedInFork } from "./fork-tree.mjs";

export const ALLOWLIST = "scripts/access-rows-allowlist.json";
const MIGRATIONS = "supabase/migrations";
const KEY = "[a-z0-9-]+";
const ATOM = "[a-z0-9-]+\\.[a-z0-9.-]+";

const pairKey = (p) => `${p.role} ${p.permission} ${p.scope}`;

/**
 * The statements of a SQL file, without line comments: split on `;` outside a
 * quoted string, so a role description with a semicolon stays whole. A doubled
 * quote inside a string closes and reopens it, which leaves the state right.
 */
function statementsOf(sql) {
  const out = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (!quoted && c === "-" && sql[i + 1] === "-") {
      while (i < sql.length && sql[i] !== "\n") i++;
      current += "\n";
      continue;
    }
    if (c === "'") quoted = !quoted;
    if (!quoted && c === ";") {
      out.push(current);
      current = "";
      continue;
    }
    current += c;
  }
  return [...out, current];
}

/**
 * Every (role, permission, scope) the access-row inserts in one migration's SQL
 * write. Only a statement that inserts into access_role_permissions is read.
 */
export function parseAccessRowInserts(sql) {
  const out = [];
  const statements = statementsOf(sql);
  for (const statement of statements) {
    if (!/insert\s+into\s+company_os\.access_role_permissions\b/i.test(statement)) continue;
    // The one role an ('atom') list or a literal atom is granted to: named in
    // the join or where clause, or seeded by the statement's own CTE.
    const role =
      new RegExp(`\\b\\w+\\.key\\s*=\\s*'(${KEY})'`).exec(statement)?.[1] ??
      new RegExp(`insert\\s+into\\s+company_os\\.access_roles\\s*\\([^)]*\\)\\s*values\\s*\\(\\s*'(${KEY})'`, "i").exec(statement)?.[1] ??
      null;
    // `select r.id, <permission>, <scope>`: either may be a literal.
    const select = new RegExp(`select\\s+\\w+\\.id\\s*,\\s*(?:'(${ATOM})'|[\\w.]+)\\s*,\\s*(?:'(${KEY})'|[\\w.]+)`, "i").exec(statement);
    const literalAtom = select?.[1] ?? null;
    const literalScope = select?.[2] ?? null;
    if (literalAtom && role && literalScope) out.push({ role, permission: literalAtom, scope: literalScope });
    for (const [text] of statement.matchAll(/\(\s*'[a-z0-9.-]+'(?:\s*,\s*'[a-z0-9.-]+')*\s*\)/g)) {
      const parts = [...text.matchAll(/'([^']*)'/g)].map((m) => m[1]);
      if (parts.length === 3 && parts[1].includes(".")) out.push({ role: parts[0], permission: parts[1], scope: parts[2] });
      else if (parts.length === 2 && parts[1].includes(".") && literalScope) out.push({ role: parts[0], permission: parts[1], scope: literalScope });
      else if (parts.length === 1 && parts[0].includes(".") && role && literalScope) out.push({ role, permission: parts[0], scope: literalScope });
    }
  }
  return out;
}

/**
 * Every (role, permission, scope) the declarations imply, with where it comes
 * from: each holders entry, and each atom of each role bundle.
 */
export function declaredPairs(declarations) {
  const out = new Map();
  const add = (role, permission, scope, source) => {
    const p = { role, permission, scope, source };
    if (!out.has(pairKey(p))) out.set(pairKey(p), p);
  };
  for (const d of declarations) {
    for (const [atom, value] of Object.entries(d.holders)) {
      for (const g of holderGrants(value)) add(g.role, atom, g.scope, `${d.file} holders`);
    }
    for (const [key, role] of Object.entries(d.roles ?? {})) {
      for (const g of holderGrants(role.atoms ?? "")) add(key, g.role, g.scope, `${d.file} role "${key}"`);
    }
  }
  return [...out.values()];
}

/** The declared pairs no migration inserts, and the allowlist entries that are stale. */
export function checkAccessRows({ declared, granted, allowlist }) {
  const have = new Set(granted.map(pairKey));
  const want = new Set(declared.map(pairKey));
  const allowed = new Set(allowlist.map(pairKey));
  return {
    missing: declared.filter((p) => !have.has(pairKey(p)) && !allowed.has(pairKey(p))),
    stale: allowlist.filter((p) => have.has(pairKey(p)) || !want.has(pairKey(p))),
  };
}

/** The access-row inserts of every migration file under `root`, minus any file `skip` names. */
export function grantedPairs(root, skip = () => false) {
  const dir = path.join(root, MIGRATIONS);
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql") && !skip(f))
    .flatMap((f) => parseAccessRowInserts(fs.readFileSync(path.join(dir, f), "utf8")));
}

export function readAllowlist(root) {
  const entries = JSON.parse(fs.readFileSync(path.join(root, ALLOWLIST), "utf8"));
  for (const e of entries) {
    if (!e.role || !e.permission || !e.scope || !e.reason?.trim()) {
      throw new Error(`${ALLOWLIST}: every entry needs a role, permission, scope and reason: ${JSON.stringify(e)}`);
    }
  }
  return entries;
}

/** The whole check against a tree; `skipMigration` drops files, for the test. */
export function accessRowsOf(root, { skipMigration } = {}) {
  const manifest = loadManifest(root);
  // Every entity in the tree, installed in this deployment or not: a pair an
  // uninstalled entity declares still needs its row wherever it is installed.
  const declarations = declarationsOf(root, manifest, Object.keys(manifest.entities));
  const declared = declaredPairs(declarations);
  return { declared, ...checkAccessRows({ declared, granted: grantedPairs(root, skipMigration), allowlist: readAllowlist(root) }) };
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  if (isForkTree(root)) {
    skippedInFork("check-access-rows", "the fork ships no migrations; its database comes from supabase/01-schema.sql");
    return;
  }
  const { declared, missing, stale } = accessRowsOf(root);
  for (const p of missing) {
    console.error(
      `  ${p.role} holds ${p.permission} at ${p.scope} (${p.source}), but no migration inserts that row into ` +
        "company_os.access_role_permissions. Add an access-rows migration " +
        "(pattern: supabase/migrations/20261024150000_finance_pnl_access_rows.sql), " +
        `or list the pair on ${ALLOWLIST} with the reason it is left out.`,
    );
  }
  for (const p of stale) {
    console.error(`  ${p.role} ${p.permission} ${p.scope}: on ${ALLOWLIST} but a migration inserts it, or no declaration implies it. Remove the entry.`);
  }
  if (missing.length + stale.length > 0) {
    console.error(`check-access-rows: ${missing.length} declared pair(s) with no access row, ${stale.length} stale allowlist entr(y/ies).`);
    process.exit(1);
  }
  console.log(`check-access-rows: ${declared.length} declared pair(s), each inserted by a migration or allowlisted.`);
}

const invokedDirectly =
  process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
