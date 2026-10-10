// Fails when two files in supabase/migrations/ share a timestamp prefix.
//
// The Supabase CLI records applied migrations by their 14-digit prefix. Two
// files with the same prefix are two versions fighting over one ledger row:
// whichever applies second is invisible to `supabase migration list`, and a
// `db push` can skip one of them without saying so. The 2026-09-02 review
// counted thirteen collisions already in the tree and grandfathered them in
// scripts/migration-timestamp-allowlist.json (AR-04). On 2026-09-12 (W.10) the
// remote ledger was repaired to the folder and the second file of each pair
// renamed to a unique second, so the allowlist is empty; it only shrinks, and
// nothing new may collide.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = path.resolve(here, "..");

/** @returns {{ errors: string[], prefixes: number, duplicates: string[] }} */
export function checkMigrations(root = DEFAULT_ROOT) {
  const dir = path.join(root, "supabase", "migrations");
  const allowlistPath = path.join(root, "scripts", "migration-timestamp-allowlist.json");
  const allow = new Set(
    fs.existsSync(allowlistPath)
      ? JSON.parse(fs.readFileSync(allowlistPath, "utf8")).grandfathered
      : [],
  );
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql"));
  const byPrefix = new Map();
  const errors = [];
  for (const f of files) {
    const m = /^(\d{14})_/.exec(f);
    if (!m) {
      errors.push(`${f}: name must start with a 14-digit timestamp and an underscore.`);
      continue;
    }
    const list = byPrefix.get(m[1]) ?? [];
    list.push(f);
    byPrefix.set(m[1], list);
  }
  const duplicates = [];
  for (const [prefix, list] of byPrefix) {
    if (list.length < 2) continue;
    duplicates.push(prefix);
    if (!allow.has(prefix)) {
      errors.push(
        `timestamp ${prefix} is used by ${list.length} files (${list.join(", ")}). ` +
          `Rename the new one to a unique timestamp; the ledger keys on the prefix.`,
      );
    }
  }
  // A grandfathered prefix that no longer collides should leave the allowlist,
  // so the list can only shrink and never hides a future collision by accident.
  for (const prefix of allow) {
    if ((byPrefix.get(prefix) ?? []).length < 2) {
      errors.push(`allowlist entry ${prefix} no longer collides; remove it from the allowlist.`);
    }
  }
  return { errors, prefixes: byPrefix.size, duplicates };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { errors, prefixes, duplicates } = checkMigrations();
  if (errors.length > 0) {
    console.error(`\n${errors.length} migration naming problem(s):\n`);
    for (const e of errors) console.error(`  - ${e}`);
    console.error("");
    process.exit(1);
  }
  console.log(
    `${prefixes} migration timestamp(s) OK (${duplicates.length} grandfathered collision(s)).`,
  );
}
