// Merges authored Columns blocks into docs/db/data-dictionary.md.
// Input: a file containing one or more blocks of the form
//   ### schema.table
//   Columns:
//   - col: description
// For each block, replaces the entry's existing Columns block (or inserts one
// before its Evidence line). Existing authored lines win over incoming TODOs.
//
//   node scripts/data-dictionary/merge-columns.mjs <input-file> [...more]
import { readFileSync, writeFileSync } from "node:fs";

const DICT = "docs/db/data-dictionary.md";
let dict = readFileSync(DICT, "utf8");

const parseBlocks = (src) => {
  const out = {};
  for (const block of src.split(/^### /m).slice(1)) {
    const lines = block.split("\n");
    const table = lines[0].trim().replace(/\s.*$/, "");
    if (!/^[a-z0-9_]+\.[a-z0-9_]+$/.test(table)) continue;
    const cols = [];
    for (const l of lines.slice(1)) {
      const m = l.match(/^- ([a-z0-9_]+): (.+)$/);
      if (m) cols.push([m[1], m[2].trim()]);
    }
    if (cols.length) out[table] = cols;
  }
  return out;
};

let merged = 0, kept = 0, missingEntry = [];
for (const f of process.argv.slice(2)) {
  const incoming = parseBlocks(readFileSync(f, "utf8"));
  for (const [table, cols] of Object.entries(incoming)) {
    const hIdx = dict.indexOf(`### ${table}\n`);
    if (hIdx < 0) { missingEntry.push(table); continue; }
    const next = dict.indexOf("\n### ", hIdx + 1);
    const entry = dict.slice(hIdx, next < 0 ? dict.length : next);

    // existing authored columns for this entry
    const existing = {};
    const em = entry.match(/^Columns:\n((?:- [a-z0-9_]+: .*\n)+)/m);
    if (em) for (const l of em[1].trim().split("\n")) {
      const m = l.match(/^- ([a-z0-9_]+): (.+)$/);
      if (m) existing[m[1]] = m[2];
    }
    const finalCols = cols.map(([c, d]) => {
      if (existing[c] && /TODO\(owner\)/.test(d)) { kept++; return [c, existing[c]]; }
      return [c, d];
    });
    const block = "Columns:\n" + finalCols.map(([c, d]) => `- ${c}: ${d}`).join("\n") + "\n";
    let newEntry;
    if (em) newEntry = entry.replace(em[0], block);
    else newEntry = entry.replace(/^Evidence: /m, block + "Evidence: ");
    dict = dict.slice(0, hIdx) + newEntry + (next < 0 ? "" : dict.slice(next));
    merged++;
  }
}
writeFileSync(DICT, dict);
console.log(`Merged Columns blocks for ${merged} tables (${kept} existing lines kept over incoming TODOs).`);
if (missingEntry.length) console.error("No dictionary entry for: " + missingEntry.join(", "));
