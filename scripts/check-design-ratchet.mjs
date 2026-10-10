// Fails when either of the two retired styling systems grows.
//
// The chosen design system is the `admin-*` primitives in app/admin/admin.css
// and components/admin/*. Two older systems still exist in the tree and the
// 2026-09-03 architecture redesign (ticket AR-30) decided they must stop
// growing rather than be rewritten in one go:
//
//   1. Inline `style={{ ... }}` objects in .tsx files under app/ and
//      components/. Counted per file, by literal occurrences of `style={{`.
//      A file may not exceed its baseline count, and a file absent from the
//      baseline may not have any — a new screen starts at zero.
//      Next's metadata image routes are exempt: see METADATA_IMAGE_ROUTE.
//
//   2. Page-prefixed selectors in app/globals.css. Counted as a single total.
//      Heuristic for "page-prefixed": a rule selector whose first compound
//      starts with a class, where the class name's first hyphen-separated
//      segment equals the first hyphen-separated segment of a route folder
//      under app/. So `.careers-hero` matches app/careers, `.case-grid`
//      matches app/case-studies, `.about-intro` matches app/about. Route
//      groups `(group)`, dynamic segments `[id]`, `api`, and `__tests__` are
//      not routes and are ignored, and `admin` is excluded on purpose: it is a
//      route folder, but `admin-*` is the chosen system, not a page prefix.
//      Comments and at-rule preludes (`@media`, `@keyframes`) are skipped, but
//      rules nested inside `@media` blocks are counted like top-level ones — a
//      media query is not a new namespace.
//      The heuristic is deliberately blunt: it can over-count a generic word
//      that happens to be a route (`.work-`, `.team-`) and it cannot see
//      abbreviations (`.cs-` for case-studies). Both are fine for a ratchet,
//      whose only job is to notice the number going up.
//
// The baseline lives in scripts/design-ratchet-baseline.json and only shrinks.
// `--write-baseline` regenerates it from the current tree but refuses when any
// number would go up: lowering is the point, and raising is a decision a human
// makes by hand with a reason in the PR. A file that reaches zero is removed
// from the baseline entirely, which is what makes "absent means zero" hold.
//
// Deliberately dependency-free (Node built-ins only), like check-action-auth,
// so it runs in CI and on a fresh clone before `npm install`.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const BASELINE_FILE = "scripts/design-ratchet-baseline.json";
// entities/ joined the scan with the first entity move (ME-04) so a component
// that relocated into an entity block kept being counted; components/ left it
// with ME-13, when the last shared component moved to kernel/ui.
const SCAN_DIRS = ["app", "kernel", "entities"];
const GLOBALS_CSS = "app/globals.css";
const SKIP_DIRS = new Set(["node_modules", ".next"]);

/** Every .tsx file under `dir`, as paths relative to `root`, sorted. */
function listTsxFiles(root, dir) {
  const out = [];
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return out;
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(path.join(d, entry.name));
      } else if (entry.name.endsWith(".tsx")) {
        out.push(path.relative(root, path.join(d, entry.name)).split(path.sep).join("/"));
      }
    }
  };
  walk(abs);
  return out.sort();
}

/**
 * Next's metadata image route file convention: opengraph-image, twitter-image,
 * icon and apple-icon, optionally numbered (`opengraph-image2.tsx`).
 *
 * These are exempt because they are not screens. Next renders them through
 * Satori (`next/og`), which paints a PNG from a React tree and supports no
 * stylesheet, no cascade and no className — an inline style object is the only
 * way to style anything in one, so the `admin-*` classes this gate steers
 * towards do literally nothing there. Counting them measured a constraint the
 * file cannot satisfy.
 *
 * `scripts/design/check-tokens.mjs` already skips the same filenames, for the
 * same stated reason ("places that legitimately paint pixels rather than UI"),
 * so this brings the three design gates onto one rule. It grants no headroom to
 * any screen: nothing else in the tree is named this way, and no metadata image
 * route has ever held a baseline entry.
 *
 * The exemption is deliberately by filename rather than by a `next/og` import.
 * Next decides what a metadata image route is from the filename alone, so the
 * name is what makes the file Satori-rendered — an import is downstream of it.
 *
 * Note the blind spot this closes only halfway: the twenty-six other OG cards
 * in the tree delegate to `entities/site/lib/ogRender.js`, whose fifteen inline
 * style objects this gate never saw, because the scan walks .tsx and that is a
 * .js. Their exemption was an accident of file extension; this one is a rule.
 */
