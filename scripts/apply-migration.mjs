#!/usr/bin/env node
// Applies one migration to production, the only way production accepts one.
//
//   node scripts/apply-migration.mjs <version>
//
// Why one door. Three times in eight days (2026-09-26 #1717; 2026-10-03 twice)
// a migration reached production from a file no human had read in a pull
// request, and was recorded afterwards. Since 20261003160000_ddl_guard,
// production refuses schema changes unless the session declares the migration
// it is applying; this script is what declares it, and it declares nothing it
// has not checked:
//
//   1. the version names exactly one file under supabase/migrations/;
//   2. that file is on origin/main, byte for byte (fetched first), which means
//      it went through a PR, the db-review subagent and a merge;
//   3. the version is not already recorded in the ledger (a replay is pointless
//      and a re-record is a lie), unless --force says the ledger is wrong.
//
// Then it runs the file with the declaration set in the same session, and
// records the version with `supabase migration repair --status applied`, the
// step whose omission left seven migrations live and unrecorded before B.11.
//
// The declaration is a session setting the guard reads. Setting it by hand
// around this script is possible and leaves a ddl_log row with your name on it.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SETTING = "edge8.migration";

/**
 * The Supabase project the linked CLI targets. Read from the link the CLI
 * keeps, never written here: this file ships to the public fork, and the fork
 * scanner refuses an upstream project ref in it.
 */
function projectRef(root) {
  const fromEnv = process.env.SUPABASE_PROJECT_REF;
  if (fromEnv) return fromEnv;
  try {
    return readFileSync(join(root, "supabase", ".temp", "project-ref"), "utf8").trim();
  } catch {
    throw new Error("no linked Supabase project: run `supabase link` or set SUPABASE_PROJECT_REF");
  }
}

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts });
}

/** The one migration file a version names, or the reason there is not exactly one. */
export function fileForVersion(dir, version) {
  if (!/^\d{14}$/.test(version)) return { error: `"${version}" is not a 14-digit migration version` };
  const hits = readdirSync(dir).filter((f) => f.startsWith(`${version}_`) && f.endsWith(".sql"));
  if (hits.length === 0) return { error: `no supabase/migrations/${version}_*.sql in this checkout` };
  if (hits.length > 1) return { error: `${hits.length} files share version ${version}: ${hits.join(", ")}` };
  return { file: hits[0] };
}

/** The SQL that applies a file: the declaration first, in the same session. */
export function applySql(version, body) {
  return `set ${SETTING} = '${version}';\n${body}\n;\nreset ${SETTING};\n`;
}

/** Whether the ledger already holds the version, read from the CLI's JSON output. */
export function ledgerHas(output, version) {
  const m = output.match(/"rows":\s*(\[.*?\])\s*,\s*"warning"/s);
  const rows = m ? JSON.parse(m[1]) : [];
  return rows.some((r) => String(r.version) === version);
}

function main() {
  const [version, ...rest] = process.argv.slice(2);
  const force = rest.includes("--force");
  if (!version) throw new Error("usage: node scripts/apply-migration.mjs <version> [--force]");

  const root = sh("git", ["rev-parse", "--show-toplevel"]).trim();
  const ref = projectRef(root);
  const dir = join(root, "supabase", "migrations");
  const found = fileForVersion(dir, version);
  if (found.error) throw new Error(found.error);
  const rel = `supabase/migrations/${found.file}`;

  sh("git", ["fetch", "-q", "origin", "main"], { cwd: root });
  const local = readFileSync(join(root, rel), "utf8");
  let onMain;
  try {
    onMain = sh("git", ["show", `origin/main:${rel}`], { cwd: root });
  } catch {
    throw new Error(`${rel} is not on origin/main. Open the PR, let db-review pass, merge, then apply.`);
  }
  if (onMain !== local) throw new Error(`${rel} differs from its copy on origin/main. Apply exactly what was merged: check out main or discard the local edit.`);

  const tmp = mkdtempSync(join(tmpdir(), "apply-migration-"));
  const ledgerFile = join(tmp, "ledger.sql");
  writeFileSync(ledgerFile, `select version from supabase_migrations.schema_migrations where version = '${version}';`);
  const ledger = sh("supabase", ["db", "query", "--linked", "--project-ref", ref, "-f", ledgerFile]);
  if (ledgerHas(ledger, version) && !force) {
    throw new Error(`${version} is already recorded in the ledger. If it is recorded but was never applied, pass --force to run it again.`);
  }

  const runFile = join(tmp, "apply.sql");
  writeFileSync(runFile, applySql(version, local));
  console.log(`apply-migration: ${rel} is on origin/main; applying with ${SETTING} declared.`);
  const out = sh("supabase", ["db", "query", "--linked", "--project-ref", ref, "-f", runFile]);
  if (/"_tag":"Error"|ERROR:/.test(out)) throw new Error(`the migration failed:\n${out.slice(0, 2000)}`);

  if (!ledgerHas(ledger, version)) {
    sh("supabase", ["migration", "repair", "--linked", "--project-ref", ref, "--status", "applied", version]);
    console.log(`apply-migration: recorded ${version} in the ledger.`);
  }
  console.log(`apply-migration: done. Now run npm run gen:types if the schema changed, and commit the types in their own PR.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main();
  } catch (err) {
    console.error(`apply-migration: ${err?.message ?? err}`);
    process.exit(1);
  }
}
