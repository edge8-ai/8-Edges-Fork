// Data dictionary gate. Fails a PR whose migrations create a table without
// (a) an entry in docs/db/data-dictionary.md and (b) COMMENT ON statements in the
// same change. Warns (does not fail) when a new table has no foreign key,
// since pure reference tables legitimately have none. This exists because the
// database grew accidental duplicates (campaigns vs marketing_campaigns) when
// tables were created without checking what already existed.
//
//   node scripts/data-dictionary/check.mjs <changed files...>
//   node scripts/data-dictionary/check.mjs --base origin/main   # diff HEAD against base
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

let files = process.argv.slice(2);
const bi = files.indexOf("--base");
if (bi >= 0) {
  const base = files[bi + 1] || "origin/main";
  // Added or modified only. A migration renamed byte-for-byte — the W.10
  // ledger repair moved 14 files to unique timestamps — is not a new table and
  // must not be asked for a COMMENT it never had; a rename WITH edits still is.
  files = execSync(`git diff --name-only --diff-filter=AM -M100% ${base}...HEAD`, { encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
}
const migrations = files.filter((f) => /^supabase\/migrations\/.+\.sql$/.test(f) && existsSync(f));
if (migrations.length === 0) {
  console.log("No changed migrations - nothing to check.");
  process.exit(0);
}

const dict = readFileSync("docs/db/data-dictionary.md", "utf8");
const changedSql = migrations.map((f) => readFileSync(f, "utf8")).join("\n");
const stripped = changedSql.replace(/--[^\n]*/g, "");

const created = [];
const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?("?[a-z0-9_]+"?\.)?("?[a-z0-9_]+"?)\s*\(/gi;
let m;
while ((m = re.exec(stripped))) {
  const schema = (m[1] || "company_os.").replace(/["".]/g, "");
  const table = m[2].replace(/"/g, "");
  const body = stripped.slice(m.index, stripped.indexOf(");", m.index) + 2);
  created.push({ name: `${schema}.${table}`, table, body });
}
if (created.length === 0) {
  console.log(`Checked ${migrations.length} migration(s): no CREATE TABLE - nothing to enforce.`);
  process.exit(0);
}

let failed = false;
for (const t of created) {
  const entry = dict.includes(`### ${t.name}`);
  const comment = new RegExp(
    `comment\\s+on\\s+table\\s+("?[a-z0-9_]+"?\\.)?"?${t.table}"?\\s+is`,
    "i"
  ).test(stripped);
  const fk = /references\s/i.test(t.body);
  if (!entry) {
    console.error(`FAIL  ${t.name}: no entry in docs/db/data-dictionary.md (add one; format is documented in the file).`);
    failed = true;
  }
  if (!comment) {
    console.error(`FAIL  ${t.name}: no COMMENT ON TABLE in the changed migrations.`);
    failed = true;
  }
  if (!fk) {
    console.warn(`WARN  ${t.name}: no foreign key in the CREATE TABLE. Fine for pure reference tables; wrong for anything about a person, company, or deal.`);
  }
  if (entry && comment) console.log(`OK    ${t.name}`);
}
process.exit(failed ? 1 : 0);