const METADATA_IMAGE_ROUTE = /(^|\/)(opengraph-image|twitter-image|icon|apple-icon)\d*\.tsx$/;

/** Number of `style={{` occurrences in a source string. */
export function countInlineStyles(source) {
  return source.split("style={{").length - 1;
}

/**
 * Per-file inline-style counts for every .tsx in SCAN_DIRS — app/, components/,
 * and the kernel and entity trees the code is moving into.
 * Files with zero are omitted so the map doubles as the baseline shape, and so
 * are Next's metadata image routes (METADATA_IMAGE_ROUTE), which are not
 * screens — omitting them here keeps them out of `--write-baseline` too, so the
 * exemption can never turn into a headroom grant.
 */
export function countInlineStylesInTree(root) {
  const counts = {};
  for (const dir of SCAN_DIRS) {
    for (const rel of listTsxFiles(root, dir)) {
      if (METADATA_IMAGE_ROUTE.test(rel)) continue;
      const n = countInlineStyles(fs.readFileSync(path.join(root, rel), "utf8"));
      if (n > 0) counts[rel] = n;
    }
  }
  return counts;
}

/**
 * First hyphen-separated segment of every route folder name under app/,
 * recursively. Route groups, dynamic segments, `api` and `__tests__` are not
 * pages and are excluded; so are single-character names (`app/t`) because a
 * one-letter prefix matches nothing meaningful and everything accidental, and
 * `admin`, whose `admin-*` classes are the design system this gate protects.
 */
const NOT_PAGE_PREFIXES = new Set(["admin"]);
export function routePrefixes(root, appDir = "app") {
  const prefixes = new Set();
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const name = entry.name;
      const isRoute =
        !name.startsWith("(") &&
        !name.startsWith("[") &&
        !name.startsWith("_") &&
        !name.startsWith(".") &&
        name !== "api" &&
        !SKIP_DIRS.has(name);
      if (isRoute) {
        const first = name.split("-")[0];
        if (first.length > 1 && !NOT_PAGE_PREFIXES.has(first)) prefixes.add(first);
      }
      walk(path.join(d, name));
    }
  };
  walk(path.join(root, appDir));
  return prefixes;
}

/** CSS with block and line comments removed (strings in CSS are rare enough to ignore here). */
function stripCssComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * Every rule selector list in `css`, split on commas and trimmed. At-rule
 * preludes (`@media ...`, `@keyframes ...`, `@font-face`) are skipped; the
 * rules inside `@media` are still yielded because they select page elements.
 * Declarations inside `@font-face` and keyframe steps (`0%`, `to`) fall out
 * naturally: they either start with `@` or do not start with a `.`.
 */
export function cssRuleSelectors(css) {
  const text = stripCssComments(css);
  const selectors = [];
  let buf = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") {
      const prelude = buf.trim();
      buf = "";
      if (prelude && !prelude.startsWith("@")) {
        for (const sel of prelude.split(",")) {
          const s = sel.trim();
          if (s) selectors.push(s);
        }
      }
    } else if (ch === "}" || ch === ";") {
      buf = "";
    } else {
      buf += ch;
    }
  }
  return selectors;
}

