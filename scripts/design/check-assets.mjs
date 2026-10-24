#!/usr/bin/env node
/**
 * Design system guardrails.
 *
 * Two checks, both born from a real defect: `@font-face` referenced
 * "SVN-Gilroy SemiBold.otf", the file was never committed, and for months every
 * heading that asked for weight 600 silently rendered as Medium. Nothing failed,
 * nothing logged, and the site quietly lost its entire bold range.
 *
 *   1. missing-asset  Every /public asset referenced from CSS or JSX exists.
 *   2. font-weight    Every font-weight used has a @font-face that can serve it.
 *
 * Check 2 is the one that would have caught the original bug. A weight with no
 * face behind it does not fall back to another family: the browser silently
 * substitutes the nearest weight in the same family, so the page looks merely
 * "a bit flat" rather than broken.
 *
 * Usage:  node scripts/design/check-assets.mjs [--warn-only]
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(new URL("../..", import.meta.url).pathname);
const PUBLIC_DIR = join(ROOT, "public");
// `app` is the composition root, `kernel` the shared design-system primitives and
// `entities` every product block; `components/` and `lib/` no longer exist (ME-13).
const SCAN_DIRS = ["app", "kernel", "entities"];
const WARN_ONLY = process.argv.includes("--warn-only");

/** Recursively collect files with the given extensions, skipping build output. */
function walk(dir, exts, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, exts, out);
    else if (exts.some((e) => entry.endsWith(e))) out.push(full);
  }
  return out;
}

const cssFiles = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d), [".css"]));
const jsxFiles = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d), [".tsx", ".jsx"]));
const codeFiles = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d), [".ts", ".tsx", ".js", ".jsx", ".mjs"]));
const errors = [];
const warnings = [];

/* ─────────────────────────────────────────────────────────────
   Check 1: every referenced /public asset actually exists.
   ───────────────────────────────────────────────────────────── */

/** Skip anything we cannot resolve statically or that isn't ours to serve. */
function isSkippable(ref) {
  return (
    !ref.startsWith("/") ||
    ref.startsWith("//") ||
    ref.includes("${") ||
    ref.includes("http") ||
    ref.startsWith("/api/") ||
    ref.startsWith("/_next/")
  );
}

/**
 * A path can be served by an App Router route handler instead of /public,
 * e.g. app/llms.txt/route.ts serves /llms.txt. Those are not missing assets.
 */
function hasRouteHandler(clean) {
  return ["ts", "tsx", "js", "jsx"].some((ext) =>
    existsSync(join(ROOT, "app", clean, `route.${ext}`))
  );
}

function recordAsset(ref, file, line) {
  if (isSkippable(ref)) return;
  const clean = decodeURIComponent(ref.split("?")[0].split("#")[0]);
  if (hasRouteHandler(clean)) return;
  if (!existsSync(join(PUBLIC_DIR, clean))) {
    errors.push({
      check: "missing-asset",
      file: relative(ROOT, file),
      line,
      msg: `references "${clean}" but public${clean} does not exist`,
    });
  }
}

/**
 * Blank out /* … *\/ comment bodies while preserving newlines, so commented-out
 * code is never reported but line numbers stay accurate.
 */
function stripCssComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
}

// CSS: url(...) in any property, which covers @font-face src and background images.
for (const file of cssFiles) {
  stripCssComments(readFileSync(file, "utf8")).split("\n").forEach((text, i) => {
    for (const m of text.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) {
      recordAsset(m[1].trim(), file, i + 1);
    }
  });
}

// JSX: src/href/poster literals pointing at /public. Template literals are skipped.
for (const file of jsxFiles) {
  readFileSync(file, "utf8").split("\n").forEach((text, i) => {
    for (const m of text.matchAll(/(?:src|href|poster)=["'](\/[^"']*)["']/g)) {
      const ref = m[1];
      // Route links (no file extension) are pages, not assets.
      if (!/\.[a-z0-9]{2,5}$/i.test(ref)) continue;
      recordAsset(ref, file, i + 1);
    }
  });
}

