// The `*-shared.ts` modules hold vocabulary a client component may import —
// status labels, channel colours, stage names — beside a module that also reads
// the database, so the browser bundle stops carrying the service-role client.
// The refactor touched them two ways: three were split out of a data module for
// the first time, and eleven that already existed were moved between entities.
// Either way the risk is the same — a label retyped, a colour dropped, an entry
// lost — and this compares every exported constant and every exported function
// body with what the baseline had.
//
// Matching: when the same file exists at the baseline the constant is compared
// with that file's, and only that file's — a same-named constant elsewhere is
// not a match. When it does not (a genuine extraction) the baseline tree is
// searched for an export of the same name and the origin file is reported, so
// a reader can judge whether it is the right one.
//
// Exported *types* are not compared: they carry no runtime vocabulary.
//
// Usage: node scripts/audit-shared-vocab.mjs [--base <ref>] [--head <ref|worktree>] [--verbose]
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const args = process.argv.slice(2);
const flag = (n, d) => (args.indexOf(n) === -1 ? d : args[args.indexOf(n) + 1]);
const BASE = flag("--base", "b97bbeda");
const HEAD = flag("--head", "worktree");
const git = (...a) =>
  execFileSync("git", a, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
const show = (ref, f) => {
  try {
    return ref === "worktree" ? fs.readFileSync(f, "utf8") : git("show", `${ref}:${f}`);
  } catch {
    return null;
  }
};
const tree = (ref) => git("ls-tree", "-r", "--name-only", ref === "worktree" ? "HEAD" : ref).split("\n");

// `export const NAME = <literal>;` where the literal runs to the matching close
// of its first bracket, or to the `;` for a scalar.
function exportedConsts(src) {
  const out = new Map();
  if (!src) return out;
  const re = /^export const (\w+)(?::[^=\n]+)?\s*=\s*/gm;
  let m;
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length;
    const open = src[i];
    let end;
    if (open === "{" || open === "[" || open === "(") {
      const close = { "{": "}", "[": "]", "(": ")" }[open];
      let depth = 0;
      let q = null;
      for (end = i; end < src.length; end += 1) {
        const c = src[end];
        if (q) {
          if (c === "\\") end += 1;
          else if (c === q) q = null;
          continue;
        }
        if (c === '"' || c === "'" || c === "`") q = c;
        else if (c === open) depth += 1;
        else if (c === close) {
          depth -= 1;
          if (depth === 0) {
            end += 1;
            break;
          }
        }
      }
    } else {
      end = src.indexOf(";", i);
      if (end === -1) end = src.length;
    }
    const literal = src
      .slice(i, end)
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1 ")
      .replace(/['`]/g, '"')
      .replace(/\s+/g, " ")
      .replace(/([([{])\s+/g, "$1")
      .replace(/\s+([)\]}])/g, "$1")
      .replace(/,\s*([)\]}])/g, "$1")
      .trim();
    // `as const` and a type ascription do not change the value.
    out.set(m[1], literal.replace(/\s*as const$/, ""));
  }
  return out;
}

// `export function NAME(...) { ... }` and `export const NAME = (...) => { ... }`
// — a label inside a function body is vocabulary too, and a retyped `return
// "In repair"` has to fail here as surely as a retyped array entry.
function exportedFunctions(src) {
  const out = new Map();
  if (!src) return out;
  const re = /^export (?:async )?function (\w+)\s*\(/gm;
  let m;
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length - 1;
    let depth = 0;
    let q = null;
    let sawBody = false;
    for (; i < src.length; i += 1) {
      const c = src[i];
      if (q) {
        if (c === "\\") i += 1;
        else if (c === q) q = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") q = c;
      else if (c === "(" || c === "{") {
        depth += 1;
        if (c === "{") sawBody = true;
      } else if (c === ")" || c === "}") {
        depth -= 1;
        if (depth === 0 && sawBody && c === "}") {
          i += 1;
          break;
        }
      }
    }
    out.set(m[1], normalise(src.slice(m.index, i)));
  }
  return out;
}
function normalise(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1 ")
    .replace(/['`]/g, '"')
    .replace(/\s+/g, " ")
    .replace(/([([{])\s+/g, "$1")
    .replace(/\s+([)\]}])/g, "$1")
    .replace(/,\s*([)\]}])/g, "$1")
    .trim();
}

