// Fails when a stylesheet gives a text field a font size under 16px on a phone.
//
// iPhone Safari zooms the page in when a field whose text is under 16px is
// tapped, and does not zoom back out (MO.8, docs/plans/mobile-compatibility-plan.html,
// "How we stop this happening again"). Typecheck, lint and the design gates all
// passed on every one of the fields the 2026-10-14 review found, so this gate
// reads the stylesheets the way check:tokens reads them for literal colours.
//
// What counts as a field rule. A CSS rule whose selector's subject (its last
// compound) is an `input`, `select` or `textarea`, or carries a class that some
// .tsx file puts directly on one of those elements (`<input className="admin-input">`,
// a CSS-module `styles.input`). Inputs of a non-text type (checkbox, radio,
// range, file, colour, hidden, buttons) never zoom, so those are skipped, and so
// are pseudo-elements such as `::placeholder`.
//
// What counts as a phone. The 375x812 screen the plan tests, read as portrait
// widths 320-430px. A rule applies on a phone when its @media chain can match
// one of those widths: an unconditional rule does, `max-width: 880px` does,
// `min-width: 769px` and `(hover: hover)` do not. A feature this script cannot
// evaluate (prefers-*, aspect-ratio, @container) is assumed to apply.
//
// What satisfies a small rule. A rule of 16px or more for the same element that
// applies on every phone width and wins the cascade: an `!important` one
// anywhere in the scanned stylesheets (the block PR #2143 adds at the end of
// app/admin/admin.css), or a later rule in the same file with at least the same
// specificity. "Same element" means the fix's selector is at least as general:
// its subject's parts are a subset of the small rule's (a fix written as
// `input.x` counts for `.x`), and its ancestors, if any, appear in the same
// order among the small rule's.
//
// What it cannot see, so a review still has to:
//   - em and % font sizes, which depend on the parent, and expressions it cannot
//     evaluate; `--list` prints them as unknown;
//   - classes reaching a field through a prop (`<Input className={cls} />`), a
//     variable, or a component that adds them at runtime;
//   - which stylesheets a route actually loads: an !important fix in any scanned
//     file is taken to reach every page;
//   - @layer order: layers are read as if they were not there;
//   - inline styles other than a literal `style={{ fontSize }}` written on an
//     `<input>`, `<select>` or `<textarea>` tag itself, which are checked;
//   - contenteditable elements, which also zoom.
//
// Existing violations live in scripts/mobile-inputs-baseline.json, file by file,
// one entry per selector. The baseline only shrinks: a new violation fails, and
// so does an entry that no longer violates, so the fix and the baseline land in
// the same commit. `--write-baseline` rewrites it from the tree and refuses to
// add anything. `--list` prints every current violation with its line and size.
// In the public fork only new violations fail (see checkMobileInputs).
//
// Dependency-free (Node built-ins only), like check-design-ratchet.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isForkTree } from "./fork-tree.mjs";

export const BASELINE_FILE = "scripts/mobile-inputs-baseline.json";
export const MIN_PX = 16;
const SCAN_DIRS = ["app", "entities", "kernel"];
const SKIP_DIRS = new Set(["node_modules", ".next", "public"]);
const PHONE_WIDTHS = Array.from({ length: 111 }, (_, i) => 320 + i);
const PHONE_HEIGHT = 812;
const FIELD_TAGS = new Set(["input", "select", "textarea"]);
const NON_TEXT_TYPES = new Set(["checkbox", "radio", "range", "color", "file", "hidden", "submit", "button", "reset", "image"]);
const INLINE_KEY = (tag) => `<${tag}> inline style fontSize`;
const REFRESH = "npm run check:mobile-inputs -- --write-baseline";

function walk(root, dir, exts, out = []) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return out;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.posix.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(root, rel, exts, out);
    } else if (exts.some((x) => e.name.endsWith(x))) out.push(rel);
  }
  return out.sort();
}

