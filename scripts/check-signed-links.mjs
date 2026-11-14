#!/usr/bin/env node
// A storage link is signed only by a module that owns the rule for who may open it (RB.30).
//
// A signed link opens a private file for whoever holds it. The Training fault (TR.21) was a
// link signed from a path alone, with no rule for who was asking. So signing lives in the
// modules named as owners below, each of which takes the reader and its rule for who may open:
// the Reimbursements document store, and Training's assignments module, which signs a
// submission's link for the organiser it was found for. Every other signing call that existed
// when this gate shipped is listed in scripts/signed-links-baseline.json, which only shrinks.
//
// The rules, each with a "fires" test in check-signed-links.test.mjs (ADR 0033):
// 1. A file outside an owner module that names `createSignedUrl` or `createSignedUrls`, and has
//    no baseline entry, fails.
// 2. A baselined file whose count rises above its entry fails.
// 3. A baseline entry above the file's count (the file stopped signing, or went) fails until the
//    entry is lowered with --write-baseline, so a gain is written down and not quietly spent.
// 4. --write-baseline refuses to raise any count, and writes nothing when it would.
//
// What it counts: the two method names as words in .ts and .tsx files under app/, entities/
// and kernel/, outside tests, the kernel's test double (kernel/data/testing/) and comments. Naming the method counts, called or not, so taking
// it into a variable is counted too.
//
// Blind spots, not rules: a method name built from strings (`bucket["createSigned" + "Url"]`),
// code outside the three folders, and a string literal holding `//` or `/*` before a call on
// the same line, which the comment stripper takes for a comment and so hides the call. `createSignedUploadUrl` is not counted: it is an upload
// token for one object, not a link that opens one.
//
// In the public fork the internal entities are gone, so counts fall without anyone lowering an
// entry. There only rules 1 and 2 fail.
//
//   node scripts/check-signed-links.mjs                    check
//   node scripts/check-signed-links.mjs --write-baseline   lower the baseline to the tree
//   node scripts/check-signed-links.mjs --root <dir> ...   another tree
//
// Deliberately dependency-free (Node built-ins only), like the other gates.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isForkTree } from "./fork-tree.mjs";

export const OWNERS = ["entities/reimbursements/lib/document-store.ts", "entities/training/lib/assignments.ts"];
export const BASELINE_FILE = "scripts/signed-links-baseline.json";
const FOLDERS = ["app", "entities", "kernel"];
const SOURCE = /\.tsx?$/;
const TEST_FILE = /(^|\/)__tests__\/|\.test\.tsx?$/;
/** The kernel's storage double names every verb it fakes; faking a link is not signing one. */
const TEST_SUPPORT = "kernel/data/testing/";
const SKIP_DIRS = new Set(["node_modules", ".next"]);
const SIGNING = /\bcreateSignedUrls?\b/g;

/** Source with block and line comments removed, so a commented-out call is not counted. */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/[^\n]*/g, "$1");
}

function sourceFiles(root) {
  const out = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (SOURCE.test(e.name)) {
        const rel = path.relative(root, p).split(path.sep).join("/");
        if (!TEST_FILE.test(rel) && !rel.startsWith(TEST_SUPPORT)) out.push(rel);
      }
    }
  };
  for (const folder of FOLDERS) walk(path.join(root, folder));
  return out.sort();
}

/** Signing names per file outside the owner modules: { file: count }, sorted by file. */
export function measure(root) {
  const counts = {};
  for (const rel of sourceFiles(root)) {
    if (OWNERS.includes(rel)) continue;
    const n = (stripComments(fs.readFileSync(path.join(root, rel), "utf8")).match(SIGNING) ?? []).length;
    if (n > 0) counts[rel] = n;
  }
  return counts;
}

export function loadBaseline(root) {
  const file = path.join(root, BASELINE_FILE);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
}

/** One line per problem, comparing the tree's counts with the baseline. */
export function compare(current, baseline, { fork = false } = {}) {
  const problems = [];
  for (const file of [...new Set([...Object.keys(current), ...Object.keys(baseline)])].sort()) {
    const n = current[file] ?? 0;
    const b = baseline[file] ?? 0;
    if (n > b) {
      problems.push(
        b === 0
          ? `${file}: signs a storage link ${n} time(s) outside an owner module`
          : `${file}: signs a storage link ${n} time(s), baseline ${b}`,
      );
    } else if (n < b && !fork) {
      problems.push(`${file}: signs a storage link ${n} time(s), baseline ${b}. Stale: lower it with --write-baseline`);
    }
  }
  return problems;
}

export function checkSignedLinks(root) {
  const current = measure(root);
  return { current, problems: compare(current, loadBaseline(root), { fork: isForkTree(root) }) };
}

/** Lowers the baseline to the tree. Refuses, writing nothing, when any count would rise. */
export function writeBaseline(root) {
  const current = measure(root);
  const baseline = loadBaseline(root);
  const raises = Object.entries(current)
    .filter(([file, n]) => n > (baseline[file] ?? 0))
    .map(([file, n]) => `${file} ${baseline[file] ?? 0} -> ${n}`);
  if (raises.length > 0) return { written: false, raises };
  fs.mkdirSync(path.dirname(path.join(root, BASELINE_FILE)), { recursive: true });
  fs.writeFileSync(path.join(root, BASELINE_FILE), `${JSON.stringify(current, null, 2)}\n`);
  return { written: true, raises };
}

function main() {
  const argv = process.argv.slice(2);
  const rootAt = argv.indexOf("--root");
  const root = rootAt === -1 ? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..") : path.resolve(argv[rootAt + 1] ?? ".");
  const why =
    `Sign a link only in a module that owns the rule for who may open the file (${OWNERS.join(", ")}): ` +
    `give it the reader and the rule, never a bare path. See the header of scripts/check-signed-links.mjs.`;

  if (argv.includes("--write-baseline")) {
    const res = writeBaseline(root);
    if (!res.written) {
      for (const line of res.raises) console.error(`would raise ${line}`);
      console.error(`\ncheck-signed-links: refusing to write: ${res.raises.length} count(s) would rise. ${why}`);
      process.exit(1);
    }
    console.log(`check-signed-links: wrote ${BASELINE_FILE}.`);
    return;
  }

  const { current, problems } = checkSignedLinks(root);
  if (problems.length > 0) {
    for (const line of problems) console.error(line);
    console.error(`\ncheck-signed-links: ${problems.length} problem(s). ${why}`);
    process.exit(1);
  }
  const sites = Object.values(current).reduce((a, n) => a + n, 0);
  console.log(`check-signed-links: ${sites} signing call(s) in ${Object.keys(current).length} file(s) outside the owner modules; nothing above baseline.`);
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