// A moved file lived somewhere else at the baseline; git's rename detection
// says where, so it is compared with its former self rather than reported new.
const renames = new Map();
for (const line of git("diff", "-M40%", "-C40%", "--name-status", BASE, HEAD === "worktree" ? "HEAD" : HEAD).split("\n")) {
  const p = line.split("\t");
  if (/^[RC]/.test(p[0]) && p.length >= 3) renames.set(p[2], p[1]);
}

const shared = tree(HEAD).filter((f) => /-shared\.ts$/.test(f) && /^entities\//.test(f));
const baseFiles = tree(BASE).filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f));
const baseIndex = new Map();
for (const f of baseFiles) {
  const src = show(BASE, f);
  for (const [name, lit] of exportedConsts(src)) (baseIndex.get(name) ?? baseIndex.set(name, []).get(name)).push({ file: f, lit });
  for (const [name, lit] of exportedFunctions(src)) (baseIndex.get(name) ?? baseIndex.set(name, []).get(name)).push({ file: f, lit });
}

let compared = 0;
let typesSkipped = 0;
const findings = [];
const unmatched = [];
const origins = [];
for (const f of shared) {
  const src = show(HEAD, f);
  const basePath = renames.get(f) ?? f;
  const atBase = show(BASE, basePath);
  const exportsHere = new Map([...exportedConsts(src), ...exportedFunctions(src)]);
  typesSkipped += (src.match(/^export type /gm) ?? []).length;
  // Same file at the baseline: compare with it and nothing else.
  const own = atBase ? new Map([...exportedConsts(atBase), ...exportedFunctions(atBase)]) : null;
  let moved = 0;
  let extracted = 0;
  for (const [name, lit] of exportsHere) {
    let candidates;
    if (own) {
      candidates = own.has(name) ? [{ file: basePath, lit: own.get(name) }] : [];
      if (candidates.length) moved += 1;
    } else {
      candidates = baseIndex.get(name) ?? [];
      if (candidates.length) extracted += 1;
    }
    if (!candidates.length) {
      unmatched.push(`${f}: ${name} (no baseline export of that name${own ? " in the same file" : ""})`);
      continue;
    }
    compared += 1;
    if (candidates.some((c) => c.lit === lit)) continue;
    findings.push({ file: f, name, head: lit, base: candidates[0] });
  }
  const originOf = own ? basePath : (baseIndex.get([...exportsHere.keys()][0]) ?? [{ file: "?" }])[0].file;
  origins.push(`${own ? "moved    " : "extracted"} ${f}  (${moved + extracted} compared; ${own ? "was" : "from"} ${originOf})`);
}

console.log(`shared vocabulary: ${BASE} → ${HEAD}\n`);
const movedCount = origins.filter((o) => o.startsWith("moved")).length;
console.log(
  `${shared.length} shared modules (${movedCount} existed at the baseline and were moved, ${shared.length - movedCount} extracted since), ` +
    `${compared} exported constants and functions compared, ${findings.length} differ, ${unmatched.length} unmatched, ${typesSkipped} type exports not compared`,
);
if (args.includes("--verbose")) for (const o of origins) console.log(`  ${o}`);
for (const f of findings) {
  console.log(`\n  DIFFERS  ${f.name}  in ${f.file}`);
  console.log(`    was in ${f.base.file}`);
  console.log(`    - base ${f.base.lit.slice(0, 300)}`);
  console.log(`    + head ${f.head.slice(0, 300)}`);
}
if (unmatched.length) {
  console.log("\n  new constants with no baseline export of the same name (renamed or genuinely new — read them):");
  for (const u of unmatched) console.log(`    ${u}`);
}
process.exitCode = findings.length ? 1 : 0;