/** Split `s` on `sep` (a single character) outside parentheses, brackets and quotes. */
function splitTop(s, sep) {
  const out = [];
  let depth = 0, quote = null, buf = "";
  for (const ch of s) {
    if (quote) { if (ch === quote) quote = null; }
    else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    else if (depth === 0 && (sep === " " ? /\s/.test(ch) : ch === sep)) { out.push(buf); buf = ""; continue; }
    buf += ch;
  }
  out.push(buf);
  return out.map((x) => x.trim()).filter(Boolean);
}

// ---------------------------------------------------------------- CSS parsing

/**
 * Style rules of `css` with the @media/@supports/@container chain around each.
 * Comments become blank lines so line numbers survive; @keyframes, @font-face
 * and other non-grouping at-rules are skipped whole.
 */
export function parseCss(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));
  const rules = [];
  const stack = [];
  let buf = "", quote = null, line = 1, startLine = 1;
  for (const ch of text) {
    if (ch === "\n") line++;
    if (quote) { if (ch === quote) quote = null; buf += ch; continue; }
    if (ch === '"' || ch === "'") { quote = ch; buf += ch; continue; }
    const top = stack[stack.length - 1];
    if (ch === "{") {
      const prelude = buf.trim();
      buf = "";
      const at = prelude.match(/^@([\w-]+)/);
      if (top?.kind === "skip" || (at && !/^(media|supports|container|layer|scope|document)$/i.test(at[1]))) {
        stack.push({ kind: "skip" });
      } else if (at) {
        stack.push({ kind: "group", name: at[1].toLowerCase(), prelude: prelude.slice(at[0].length).trim() });
      } else {
        const groups = stack.filter((f) => f.kind === "group");
        stack.push({ kind: "rule", selectors: splitTop(prelude, ","), decls: [], groups, line: startLine });
      }
    } else if (ch === "}" || ch === ";") {
      if (top?.kind === "rule" && buf.trim()) top.decls.push(parseDecl(buf));
      buf = "";
      if (ch === "}") {
        const done = stack.pop();
        if (done?.kind === "rule") rules.push({ ...done, order: rules.length });
      }
    } else {
      if (!buf.trim() && !/\s/.test(ch)) startLine = line;
      buf += ch;
    }
  }
  return rules;
}

function parseDecl(raw) {
  const i = raw.indexOf(":");
  if (i < 0) return { prop: raw.trim().toLowerCase(), value: "", important: false };
  let value = raw.slice(i + 1).trim();
  const important = /!\s*important\s*$/i.test(value);
  if (important) value = value.replace(/!\s*important\s*$/i, "").trim();
  return { prop: raw.slice(0, i).trim().toLowerCase(), value, important };
}

/** Custom properties declared anywhere, `:root` values preferred, for resolving `var()`. */
export function collectVars(rules) {
  const vars = {};
  for (const r of rules) {
    const root = r.groups.length === 0 && r.selectors.includes(":root");
    for (const d of r.decls) if (d.prop.startsWith("--") && (root || !(d.prop in vars))) vars[d.prop] = d.value;
  }
  return vars;
}

// ---------------------------------------------------------------- lengths

const KEYWORD_PX = { "xx-small": 9, "x-small": 10, small: 13, medium: 16, large: 18, "x-large": 24, "xx-large": 32 };