/** Leading class name of a selector that starts with a class, else null. */
function leadingClass(selector) {
  const m = selector.match(/^\.([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

/** Count of selectors whose leading class is page-prefixed per `prefixes`. */
export function countPagePrefixedSelectors(css, prefixes) {
  let n = 0;
  for (const sel of cssRuleSelectors(css)) {
    const cls = leadingClass(sel);
    if (!cls) continue;
    if (prefixes.has(cls.split("-")[0])) n++;
  }
  return n;
}

/** Both measurements for the tree at `root`, in baseline shape. */
export function measure(root) {
  const globalsPath = path.join(root, GLOBALS_CSS);
  const css = fs.existsSync(globalsPath) ? fs.readFileSync(globalsPath, "utf8") : "";
  return {
    inlineStyles: countInlineStylesInTree(root),
    pagePrefixedSelectors: countPagePrefixedSelectors(css, routePrefixes(root)),
  };
}

/**
 * Violations of `baseline` by `current`. Each is a one-line, file-first
 * message so it reads like a compiler error in CI output.
 */
export function compare(current, baseline) {
  const violations = [];
  const base = baseline.inlineStyles ?? {};
  for (const [file, n] of Object.entries(current.inlineStyles)) {
    if (!(file in base)) {
      violations.push(`${file}: ${n} inline style(s) in a file with no baseline entry (new files start at 0)`);
    } else if (n > base[file]) {
      violations.push(`${file}: ${n} inline style(s), baseline allows ${base[file]}`);
    }
  }
  const baseSel = baseline.pagePrefixedSelectors ?? 0;
  if (current.pagePrefixedSelectors > baseSel) {
    violations.push(
      `${GLOBALS_CSS}: ${current.pagePrefixedSelectors} page-prefixed selector(s), baseline allows ${baseSel}`,
    );
  }
  return violations;
}

/** Sum of the per-file inline-style counts. */
export function totalInlineStyles(measurement) {
  return Object.values(measurement.inlineStyles).reduce((a, b) => a + b, 0);
}

export function loadBaseline(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/** Sorted-key JSON so diffs of the baseline stay readable. */
export function serializeBaseline(measurement) {
  const inlineStyles = Object.fromEntries(
    Object.keys(measurement.inlineStyles)
      .sort()
      .map((k) => [k, measurement.inlineStyles[k]]),
  );
  return `${JSON.stringify({ inlineStyles, pagePrefixedSelectors: measurement.pagePrefixedSelectors }, null, 2)}\n`;
}

/**
 * Write the baseline from the current tree. Returns { written: true } or
 * { written: false, increases: [...] } when any number would go up — the
 * allowlist only shrinks through this path.
 */
export function writeBaseline(root, file = path.join(root, BASELINE_FILE)) {
  const current = measure(root);
  const existing = loadBaseline(file);
  const increases = existing ? compare(current, existing) : [];
  if (increases.length > 0) return { written: false, increases, current };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, serializeBaseline(current));
  return { written: true, current };
}

/** The gate itself: { violations, current } for the tree at `root`. */
export function checkDesignRatchet(root, file = path.join(root, BASELINE_FILE)) {
  const baseline = loadBaseline(file);
  const current = measure(root);
  if (!baseline) {
    return { current, violations: [`${BASELINE_FILE} is missing; run with --write-baseline to create it`] };
  }
  return { current, violations: compare(current, baseline) };
}

function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(here, "..");
  const file = path.join(root, BASELINE_FILE);

  if (process.argv.includes("--write-baseline")) {
    const res = writeBaseline(root, file);
    if (!res.written) {
      for (const line of res.increases) console.error(line);
      console.error(
        `\ncheck-design-ratchet: refusing to write ${BASELINE_FILE} — it would raise ` +
          `${res.increases.length} number(s). The baseline only shrinks; move the styles ` +
          `into admin.css classes, or raise the entry by hand with a reason in the PR.`,
      );
      process.exit(1);
    }
    console.log(
      `check-design-ratchet: wrote ${BASELINE_FILE} (${totalInlineStyles(res.current)} inline styles in ` +
        `${Object.keys(res.current.inlineStyles).length} files, ${res.current.pagePrefixedSelectors} ` +
        `page-prefixed selectors in ${GLOBALS_CSS}).`,
    );
    return;
  }

  const { violations, current } = checkDesignRatchet(root, file);
  if (violations.length > 0) {
    for (const line of violations) console.error(line);
    console.error(
      `\ncheck-design-ratchet: ${violations.length} violation(s). The retired styling systems ` +
        `(inline style={{}} objects, page-prefixed selectors in app/globals.css) may not grow; ` +
        `use the admin-* classes in app/admin/admin.css instead. See the header of ` +
        `scripts/check-design-ratchet.mjs.`,
    );
    process.exit(1);
  }
  console.log(
    `check-design-ratchet: ${totalInlineStyles(current)} inline styles in ` +
      `${Object.keys(current.inlineStyles).length} files, ${current.pagePrefixedSelectors} ` +
      `page-prefixed selectors in ${GLOBALS_CSS}; nothing above baseline.`,
  );
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
