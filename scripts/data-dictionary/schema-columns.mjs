// Table -> column names, read from the generated Supabase types. The types are
// regenerated from production after every migration (types-fresh holds them to
// it), so they are the one list of tables and columns in the repo that cannot
// lag the database. The usage miner reads them to know what to look for, and
// the dictionary check reads them to refuse usage evidence for a column that
// no longer exists.
//
// A line scan, not a TypeScript parse: `supabase gen types` writes a fixed
// shape, two spaces per level, so a table's columns are the keys indented ten
// spaces inside its `Row` block. Only the schemas the dictionary documents are
// read; an htt table is keyed "htt.<name>" and a company_os one by bare name,
// the keys column-usage.json uses.
import { readFileSync } from "node:fs";

export const TYPES_PATH = "kernel/data/supabase/database.types.ts";
const SCHEMAS = { company_os: "", htt: "htt." };

/** @returns {Record<string, string[]>} table key -> its columns, in declared order */
export function parseSchemaColumns(source) {
  const tables = {};
  let prefix = null; // the key prefix of the schema being read, or null outside one
  let inTables = false;
  let table = null;
  let inRow = false;
  for (const line of source.split("\n")) {
    const schema = line.match(/^ {2}([a-z_]+): \{$/);
    if (schema) {
      // The Constants export repeats each schema name further down, with no
      // Tables block inside, so re-entering it there reads nothing.
      prefix = Object.hasOwn(SCHEMAS, schema[1]) ? SCHEMAS[schema[1]] : null;
      inTables = false;
      continue;
    }
    if (prefix === null) continue;
    if (/^ {4}[A-Za-z]+: \{/.test(line)) {
      inTables = /^ {4}Tables: \{/.test(line);
      continue;
    }
    if (!inTables) continue;
    const t = line.match(/^ {6}([a-z0-9_]+): \{$/);
    if (t) {
      table = prefix + t[1];
      tables[table] = [];
      inRow = false;
      continue;
    }
    if (/^ {8}[A-Za-z]+: /.test(line)) {
      inRow = /^ {8}Row: \{/.test(line);
      continue;
    }
    const col = inRow && table && line.match(/^ {10}([a-z0-9_]+)\??:/);
    if (col) tables[table].push(col[1]);
  }
  return tables;
}

export function schemaColumns(path = TYPES_PATH) {
  return parseSchemaColumns(readFileSync(path, "utf8"));
}

/**
 * Usage evidence naming a table or column the schema no longer has: the sign
 * column-usage.json was mined before a migration dropped something.
 */
export function staleUsage(usage, schema) {
  const stale = [];
  for (const [t, u] of Object.entries(usage)) {
    const cols = schema[t];
    if (!cols) {
      stale.push(t);
      continue;
    }
    for (const c of Object.keys(u.cols ?? {})) if (!cols.includes(c)) stale.push(`${t}.${c}`);
  }
  return stale;
}