/** A length in px at a 375px-wide phone, or null when it is relative (em, %) or unreadable. */
export function evalLength(value, vars = {}, depth = 0) {
  const v = value.trim().toLowerCase();
  if (depth > 10) return null;
  if (v in KEYWORD_PX) return KEYWORD_PX[v];
  const varM = v.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*([\s\S]+))?\)$/);
  if (varM) {
    const next = vars[varM[1]] ?? varM[2];
    return next === undefined ? null : evalLength(next, vars, depth + 1);
  }
  const num = v.match(/^(-?\d*\.?\d+)(px|rem|pt|vw|em|%)?$/);
  if (num) {
    const n = Number(num[1]);
    switch (num[2]) {
      case "px": return n;
      case "rem": return n * 16;
      case "pt": return (n * 4) / 3;
      case "vw": return n * 3.75;
      case undefined: return n === 0 ? 0 : null;
      default: return null;
    }
  }
  const fn = v.match(/^(clamp|min|max|calc)\(([\s\S]*)\)$/);
  if (!fn) return null;
  if (fn[1] === "calc") {
    const terms = splitTop(fn[2].replace(/\s([+-])\s/g, " $1 "), " ");
    let total = evalLength(terms[0] ?? "", vars, depth + 1);
    for (let i = 1; i + 1 < terms.length && total !== null; i += 2) {
      const t = evalLength(terms[i + 1], vars, depth + 1);
      if (t === null || !"+-".includes(terms[i])) return null;
      total = terms[i] === "+" ? total + t : total - t;
    }
    return total;
  }
  const args = splitTop(fn[2], ",").map((a) => evalLength(a, vars, depth + 1));
  if (args.some((a) => a === null) || args.length === 0) return null;
  if (fn[1] === "min") return Math.min(...args);
  if (fn[1] === "max") return Math.max(...args);
  return args.length === 3 ? Math.max(args[0], Math.min(args[1], args[2])) : null;
}

/** The font size a rule's declarations set: { px, important } or { unknown } or null when it sets none. */
export function ruleFontSize(decls, vars) {
  const sizing = decls.filter((d) => d.prop === "font-size" || d.prop === "font");
  const winner = [...sizing].reverse().find((d) => d.important) ?? sizing[sizing.length - 1];
  if (!winner) return null;
  const value = winner.value.trim().toLowerCase();
  if (/^(inherit|initial|unset|revert|revert-layer)$/.test(value)) return null;
  let raw = value;
  if (winner.prop === "font") {
    raw = splitTop(value, " ").map((t) => t.split("/")[0]).find((t) => evalLength(t, vars) !== null || /(em|%)$/.test(t));
    if (raw === undefined) return null;
  }
  const px = evalLength(raw, vars);
  return px === null ? { unknown: raw, important: winner.important } : { px, important: winner.important };
}

// ---------------------------------------------------------------- media

function evalFeature(inner, w) {
  const s = inner.trim().toLowerCase();
  const range = s.match(/^(?:(\S+)\s*(<=|<|>=|>|=)\s*)?(width|height)(?:\s*(<=|<|>=|>|=)\s*(\S+))?$/);
  if (range && (range[1] || range[5])) {
    const x = range[3] === "width" ? w : PHONE_HEIGHT;
    const cmp = (a, op, b) => ({ "<=": a <= b, "<": a < b, ">=": a >= b, ">": a > b, "=": a === b })[op];
    const lo = range[1] ? evalLength(range[1]) : null, hi = range[5] ? evalLength(range[5]) : null;
    if ((range[1] && lo === null) || (range[5] && hi === null)) return null;
    return (!range[1] || cmp(lo, range[2], x)) && (!range[5] || cmp(x, range[4], hi));
  }
  const [name, val = ""] = s.split(":").map((x) => x.trim());
  const len = evalLength(val);
  switch (name) {
    case "min-width": return len === null ? null : w >= len;
    case "max-width": return len === null ? null : w <= len;
    case "min-height": return len === null ? null : PHONE_HEIGHT >= len;
    case "max-height": return len === null ? null : PHONE_HEIGHT <= len;
    case "orientation": return val === "portrait";
    case "hover": case "any-hover": return val === "none";
    case "pointer": case "any-pointer": return val === "coarse";
    default: return null;
  }
}

function and(values) {
  if (values.includes(false)) return false;
  return values.includes(null) ? null : true;
}

/** One @media prelude at width `w`: true, false, or null when it cannot tell. */
export function evalMedia(prelude, w) {
  const results = splitTop(prelude, ",").map((query) => {
    let q = query.trim().toLowerCase().replace(/^only\s+/, "");
    const negate = /^not\s/.test(q);
    if (negate) q = q.replace(/^not\s+/, "");
    if (/\)\s+or\s+\(/.test(q)) return null;
    const parts = q.split(/\s+and\s+/).map((p) => {
      p = p.trim();
      if (p.startsWith("(")) return evalFeature(p.replace(/^\(|\)$/g, ""), w);
      return p === "print" ? false : p === "screen" || p === "all" ? true : null;
    });
    const r = and(parts);
    return negate && r !== null ? !r : r;
  });
  if (results.includes(true)) return true;
  return results.includes(null) ? null : false;
}

