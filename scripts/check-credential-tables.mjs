// Fails when a migration creates a table that holds credentials or restricted
// personal data and no migration revokes the assistants' database roles on it.
//
// company_os's default privileges give every new table SELECT for
// chatbot_reader and INSERT, SELECT and UPDATE for chatbot_writer: the roles
// behind the read-everything admin assistant and the team assistant. Row-level
// security with no policies hides the rows from them, but that is one lock, and
// every other base table carries a chatbot_reader_select policy, so a sweep
// that added one would hand an assistant live tokens or salaries. Y.89 found
// lark_user_connections and qbo_connection holding the grant (fixed in
// 20261009100000); Y.90 found candidate_sensitive the same way for
// chatbot_writer. A table matches by its name (*_connection(s),
// *_sensitive, *_credential(s), *_secret(s)) or by a column that names a
// secret (access_token, refresh_token, api_key, client_secret, password, ...).
// It passes when migrations revoke all on it from every assistant role, or when
// scripts/credential-tables-allowlist.json names it with a reason.
//
// Static and offline, like check:migrations: it reads supabase/migrations/ and
// never production, so it runs inside npm run check.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = path.resolve(here, "..");

export const ASSISTANT_ROLES = ["chatbot_reader", "chatbot_writer", "team_chatbot_reader"];
const SENSITIVE_NAME = /(^|_)(connections?|sensitive|credentials?|secrets?)$/;
const SECRET_COLUMN = /^(access_token|refresh_token|api_key|client_secret|secret|password|password_hash|private_key|webhook_secret|token_hash)$/;
// The three schemas the production DDL guard covers; a table elsewhere is not ours.
const SCHEMAS = "(company_os|public|htt)";
const CREATE_HEAD = new RegExp(`create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?"?${SCHEMAS}"?\\."?(\\w+)"?\\s*\\(`, "gi");
const REVOKE = new RegExp(`revoke\\s+all\\s+(?:privileges\\s+)?on\\s+(?:table\\s+)?"?${SCHEMAS}"?\\."?(\\w+)"?\\s+from\\s+([^;]+);`, "gi");
const NOT_A_COLUMN = /^(constraint|primary|unique|check|foreign|exclude)\b/i;

function stripComments(sql) {
  return sql.replace(/--[^\n]*/g, "");
}

/** The text between the `(` at `open` and its matching `)`, or null. */
function balanced(sql, open) {
  let depth = 0;
  for (let i = open; i < sql.length; i++) {
    if (sql[i] === "(") depth++;
    else if (sql[i] === ")" && --depth === 0) return sql.slice(open + 1, i);
  }
  return null;
}

/** Column names of a table body: its top-level comma-separated items, constraints left out. */
function columnsOf(body) {
  const items = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    if (body[i] === "(") depth++;
    else if (body[i] === ")") depth--;
    else if (body[i] === "," && depth === 0) {
      items.push(body.slice(start, i));
      start = i + 1;
    }
  }
  items.push(body.slice(start));
  return items
    .map((item) => item.trim())
    .filter((item) => item && !NOT_A_COLUMN.test(item))
    .map((item) => item.split(/\s+/)[0].replace(/"/g, ""));
}

/** Every `create table` in one migration: [schema-qualified name, body]. Layout-independent. */
function createdTables(sql) {
  const out = [];
  for (const m of sql.matchAll(CREATE_HEAD)) {
    const body = balanced(sql, m.index + m[0].length - 1);
    if (body !== null) out.push([`${m[1].toLowerCase()}.${m[2]}`, body]);
  }
  return out;
}

/** @returns {{ errors: string[], tables: { table: string, file: string, why: string[] }[] }} */
export function checkCredentialTables(root = DEFAULT_ROOT) {
  const dir = path.join(root, "supabase", "migrations");
  const allowPath = path.join(root, "scripts", "credential-tables-allowlist.json");
  const allow = fs.existsSync(allowPath) ? JSON.parse(fs.readFileSync(allowPath, "utf8")).tables ?? {} : {};
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

  const tables = new Map();
  const revoked = new Map();
  for (const file of files) {
    const sql = stripComments(fs.readFileSync(path.join(dir, file), "utf8"));
    for (const [table, body] of createdTables(sql)) {
      const why = [];
      if (SENSITIVE_NAME.test(table.split(".")[1])) why.push("its name");
      const secrets = columnsOf(body).filter((c) => SECRET_COLUMN.test(c));
      if (secrets.length) why.push(`column ${secrets.join(", ")}`);
      if (why.length && !tables.has(table)) tables.set(table, { table, file, why });
    }
    for (const m of sql.matchAll(REVOKE)) {
      const table = `${m[1].toLowerCase()}.${m[2]}`;
      const roles = revoked.get(table) ?? new Set();
      for (const r of m[3].split(",")) roles.add(r.trim().replace(/"/g, ""));
      revoked.set(table, roles);
    }
  }

  const errors = [];
  for (const { table, file, why } of tables.values()) {
    if (typeof allow[table] === "string" && allow[table].trim()) continue;
    const missing = ASSISTANT_ROLES.filter((r) => !revoked.get(table)?.has(r));
    if (missing.length) {
      errors.push(
        `${table} (${file}) holds credentials or restricted data (${why.join("; ")}) and no migration revokes all on it from ${missing.join(", ")}. ` +
          `Add \`revoke all on ${table} from ${ASSISTANT_ROLES.join(", ")};\` to a migration, or name it in scripts/credential-tables-allowlist.json with a reason.`,
      );
    }
  }
  for (const table of Object.keys(allow)) {
    if (!tables.has(table)) errors.push(`scripts/credential-tables-allowlist.json names ${table}, which no migration creates as a credential table; remove it.`);
  }
  return { errors, tables: [...tables.values()] };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { errors, tables } = checkCredentialTables();
  if (errors.length) {
    console.error(`check-credential-tables: ${errors.length} problem(s):`);
    for (const e of errors) console.error(`  ${e}`);
    process.exit(1);
  }
  console.log(`check-credential-tables OK — ${tables.length} credential table(s), each closed to the assistant roles or allowlisted.`);
}
