// Fails when a page under the private workflows library can render before the gate.
//
// The library layout shows the unlock form instead of `children` for a locked
// visitor, but the App Router renders layout and page in parallel, so a page
// that builds its own output still ships it in the RSC payload. The fix is that
// every page.tsx under the library exports its component through `gatedPage`
// and its head through `gatedMetadata` (the library entity's routes/workflows/private/gate.ts), both of
// which produce nothing until `isPrivateLibraryUnlocked()` says yes. This
// script is what keeps that true when the next page is made by copying an old
// one: a bare `export default function` or a static `export const metadata`
// under the library fails the build.
//
// ME-10 moved the library into entities/library; the files under
// app/workflows/private/ are now thin re-export mounts, which cannot render
// anything of their own, so this script audits the entity's pages — the place
// the gate wrapper actually is. That the mounts stay thin is asserted by
// entities/library/library-entity.test.ts.
//
// Dependency-free (Node built-ins only), in the style of check-action-auth.mjs.
// It does not parse TypeScript; the three exports it looks for are line-shaped
// and a file that hides them in an unusual form is reported as ungated rather
// than assumed safe.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const LIBRARY_DIR = path.join("entities", "library", "routes", "workflows", "private");

const GATE_IMPORT = /^import\s*\{[^}]*\bgatedPage\b[^}]*\}\s*from\s*(["'])(\.\.?\/)+gate\1/m;
const WRAPPED_DEFAULT = /^export default gatedPage\(/m;
const BARE_DEFAULT = /^export default (?:async )?(?:function|class)\b|^export default (?!gatedPage\()/m;
const STATIC_METADATA = /^export const metadata\b/m;
const WRAPPED_METADATA = /^export const generateMetadata = gatedMetadata\(/m;
const ANY_METADATA = /^export (?:const metadata\b|(?:async )?function generateMetadata\b|const generateMetadata\b)/m;

/** Problems with one page source, as human-readable strings. Empty means gated. */
export function auditPrivatePage(source) {
  const problems = [];
  if (!GATE_IMPORT.test(source)) {
    problems.push("does not import gatedPage from the library's gate module");
  }
  if (!WRAPPED_DEFAULT.test(source)) {
    problems.push(
      BARE_DEFAULT.test(source)
        ? "default export is not wrapped in gatedPage(...)"
        : "no `export default gatedPage(...)` found",
    );
  }
  if (STATIC_METADATA.test(source)) {
    problems.push("exports static `metadata`; use `export const generateMetadata = gatedMetadata({...})`");
  } else if (ANY_METADATA.test(source) && !WRAPPED_METADATA.test(source)) {
    problems.push("exports generateMetadata without gatedMetadata(...)");
  }
  return problems;
}

function walkPages(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkPages(full, out);
    else if (entry.name === "page.tsx") out.push(full);
  }
  return out;
}

/** Audit every page.tsx under `root`/LIBRARY_DIR. Returns { pages, failures }. */
export function checkPrivatePages(root) {
  const dir = path.join(root, LIBRARY_DIR);
  // The library is excluded from the 8-Edges-Fork sync, so in the fork there is
  // nothing to check and that is a pass, not a failure.
  if (!fs.existsSync(dir)) return { pages: [], failures: [] };
  const pages = walkPages(dir).sort();
  const failures = [];
  for (const file of pages) {
    const problems = auditPrivatePage(fs.readFileSync(file, "utf8"));
    if (problems.length > 0) failures.push({ file: path.relative(root, file), problems });
  }
  return { pages: pages.map((p) => path.relative(root, p)), failures };
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const { pages, failures } = checkPrivatePages(root);
  if (failures.length === 0) {
    console.log(`check:private-pages OK — ${pages.length} page(s) render only behind the gate`);
    return;
  }
  console.error("check:private-pages FAILED — these pages can render before the gate:\n");
  for (const { file, problems } of failures) {
    console.error(`  ${file}`);
    for (const p of problems) console.error(`    - ${p}`);
  }
  console.error(
    "\nWrap the component: `export default gatedPage(Page)` and the head: `export const generateMetadata = gatedMetadata({...})`, both from entities/library/routes/workflows/private/gate.ts.",
  );
  process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