function groupsAt(groups, w) {
  return and(groups.map((g) => (g.name === "media" ? evalMedia(g.prelude, w) : g.name === "container" ? null : true)));
}

/** Can the rule apply on some phone width? Unknown counts as yes. */
export function appliesOnSomePhone(groups) {
  return PHONE_WIDTHS.some((w) => groupsAt(groups, w) !== false);
}

/** Does the rule surely apply on every phone width? Unknown counts as no. */
export function appliesOnEveryPhone(groups) {
  return PHONE_WIDTHS.every((w) => groupsAt(groups, w) === true);
}

// ---------------------------------------------------------------- selectors

/** Expand a top-level `:is()`/`:where()` in the subject compound into alternatives. */
function expandIs(selector) {
  const m = selector.match(/:(is|where)\(([^()]*)\)(?=[^\s>+~]*$)/);
  if (!m) return [selector];
  return splitTop(m[2], ",").flatMap((alt) => expandIs(selector.slice(0, m.index) + alt + selector.slice(m.index + m[0].length)));
}

/** Compounds and the combinators between them. */
function compounds(selector) {
  const spaced = selector.replace(/\s*([>+~])\s*/g, " $1 ");
  const tokens = splitTop(spaced, " ");
  const parts = [], combinators = [];
  for (const t of tokens) {
    if (/^[>+~]$/.test(t)) combinators[parts.length - 1] = t;
    else { if (parts.length > combinators.length) combinators.push(" "); parts.push(t); }
  }
  return { parts, combinators: combinators.slice(0, parts.length - 1) };
}

