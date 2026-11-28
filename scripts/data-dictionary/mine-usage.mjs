// Mines "where is this table/column used" evidence from the codebase into
// scripts/data-dictionary/column-usage.json, which generate.mjs folds into the
// atlas Dictionary tab. Mechanical and re-runnable; never hand-edit the JSON.
//
//   node scripts/data-dictionary/mine-usage.mjs
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { schemaColumns } from "./schema-columns.mjs";

// lib/ and components/ went with ME-13; product code is under entities/ and kernel/.
const ROOTS = ["app", "entities", "kernel", "scripts", "supabase/functions"];
const EXT = /\.(ts|tsx|mjs|js|sql)$/;
const IGNORE = /node_modules|\.next|scripts\/data-dictionary/;

// table -> [column names], from the generated types: they are regenerated from
// production after every migration, so a dropped column stops being looked for
// the next time this runs. (This read the atlas's DATA snapshot until B.6
// deleted private-docs/, which left the evidence frozen: B.12.)
const tables = schemaColumns();

const files = [];
const walk = (d) => {
  let items;
  try { items = readdirSync(d); } catch { return; }
  for (const it of items) {
    const p = join(d, it);
    if (IGNORE.test(p)) continue;
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if (EXT.test(it)) files.push(p);
  }
};
ROOTS.forEach(walk);

// A file "uses" a table if it references it via supabase .from(), a qualified
// SQL name, or a bare quoted name in SQL-ish context.
const usage = {};
for (const f of files) {
  const src = readFileSync(f, "utf8");
  for (const [t, cols] of Object.entries(tables)) {
    const n = t.startsWith("htt.") ? t.slice(4) : t;
    const hit =
      src.includes(`from("${n}")`) || src.includes(`from('${n}')`) ||
      src.includes(`company_os.${n}`) || src.includes(`htt.${n}`) ||
      new RegExp(`["'\`]${n}["'\`]\\s*(?:as|;|\\)|,|\\n)`).test(src) && /select|insert|update|delete|join/i.test(src);
    if (!hit) continue;
    usage[t] ??= { files: [], cols: {} };
    usage[t].files.push(f);
    for (const c of cols) {
      if (["id", "created_at", "updated_at"].includes(c)) continue;
      if (new RegExp(`\\b${c}\\b`).test(src)) (usage[t].cols[c] ??= []).push(f);
    }
  }
}
for (const t of Object.values(usage)) {
  t.files = [...new Set(t.files)].sort();
  for (const c of Object.keys(t.cols)) t.cols[c] = [...new Set(t.cols[c])].sort();
}
writeFileSync("scripts/data-dictionary/column-usage.json", JSON.stringify(usage, null, 1));
const nt = Object.keys(usage).length;
const nc = Object.values(usage).reduce((a, t) => a + Object.keys(t.cols).length, 0);
console.log(`Mined ${nt} tables with code references, ${nc} column-usage mappings, from ${files.length} source files.`);