/* ─────────────────────────────────────────────────────────────
   Check 1b: server-side reads such as
   readFileSync(join(root(), 'public/fonts/x.ttf')). These are invisible to the
   CSS/JSX scans above but break the BUILD when the file is missing, which is
   how removing a font silently broke every OpenGraph image route.
   ───────────────────────────────────────────────────────────── */

for (const file of codeFiles) {
  readFileSync(file, "utf8").split("\n").forEach((text, i) => {
    for (const m of text.matchAll(/['"`](public\/[^'"`${}]+\.[a-z0-9]{2,5})['"`]/gi)) {
      const clean = decodeURIComponent(m[1]);
      if (existsSync(join(ROOT, clean))) continue;
      errors.push({
        check: "missing-asset",
        file: relative(ROOT, file),
        line: i + 1,
        msg: `reads "${clean}" from disk but that file does not exist`,
      });
    }
  });
}

/* ─────────────────────────────────────────────────────────────
   Check 2: every font-weight used is backed by a real @font-face.
   ───────────────────────────────────────────────────────────── */

/** Parse @font-face blocks into { family, weights:[min,max], srcExists }. */
function parseFontFaces(css) {
  const faces = [];
  for (const m of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const block = m[1];
    const family = block.match(/font-family:\s*['"]?([^;'"]+)['"]?\s*;/)?.[1]?.trim();
    const weightRaw = block.match(/font-weight:\s*([^;]+);/)?.[1]?.trim() ?? "400";
    const src = block.match(/url\(\s*['"]?([^'")]+)['"]?\s*\)/)?.[1]?.trim();
    if (!family) continue;
    const parts = weightRaw.split(/\s+/).map(Number).filter((n) => !Number.isNaN(n));
    const [min, max] = parts.length === 2 ? parts : [parts[0] ?? 400, parts[0] ?? 400];
    const srcExists = src
      ? existsSync(join(PUBLIC_DIR, decodeURIComponent(src.split("?")[0])))
      : false;
    faces.push({ family, min, max, src, srcExists });
  }
  return faces;
}

const allCss = cssFiles.map((f) => stripCssComments(readFileSync(f, "utf8"))).join("\n");
const faces = parseFontFaces(allCss).filter((f) => f.srcExists);

if (faces.length) {
  const available = faces.flatMap((f) => {
    const out = [];
    for (let w = f.min; w <= f.max; w += 50) out.push(w);
    return out;
  });
  const maxAvailable = Math.max(...available);

  // Collect every weight actually requested, in CSS and in inline JSX styles.
  const requested = new Map(); // weight -> [{file,line}]
  const note = (w, file, line) => {
    if (!Number.isFinite(w)) return;
    if (!requested.has(w)) requested.set(w, []);
    requested.get(w).push({ file: relative(ROOT, file), line });
  };

  for (const file of cssFiles) {
    readFileSync(file, "utf8").split("\n").forEach((text, i) => {
      if (/@font-face/.test(text)) return;
      for (const m of text.matchAll(/font-weight:\s*(\d{3})/g)) note(Number(m[1]), file, i + 1);
    });
  }
  for (const file of jsxFiles) {
    readFileSync(file, "utf8").split("\n").forEach((text, i) => {
      for (const m of text.matchAll(/fontWeight:\s*["']?(\d{3})["']?/g)) note(Number(m[1]), file, i + 1);
    });
  }

  for (const [weight, sites] of [...requested.entries()].sort((a, b) => a[0] - b[0])) {
    const covered = faces.some((f) => weight >= f.min && weight <= f.max);
    if (covered) continue;
    const entry = {
      check: "font-weight-without-face",
      file: sites[0].file,
      line: sites[0].line,
      msg:
        `font-weight ${weight} is used in ${sites.length} place(s) but no @font-face provides it ` +
        `(heaviest available: ${maxAvailable}). The browser will silently render the nearest ` +
        `weight instead of failing. Text meant to be bold will not be bold.`,
    };
    // Weights above the heaviest real face are the silent-degradation case.
    if (weight > maxAvailable) warnings.push(entry);
    else errors.push(entry);
  }
}

/* ─────────────────────────────────────────────────────────────
   Check 3: .admin-card must get padding from somewhere.

   .admin-card is a shell: background, border, radius, shadow, and no padding.
   Padding arrives from a companion class (.admin-section-card and friends) or
   from a child that pads itself (.admin-empty, .admin-table, .admin-drawer-head).
   Nothing forced a caller to opt in, so a card whose author forgot renders with
   its text hard against the border.

   That was fixed by hand once and reappeared in a new page the next day, which
   is the whole reason this check exists: the rule was documented but not
   enforced, so it only held until the next person wrote a card.

   The companion list is derived from admin.css rather than hardcoded, so a new
   padded wrapper starts counting the moment it is written.
   ───────────────────────────────────────────────────────────── */

const ADMIN_CSS = join(ROOT, "app/admin/admin.css");
// The .u-* padding utilities live in their own file now, and a card padded by
// .u-p-4 is padded, so the companion search reads both stylesheets.
const UTILITIES_CSS = join(ROOT, "app/styles/utilities.css");
if (existsSync(ADMIN_CSS)) {
  const css = [ADMIN_CSS, UTILITIES_CSS].filter(existsSync).map((f) => stripCssComments(readFileSync(f, "utf8"))).join("\n");

  // A class "pads" if any rule whose SUBJECT is that class declares padding.
  // Checking the subject matters: `.x .admin-section-card + .admin-section-card`
  // sets margin, not padding, and must not be mistaken for the real rule.
  const padsFor = (cls) => {
    for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      for (const sel of m[1].split(",")) {
        const last = sel.trim().split(/[\s>+~]+/).pop() ?? "";
        if (last.startsWith(`.${cls}`) && /:(hover|focus|active)/.test(last)) continue;
        if (last.startsWith(`.${cls}`) && /\bpadding\b/.test(m[2])) return true;
      }
    }
    return false;
  };

  // Ask the question per element rather than from a guessed candidate list: does
  // ANY other class on this element declare padding? A companion named
  // .coach-section pads just as well as one with "card" in its name.
  const padsCache = new Map();
  const pads = (cls) => {
    if (!padsCache.has(cls)) padsCache.set(cls, padsFor(cls));
    return padsCache.get(cls);
  };

  const SELF_PADDING_CHILD = /admin-empty|admin-table|<table|admin-drawer-head/;

  for (const file of jsxFiles) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/className=\{?["'`]([^"'`]*)["'`]\}?([^>]{0,300})>/g)) {
      // Whole-token match: "gallery-admin-card" is a different class entirely.
      if (!m[1].split(/\s+/).includes("admin-card")) continue;
      const classes = m[1].split(/\s+/).filter(Boolean);
      if (classes.some((c) => c !== "admin-card" && pads(c))) continue;
      if (/padding:/.test(m[2])) continue;
      if (SELF_PADDING_CHILD.test(src.slice(m.index + m[0].length, m.index + m[0].length + 420))) continue;
      errors.push({
        check: "card-without-padding",
        file: relative(ROOT, file),
        line: src.slice(0, m.index).split("\n").length,
        msg:
          `.admin-card here gets no padding from anywhere, so its content renders flush ` +
          `against the border. Add a padded companion (for example .admin-section-card), ` +
          `or if the card is deliberately flush, let its child supply the padding.`,
      });
    }
  }
}

/* ─────────────────────────────────────────────────────────────
   Check 4: type and spacing values sit on the documented scales.

   Both scales were derived from what the codebase already uses rather than
   imposed, so most values already conform. See the Scales section of
   docs/product/edge8-design-system.md for the reasoning and the numbers.

   Reported as warnings, not errors: an off-scale value is a design smell, not
   a broken build, and the remaining offenders are tracked in the inventory.
   ───────────────────────────────────────────────────────────── */

// 22 and 26 are the --admin-text-title / --admin-text-page ramp steps in tokens.css; 56 is the
// display step between 48 and 64 the marketing headings use. `scale-ok` on a line exempts it.
const TYPE_SCALE = [11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 26, 28, 32, 40, 48, 56, 64, 80];
// 1 is the hairline step (divider margins); 140 and 160 are the hero clamp() maxima on the public site.
const SPACE_SCALE = [1, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 56, 64, 80, 96, 120, 140, 160];

const offScale = { type: new Map(), space: new Map() };
const noteOff = (kind, value, file, line) => {
  const key = String(value);
  if (!offScale[kind].has(key)) offScale[kind].set(key, { count: 0, first: `${file}:${line}` });
  offScale[kind].get(key).count++;
};

for (const file of cssFiles) {
  stripCssComments(readFileSync(file, "utf8")).split("\n").forEach((text, i) => {
    if (/scale-ok/.test(readFileSync(file, "utf8").split("\n")[i] ?? "")) return;
    // px only. em/rem/% are relative and intentionally exempt.
    for (const m of text.matchAll(/font-size:\s*([0-9]+(?:\.[0-9]+)?)px/g)) {
      const v = Number(m[1]);
      if (!TYPE_SCALE.includes(v)) noteOff("type", v, relative(ROOT, file), i + 1);
    }
    for (const m of text.matchAll(/\b(?:gap|padding|margin):\s*([^;]+);/g)) {
      for (const p of m[1].matchAll(/([0-9]+)px/g)) {
        const v = Number(p[1]);
        if (!SPACE_SCALE.includes(v)) noteOff("space", v, relative(ROOT, file), i + 1);
      }
    }
  });
}
for (const file of jsxFiles) {
  readFileSync(file, "utf8").split("\n").forEach((text, i) => {
    for (const m of text.matchAll(/fontSize:\s*["']?([0-9]+(?:\.[0-9]+)?)(?:px)?["']?(?![0-9a-zA-Z.%])/g)) {
      const v = Number(m[1]);
      if (!TYPE_SCALE.includes(v)) noteOff("type", v, relative(ROOT, file), i + 1);
    }
  });
}

for (const [kind, label, scale] of [
  ["type", "type scale", TYPE_SCALE],
  ["space", "spacing scale", SPACE_SCALE],
]) {
  const entries = [...offScale[kind].entries()].sort((a, b) => b[1].count - a[1].count);
  if (!entries.length) continue;
  const total = entries.reduce((n, [, v]) => n + v.count, 0);
  const worst = entries.slice(0, 6).map(([v, d]) => `${v}px x${d.count}`).join(", ");
  warnings.push({
    check: `off-${kind}-scale`,
    file: entries[0][1].first.split(":")[0],
    line: Number(entries[0][1].first.split(":")[1]),
    msg:
      `${total} declaration(s) sit off the ${label} across ${entries.length} value(s): ${worst}` +
      `${entries.length > 6 ? ", ..." : ""}. Scale: ${scale.join(", ")}.`,
  });
}

/* ─────────────────────────────────────────────────────────────
   Check 5: OS pages use the shared content widths, not ad-hoc ones.

   .admin-main now caps and centres content, with --narrow and --form for the
   two narrower cases. Before that it had no max-width at all, so pages either
   stretched to the viewport or invented their own cap: 17 different page
   widths across the OS, which is what "the width is inconsistent throughout"
   looks like in code.

   Only page-level widths are flagged. Small inline maxWidth values are column
   and control sizing, which is a different thing and left alone.
   ───────────────────────────────────────────────────────────── */

const OS_PAGE_DIRS = ["app/admin", "app/team", "app/portal"];
const PAGE_WIDTH_FLOOR = 400;
const SANCTIONED_WIDTHS = [640, 880, 1440];
const adHocWidths = new Map();

for (const file of jsxFiles) {
  const rel = relative(ROOT, file);
  if (!OS_PAGE_DIRS.some((d) => rel.startsWith(d))) continue;
  const src = readFileSync(file, "utf8");
  src.split("\n").forEach((text, i) => {
    // A breakpoint is not a container width.
    if (/@media/.test(text)) return;
    const widths = [
      ...[...text.matchAll(/maxWidth:\s*["']?(\d{3,4})(?:px)?["']?/g)].map((m) => m[1]),
      // styled-jsx blocks declare CSS, which the JS-prop scan alone would miss.
      ...[...text.matchAll(/max-width:\s*(\d{3,4})px/g)].map((m) => m[1]),
    ];
    for (const raw of widths) {
      const w = Number(raw);
      if (w < PAGE_WIDTH_FLOOR) continue;
      // A literal already sitting on a sanctioned width is not drift.
      if (SANCTIONED_WIDTHS.includes(w)) continue;
      if (!adHocWidths.has(w)) adHocWidths.set(w, { count: 0, first: `${rel}:${i + 1}` });
      adHocWidths.get(w).count++;
    }
  });
}

if (adHocWidths.size) {
  const entries = [...adHocWidths.entries()].sort((a, b) => b[1].count - a[1].count);
  const total = entries.reduce((n, [, v]) => n + v.count, 0);
  warnings.push({
    check: "ad-hoc-content-width",
    file: entries[0][1].first.split(":")[0],
    line: Number(entries[0][1].first.split(":")[1]),
    msg:
      `${total} page-level maxWidth value(s) across ${entries.size ?? entries.length} distinct widths ` +
      `(${entries.slice(0, 6).map(([w, d]) => `${w}px x${d.count}`).join(", ")}` +
      `${entries.length > 6 ? ", ..." : ""}). Use .admin-content (880) or ` +
      `.admin-content--form (640), or leave the page at the default cap.`,
  });
}


/* ─────────────────────────────────────────────────────────────
   Check: no NEW inline layout styles.

   Born from the time-off decision row (PR #840): the buttons were laid out
   with style={{ display: "flex", gap: 8 }} on .admin-list-aside, a class that
   already sets flex-direction: column. The inline style lost silently, the
   buttons shipped stacked, and nothing in typecheck, build, or CI could see
   it. Layout belongs in a class; a class that lays out wrong is the wrong
   class or a missing one.

   This is a RATCHET, not a sweep. The repo has ~500 of these already and
   cleaning them up is not this check's job — it only refuses to let the number
   grow, per file. Baseline: scripts/design/inline-layout-baseline.json,
   regenerate with `node scripts/design/check-assets.mjs --update-baseline`.

   Escape hatch: put `layout-ok` in a comment on the same line, e.g.
   style={{ display: "none" }} /* layout-ok: honeypot field *\/

   Next's metadata image routes (METADATA_IMAGE_ROUTE below) are exempt as a
   category rather than line by line. They render through Satori, which has no
   stylesheet and no className, so "layout goes in a class" is not advice a
   file like that can take, and seven `layout-ok` comments on one card would
   record a reason that is really a property of the whole file.
   ───────────────────────────────────────────────────────────── */

const LAYOUT_PROPS = [
  "display",
  "flexDirection",
  "alignItems",
  "justifyContent",
  "gap",
  "flexWrap",
  "gridTemplateColumns",
];
const BASELINE_PATH = join(ROOT, "scripts/design/inline-layout-baseline.json");
const UPDATE_BASELINE = process.argv.includes("--update-baseline");
// Next's metadata image route convention — the same filenames check-tokens.mjs
// skips, and the same ones scripts/check-design-ratchet.mjs exempts. Kept in
// step with those two on purpose: one rule about what an OG card is, not three.
const METADATA_IMAGE_ROUTE =
  /(^|\/)(opengraph-image|twitter-image|icon|apple-icon)\d*\.(tsx|jsx)$/;

/** Every `style={{ ... }}` block in a file, with the line it starts on. */
function inlineStyleBlocks(src) {
  const blocks = [];
  const marker = "style={{";
  let i = src.indexOf(marker);
  while (i !== -1) {
    let depth = 0;
    let end = i + marker.length - 2; // sit on the first `{`
    for (let j = end; j < src.length; j++) {
      if (src[j] === "{") depth++;
      else if (src[j] === "}") {
        depth--;
        if (depth === 0) {
          end = j;
          break;
        }
      }
    }
    blocks.push({
      line: src.slice(0, i).split("\n").length,
      text: src.slice(i, end + 1),
    });
    i = src.indexOf(marker, end + 1);
  }
  return blocks;
}

const inlineLayoutByFile = new Map();
const inlineLayoutHits = [];

for (const file of SCAN_DIRS.flatMap((d) =>
  walk(join(ROOT, d), [".tsx", ".jsx"]),
)) {
  const rel = relative(ROOT, file);
  if (METADATA_IMAGE_ROUTE.test(rel)) continue;
  const src = readFileSync(file, "utf8");
  const lines = src.split("\n");

  for (const block of inlineStyleBlocks(src)) {
    // `display: "none"` is a legitimate inline use (hidden honeypot inputs,
    // print-only nodes) and never a layout decision, so it never counts.
    const props = LAYOUT_PROPS.filter(
      (prop) =>
        new RegExp(`\\b${prop}\\s*:`).test(block.text) &&
        !(prop === "display" && /display\s*:\s*["']none["']/.test(block.text)),
    );
    if (props.length === 0) continue;
    if (/layout-ok/.test(lines[block.line - 1] ?? "")) continue;

    inlineLayoutByFile.set(rel, (inlineLayoutByFile.get(rel) ?? 0) + 1);
    inlineLayoutHits.push({ file: rel, line: block.line, props });
  }
}

if (UPDATE_BASELINE) {
  const next = Object.fromEntries([...inlineLayoutByFile.entries()].sort());
  writeFileSync(BASELINE_PATH, JSON.stringify(next, null, 2) + "\n");
  console.log(
    `✓ inline-layout baseline written: ${Object.keys(next).length} file(s), ` +
      `${inlineLayoutHits.length} occurrence(s)`,
  );
  process.exit(0);
}

const baseline = existsSync(BASELINE_PATH)
  ? JSON.parse(readFileSync(BASELINE_PATH, "utf8"))
  : {};

for (const [file, count] of inlineLayoutByFile) {
  const allowed = baseline[file] ?? 0;
  if (count <= allowed) continue;
  for (const hit of inlineLayoutHits.filter((h) => h.file === file)) {
    errors.push({
      check: "inline-layout-style",
      file: hit.file,
      line: hit.line,
      msg:
        `inline ${hit.props.join(", ")} in a style prop. Layout goes in a class: ` +
        `copy the closest shipped row/card, or add a class to app/admin/admin.css. ` +
        `(${count} in this file, baseline ${allowed}. Genuinely unavoidable? ` +
        `add a "layout-ok: reason" comment on that line.)`,
    });
  }
}

// Cleanup should tighten the ratchet, but never fail a PR for removing them.
const loosened = [...Object.entries(baseline)].filter(
  ([file, allowed]) => (inlineLayoutByFile.get(file) ?? 0) < allowed,
);
if (loosened.length && !errors.length) {
  console.log(
    `\nℹ ${loosened.length} file(s) now have fewer inline layout styles than the ` +
      `baseline. Run \`npm run check:design -- --update-baseline\` to lock the win in.`,
  );
}

/* ───────────────────────────── report ───────────────────────────── */

const label = (e) => `  ${e.file}:${e.line}\n    [${e.check}] ${e.msg}`;

if (warnings.length) {
  console.log(`\n⚠  ${warnings.length} design-system warning(s):\n`);
  warnings.forEach((w) => console.log(label(w)));
}

if (errors.length) {
  console.error(`\n✗ ${errors.length} design-system error(s):\n`);
  errors.forEach((e) => console.error(label(e)));
  console.error("");
  if (!WARN_ONLY) process.exit(1);
}

if (!errors.length && !warnings.length) {
  console.log(`✓ design assets OK: ${cssFiles.length} CSS and ${jsxFiles.length} JSX files checked`);
}