/** The simple selectors of one compound: tag, .class, #id, [attr], :pseudo(...). */
function simples(compound) {
  return compound.match(/(::?[\w-]+(\((?:[^()]|\([^()]*\))*\))?|\.[\w-]+|#[\w-]+|\[[^\]]*\]|^\*|^[\w-]+)/g) ?? [];
}

function specificity(selector) {
  let a = 0, b = 0, c = 0;
  for (const part of compounds(selector).parts) {
    for (const s of simples(part)) {
      if (s.startsWith("#")) a++;
      else if (s.startsWith(".") || s.startsWith("[") || (s.startsWith(":") && !s.startsWith("::") && !/^:where\(/.test(s))) b++;
      else if (s !== "*") c++;
    }
  }
  return a * 10000 + b * 100 + c;
}

/** Is this (already expanded) selector's subject a text field? */
export function isFieldSelector(selector, fieldClasses) {
  const { parts } = compounds(selector);
  const subject = parts[parts.length - 1] ?? "";
  if (subject.includes("::")) return false;
  const typeAttr = subject.match(/\[type\s*=\s*["']?([\w-]+)/i);
  if (typeAttr && NON_TEXT_TYPES.has(typeAttr[1].toLowerCase())) return false;
  const all = simples(subject);
  if (all.length && FIELD_TAGS.has(all[0].toLowerCase())) return true;
  return all.some((s) => s.startsWith(".") && fieldClasses.has(s.slice(1)));
}

/** Does `fix` match every element `small` matches? A conservative structural test. */
export function covers(fix, small) {
  const f = compounds(fix), s = compounds(small);
  if (f.combinators.some((c) => c !== " ")) return fix.replace(/\s+/g, " ") === small.replace(/\s+/g, " ");
  const subset = (a, b) => { const sb = new Set(simples(b)); return simples(a).every((x) => sb.has(x)); };
  // `input.x` is taken to cover `.x`: the small rule only matters on the fields
  // that carry the class, and the fix names the field. A class shared by an
  // input and a textarea, fixed for only one of them, slips through here.
  const fixSubject = f.parts[f.parts.length - 1], smallSubject = s.parts[s.parts.length - 1];
  const smallHasTag = /^[\w-]/.test(smallSubject);
  const named = smallHasTag ? fixSubject : fixSubject.replace(/^(input|select|textarea)(?![\w-])/i, "");
  if (!subset(named, smallSubject)) return false;
  let j = 0;
  for (const anc of f.parts.slice(0, -1)) {
    while (j < s.parts.length - 1 && !subset(anc, s.parts[j])) j++;
    if (j >= s.parts.length - 1) return false;
    j++;
  }
  return true;
}

// ---------------------------------------------------------------- TSX

const FIELD_ELEMENT = /<(input|select|textarea)\b/g;
// A component named like a field (`<PasswordInput>`, `<PersonSelect>`) is taken
// to forward its `style`/`inputStyle` to one. Its className is not read: it
// may land on a wrapper.
const FIELD_COMPONENT = /<(input|select|textarea|[A-Z]\w*(?:Input|Select|Textarea|TextArea))\b/g;

/** Each opening tag matching `pattern`, non-text input types dropped: { tag, text, index }. */
function fieldTags(source, pattern = FIELD_ELEMENT) {
  const out = [];
  for (const m of source.matchAll(pattern)) {
    let depth = 0, quote = null, i = m.index + m[0].length;
    for (; i < source.length; i++) {
      const ch = source[i];
      if (quote) { if (ch === "\\") i++; else if (ch === quote) quote = null; }
      else if (ch === '"' || ch === "'" || ch === "`") quote = ch;
      else if (ch === "{") depth++;
      else if (ch === "}") depth--;
      else if (ch === ">" && depth === 0) break;
    }
    out.push({ tag: m[1], text: source.slice(m.index, i + 1), index: m.index });
  }
  return out.filter((t) => !NON_TEXT_TYPES.has((t.text.match(/\btype\s*=\s*["']([\w-]+)["']/)?.[1] ?? "").toLowerCase()));
}

/** The JSX attribute after `name=`: { braced: false, value } for a quoted string, { braced: true, value } for `{...}`. */
function attrValue(tagText, name) {
  const m = tagText.match(new RegExp(`\\b${name}\\s*=\\s*`));
  if (!m) return null;
  const start = m.index + m[0].length;
  const open = tagText[start];
  if (open === '"' || open === "'") return { braced: false, value: tagText.slice(start + 1, tagText.indexOf(open, start + 1)) };
  if (open !== "{") return null;
  let depth = 0;
  for (let i = start; i < tagText.length; i++) {
    if (tagText[i] === "{") depth++;
    else if (tagText[i] === "}" && --depth === 0) return { braced: true, value: tagText.slice(start + 1, i) };
  }
  return null;
}

/** Class names a .tsx file writes literally on its text fields, CSS-module members included. */
export function fieldClassesFromTsx(source) {
  const classes = new Set();
  const modules = [...source.matchAll(/import\s+(\w+)\s+from\s+["'][^"']+\.module\.css["']/g)].map((m) => m[1]);
  for (const { text } of fieldTags(source)) {
    const attr = attrValue(text, "className");
    if (!attr) continue;
    const literals = attr.braced ? [...attr.value.matchAll(/(["'`])((?:\\.|(?!\1)[^\\])*)\1/g)].map((m) => m[2]) : [attr.value];
    for (const lit of literals) {
      for (const tok of lit.replace(/\$\{[^}]*\}/g, " ").split(/\s+/)) if (/^-?[A-Za-z_][\w-]*$/.test(tok)) classes.add(tok);
    }
    for (const mod of attr.braced ? modules : []) {
      for (const m of attr.value.matchAll(new RegExp(`\\b${mod}(?:\\.([A-Za-z_]\\w*)|\\[\\s*["']([\\w-]+)["']\\s*\\])`, "g"))) classes.add(m[1] ?? m[2]);
    }
  }
  return classes;
}

/** Literal `style={{ fontSize }}` (or `inputStyle`) under 16px written on a field tag: [{ tag, px, line }]. */
export function inlineSmallFields(source) {
  const out = [];
  for (const { tag, text, index } of fieldTags(source, FIELD_COMPONENT)) {
    for (const name of ["style", "inputStyle"]) {
      const style = attrValue(text, name);
      const m = style?.braced && style.value.match(/\bfontSize\s*:\s*(?:(\d*\.?\d+)\s*(?=[,}\s]|$)|(["'`])([^"'`]+)\2)/);
      if (!m) continue;
      const px = m[1] !== undefined ? Number(m[1]) : evalLength(m[3]);
      if (px !== null && px < MIN_PX) out.push({ tag, px, line: source.slice(0, index).split("\n").length });
    }
  }
  return out;
}

// ---------------------------------------------------------------- measure

/** Every field rule under 16px on a phone that nothing overrides, plus the unknowns. */
export function measure(root) {
  const fieldClasses = new Set();
  const inline = [];
  for (const dir of SCAN_DIRS) {
    for (const file of walk(root, dir, [".tsx", ".jsx"])) {
      const src = fs.readFileSync(path.join(root, file), "utf8");
      for (const c of fieldClassesFromTsx(src)) fieldClasses.add(c);
      for (const v of inlineSmallFields(src)) inline.push({ file, key: INLINE_KEY(v.tag), line: v.line, px: v.px });
    }
  }
  const sheets = SCAN_DIRS.flatMap((d) => walk(root, d, [".css"])).map((file) => ({ file, rules: parseCss(fs.readFileSync(path.join(root, file), "utf8")) }));
  const vars = collectVars(sheets.flatMap((s) => s.rules));
  const entries = [];
  for (const { file, rules } of sheets) {
    for (const r of rules) {
      const size = ruleFontSize(r.decls, vars);
      if (!size) continue;
      for (const selector of r.selectors) {
        const alts = expandIs(selector).filter((alt) => isFieldSelector(alt, fieldClasses));
        if (alts.length) entries.push({ file, rule: r, selector: selector.replace(/\s+/g, " "), alts, size });
      }
    }
  }
  const fixes = entries.filter((e) => e.size.px >= MIN_PX && appliesOnEveryPhone(e.rule.groups));
  // A fix wins when it is !important and the small rule is not, or when both
  // share importance and the fix comes later in the same file with at least
  // the same specificity. Across files, plain source order depends on the route.
  const wins = (fix, fixAlt, small, smallAlt) =>
    (fix.size.important && !small.size.important) ||
    (fix.size.important === small.size.important && fix.file === small.file && fix.rule.order > small.rule.order &&
      specificity(fixAlt) >= specificity(smallAlt));
  const violations = [], unknown = [];
  for (const e of entries) {
    if (!appliesOnSomePhone(e.rule.groups)) continue;
    if (e.size.unknown !== undefined) { unknown.push({ file: e.file, key: e.selector, line: e.rule.line, value: e.size.unknown }); continue; }
    if (e.size.px >= MIN_PX) continue;
    const fixed = e.alts.every((alt) =>
      fixes.some((f) => f.alts.some((fa) => covers(fa, alt) && wins(f, fa, e, alt))),
    );
    if (!fixed) violations.push({ file: e.file, key: e.selector, line: e.rule.line, px: e.size.px });
  }
  return { violations: [...violations, ...inline], unknown };
}

// ---------------------------------------------------------------- baseline

function counts(list) {
  const m = new Map();
  for (const { file, key } of list) m.set(`${file}\u0000${key}`, (m.get(`${file}\u0000${key}`) ?? 0) + 1);
  return m;
}

function baselineList(baseline) {
  return Object.entries(baseline ?? {}).flatMap(([file, keys]) => keys.map((key) => ({ file, key })));
}

/** { added, stale }: violations beyond the baseline, and baseline entries the tree no longer has. */
export function compare(current, baseline) {
  const base = counts(baselineList(baseline));
  const seen = new Map();
  const added = [];
  for (const v of current.violations) {
    const k = `${v.file}\u0000${v.key}`;
    seen.set(k, (seen.get(k) ?? 0) + 1);
    if (seen.get(k) > (base.get(k) ?? 0)) added.push(v);
  }
  const stale = [];
  for (const [k, n] of base) {
    const [file, key] = k.split("\u0000");
    for (let i = seen.get(k) ?? 0; i < n; i++) stale.push({ file, key });
  }
  return { added, stale };
}

export function serializeBaseline(current) {
  const byFile = {};
  for (const { file, key } of current.violations) (byFile[file] ??= []).push(key);
  const sorted = Object.fromEntries(Object.keys(byFile).sort().map((f) => [f, byFile[f].sort()]));
  return `${JSON.stringify(sorted, null, 2)}\n`;
}

export function loadBaseline(file) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
}

/** Rewrite the baseline from the tree; refuses ({ written: false, added }) when it would grow. */
export function writeBaseline(root, file = path.join(root, BASELINE_FILE)) {
  const current = measure(root);
  const existing = loadBaseline(file);
  const { added } = existing ? compare(current, existing) : { added: [] };
  if (added.length) return { written: false, added, current };
  fs.writeFileSync(file, serializeBaseline(current));
  return { written: true, current };
}

/**
 * The gate: { added, stale, current }, or a missing-baseline failure. In the
 * public fork a stale entry is not a failure: the sync removed internal
 * entities, so some baselined rules no longer style any field there, and the
 * baseline describes this repository, not the fork.
 */
export function checkMobileInputs(root, file = path.join(root, BASELINE_FILE)) {
  const current = measure(root);
  const baseline = loadBaseline(file);
  if (!baseline) return { current, added: current.violations, stale: [], missing: true };
  const { added, stale } = compare(current, baseline);
  return { current, added, stale: isForkTree(root) ? [] : stale };
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const file = path.join(root, BASELINE_FILE);
  const describe = (v) => `${v.file}:${v.line}: ${v.key} is ${Math.round(v.px * 100) / 100}px on a phone`;

  if (process.argv.includes("--write-baseline")) {
    const res = writeBaseline(root, file);
    if (!res.written) {
      for (const v of res.added) console.error(describe(v));
      console.error(`\ncheck-mobile-inputs: refusing to write ${BASELINE_FILE}: it would add ${res.added.length} entr${res.added.length === 1 ? "y" : "ies"}. The baseline only shrinks; give the field 16px on a phone instead.`);
      process.exit(1);
    }
    console.log(`check-mobile-inputs: wrote ${BASELINE_FILE} (${res.current.violations.length} known fields under ${MIN_PX}px on a phone).`);
    return;
  }

  const { current, added, stale, missing } = checkMobileInputs(root, file);
  if (process.argv.includes("--list")) {
    for (const v of current.violations) console.log(describe(v));
    for (const u of current.unknown) console.log(`${u.file}:${u.line}: ${u.key} has font size ${u.value}, which this check cannot evaluate`);
  }
  if (missing) {
    console.error(`check-mobile-inputs: ${BASELINE_FILE} is missing; run \`${REFRESH}\` to create it.`);
    process.exit(1);
  }
  for (const v of added) console.error(`${describe(v)}. iPhone Safari zooms in when a field under ${MIN_PX}px is tapped.`);
  for (const s of stale) console.error(`${s.file}: ${s.key} is in ${BASELINE_FILE} but no longer under ${MIN_PX}px on a phone.`);
  if (added.length) {
    console.error(
      `\ncheck-mobile-inputs: ${added.length} new field rule(s) under ${MIN_PX}px on a phone. Give the field ${MIN_PX}px ` +
        `on a phone in a rule that wins the cascade (later in the same file, or !important), or keep the small size ` +
        `inside a min-width query above the phone. See the header of scripts/check-mobile-inputs.mjs.`,
    );
  }
  if (stale.length) {
    console.error(
      `\ncheck-mobile-inputs: ${stale.length} baseline entr${stale.length === 1 ? "y is" : "ies are"} fixed. The baseline only shrinks, ` +
        `so remove them in the same commit: run \`${REFRESH}\` and commit ${BASELINE_FILE}.`,
    );
  }
  if (added.length || stale.length) process.exit(1);
  console.log(
    `check-mobile-inputs: ${current.violations.length} field rule(s) under ${MIN_PX}px on a phone, all in the baseline; ` +
      `${current.unknown.length} with a size this check cannot evaluate (--list shows them).`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
