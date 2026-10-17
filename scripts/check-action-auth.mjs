// Fails when a server action does not authorize before it touches data.
//
// Every `actions.ts` under app/ and entities/ runs against the service-role
// Supabase clients, which bypass RLS. Authorization lives entirely in the body:
// the first thing an exported action does must be `await requireAdmin()` (or
// one of its siblings), or it must call another function in the same file that
// does. The hand audit in the 2026-09-02 review found this held for every
// action, but nothing kept it true; a new file made by copying a page and
// forgetting the guard would ship green and expose a whole table. This script
// is the thing that makes it ship red instead.
//
// Deliberately dependency-free (Node built-ins only) so it can run in CI and on
// a fresh clone before `npm install`. It does not parse TypeScript; a
// brace-depth scan that skips strings, template literals and comments is enough
// for the shape of this codebase, and a pathological file that fools it fails
// loudly by being reported as ungated rather than silently passing.
//
// Genuinely public actions (login flows, bearer-token work submissions, code
// gates) live in scripts/action-auth-allowlist.json with a one-sentence reason
// each. An allowlist entry that no longer matches an export is itself a
// failure, so stale entries cannot rot in place. Entries for the actions behind
// the two access-code gates — the library entity's private route trees, mounted
// under app/workflows/private/ and app/private/ — live in the optional
// scripts/action-auth-allowlist.private.json instead: those directories are
// excluded from the 8-Edges-Fork sync, so in the fork the entries would be
// stale, and their names identify clients. The private half is excluded
// alongside them (see .github/fork-sync-exclude.txt) and is absent there.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// A body counts as gated when it awaits one of these. Each is a helper that
// throws or redirects when the caller is not who it must be.
export const GUARDS = [
  "requireAdmin",
  "requireSuperAdmin",
  "requireTeamMember",
  "requirePortalMember",
  "getAdminUser",
  "boardActorFor",
  // The boards module's one entry path: it resolves the row, then the actor,
  // through boardActorFor, and returns the denial Result itself.
  "boardMutation",
  "getTeamActor",
  "getPortalActor",
  // The permission guard (ADR 0013): refuses unless the signed-in person holds the
  // declared permission (kernel/identity/access-request.ts).
  "requirePermission",
  // The portal's form of it: a portal identity, then the permission, asked of
  // the client being viewed during an Assume session (same file).
  "requirePortalPermission",
];

const USE_SERVER = /^(["'])use server\1;?$/;

/** Whether the first non-comment, non-blank line of `source` is a "use server" directive. */
export function isServerActionFile(source) {
  let i = 0;
  const n = source.length;
  while (i < n) {
    // Skip whitespace.
    if (/\s/.test(source[i])) {
      i++;
      continue;
    }
    if (source.startsWith("//", i)) {
      const end = source.indexOf("\n", i);
      i = end === -1 ? n : end;
      continue;
    }
    if (source.startsWith("/*", i)) {
      const end = source.indexOf("*/", i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    const lineEnd = source.indexOf("\n", i);
    const line = source.slice(i, lineEnd === -1 ? n : lineEnd).trim();
    return USE_SERVER.test(line);
  }
  return false;
}

/**
 * Index of the `}` matching the `{` at `open`, or -1 when the file is
 * unbalanced. Skips over quoted strings, template literals (including nested
 * `${...}` expressions) and comments, because action bodies routinely contain
 * braces inside SQL-ish strings and interpolated messages.
 */
export function findMatchingBrace(source, open) {
  return findMatching(source, open, "{", "}");
}

// Same scan for any bracket pair; used for `(...)` parameter lists too.
function findMatching(source, open, openCh, closeCh) {
  const n = source.length;
  let depth = 0;
  let i = open;
  while (i < n) {
    const ch = source[i];
    if (ch === "/" && source[i + 1] === "/") {
      const end = source.indexOf("\n", i);
      if (end === -1) return -1;
      i = end;
      continue;
    }
    if (ch === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      if (end === -1) return -1;
      i = end + 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      i = skipQuoted(source, i, ch);
      if (i === -1) return -1;
      continue;
    }
    if (ch === "`") {
      i = skipTemplate(source, i);
      if (i === -1) return -1;
      continue;
    }
    if (ch === openCh) depth++;
    if (ch === closeCh) {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return -1;
}

/**
 * Index of the `{` that opens the body of a function whose parameter list
 * starts at `paren`, or -1. Parameter lists and return types both carry
 * braces (`input: { id: string }`, `Promise<{ ok: true } | { ok: false }>`),
 * so after the parameters every `{` that follows a type-position character
 * (`:`, `|`, `&`, `<`, `,`, `(`, `=`) is a type literal and is skipped as a
 * balanced group; the first `{` in any other position is the body.
 */
export function findBodyBrace(source, paren) {
  const closeParen = findMatching(source, paren, "(", ")");
  if (closeParen === -1) return -1;
  let prev = ")";
  for (let i = closeParen + 1; i < source.length; i++) {
    const ch = source[i];
    if (/\s/.test(ch)) continue;
    if (ch === "{") {
      if (!TYPE_POSITION.has(prev)) return i;
      const close = findMatching(source, i, "{", "}");
      if (close === -1) return -1;
      i = close;
      prev = "}";
      continue;
    }
    // A `;` before any body means this was an overload or ambient declaration.
    if (ch === ";") return -1;
    prev = ch;
  }
  return -1;
}

const TYPE_POSITION = new Set([":", "|", "&", "<", ",", "(", "="]);

// Returns the index just past the closing quote, or -1.
function skipQuoted(source, start, quote) {
  let i = start + 1;
  while (i < source.length) {
    const ch = source[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === quote) return i + 1;
    // An unterminated string on one line is a syntax error; bail rather than
    // swallow the rest of the file.
    if (ch === "\n") return -1;
    i++;
  }
  return -1;
}

// Returns the index just past the closing backtick, or -1. `${...}` expressions
// are walked with findMatchingBrace so a template that itself contains
// templates is handled.
function skipTemplate(source, start) {
  let i = start + 1;
  while (i < source.length) {
    const ch = source[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === "`") return i + 1;
    if (ch === "$" && source[i + 1] === "{") {
      const close = findMatchingBrace(source, i + 1);
      if (close === -1) return -1;
      i = close + 1;
      continue;
    }
    i++;
  }
  return -1;
}

const FUNCTION_DECL =
  /^[ \t]*(export[ \t]+)?(?:async[ \t]+)?function[ \t]+([A-Za-z_$][\w$]*)[ \t]*(?:<[^\n]*?>)?[ \t]*\(/gm;

// `export const foo = async (...) => { ... }` is a server action too, and Next
// exports it exactly the same way. FUNCTION_DECL does not match it, so before
// A.13 such an action was not collected at all — not ungated, invisible: the
// gate would report the file clean. No action in the tree used this shape when
// it was found, so nothing was exposed, but the next one written in it would
// have been. Matched here so it is checked like any other.
const CONST_FN_DECL =
  /^[ \t]*(export[ \t]+)?const[ \t]+([A-Za-z_$][\w$]*)[ \t]*(?::[^=\n]+)?=[ \t]*(?:async[ \t]*)?(?:<[^\n]*?>[ \t]*)?\(/gm;

/**
 * Every function declaration in `source`, exported or not, with its body text.
 * Non-exported helpers matter because an action may be gated by a local
 * wrapper (e.g. a file-private `requireClearedAdmin()` that itself awaits
 * `requireAdmin()`); the transitive check follows those too.
 */
export function extractFunctions(source) {
  const fns = [];
  for (const m of source.matchAll(FUNCTION_DECL)) {
    const name = m[2];
    const exported = Boolean(m[1]);
    const open = findBodyBrace(source, m.index + m[0].length - 1);
    const close = open === -1 ? -1 : findMatchingBrace(source, open);
    const line = source.slice(0, m.index).split("\n").length;
    fns.push({
      name,
      exported,
      line,
      // A body the scanner cannot locate or balance yields an empty string,
      // which can never pass, so a scanner miss surfaces as a violation
      // instead of a silent pass.
      body: close === -1 ? "" : source.slice(open + 1, close),
    });
  }
  for (const m of source.matchAll(CONST_FN_DECL)) {
    const name = m[2];
    const exported = Boolean(m[1]);
    // From the parameter list's `(`, find the arrow and then its body. An arrow
    // with an expression body (`=> foo(x)`) has no brace; its whole expression
    // is the body, which `callsGuard` can still read.
    const parenOpen = m.index + m[0].length - 1;
    const parenClose = findMatchingParen(source, parenOpen);
    if (parenClose === -1) continue;
    const arrow = source.indexOf("=>", parenClose);
    if (arrow === -1) continue;
    const rest = source.slice(arrow + 2);
    const leading = rest.match(/^\s*/)[0].length;
    const line = source.slice(0, m.index).split("\n").length;
    let body;
    if (rest[leading] === "{") {
      const open = arrow + 2 + leading;
      const close = findMatchingBrace(source, open);
      body = close === -1 ? "" : source.slice(open + 1, close);
    } else {
      // Expression body: read to the end of the statement.
      body = rest.slice(leading).split(/;\s*\n/)[0];
    }
    fns.push({ name, exported, line, body });
  }
  return fns;
}

/** Mate of findMatchingBrace, for the parameter list of an arrow function. */
function findMatchingParen(source, open) {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function callsGuard(body) {
  return GUARDS.some((g) => new RegExp(`await\\s+${g}\\s*\\(`).test(body));
}

function callsName(body, name) {
  return new RegExp(`(?<![\\w$.])${name.replace(/\$/g, "\\$")}\\s*\\(`).test(body);
}

/**
 * Names of functions in `fns` that are gated, directly or by calling another
 * gated function in the same file. Fixed-point iteration handles chains of any
 * length and ignores cycles. `externallyGated` maps local identifiers to true
 * when they are imports whose source is already known to be gated.
 */
export function gatedFunctionNames(fns, externallyGated = new Set()) {
  const gated = new Set(fns.filter((f) => callsGuard(f.body)).map((f) => f.name));
  let changed = true;
  while (changed) {
    changed = false;
    for (const f of fns) {
      if (gated.has(f.name)) continue;
      for (const g of [...gated, ...externallyGated]) {
        if (callsName(f.body, g)) {
          gated.add(f.name);
          changed = true;
          break;
        }
      }
    }
  }
  return gated;
}

const IMPORT_DECL = /import\s*(?:type\s+)?\{([^}]*)\}\s*from\s*(["'])([^"']+)\2/g;

/**
 * Relative imports of the form `import { a, b as c } from "./x"`, as
 * { local, imported, spec }. Only relative specifiers are returned: a wrapper
 * that re-exports an action from a sibling server-action file (the
 * company/actions.ts pattern) is gated by the file it imports from, and that
 * file is itself in the checked set, so following the import is sound. Bare
 * specifiers (`@/kernel/...`, `@/entities/...`) are not followed; helpers
 * there are not actions, and an entity's own actions are in the checked set.
 */
export function extractRelativeImports(source) {
  const out = [];
  for (const m of source.matchAll(IMPORT_DECL)) {
    const spec = m[3];
    if (!spec.startsWith(".")) continue;
    for (const raw of m[1].split(",")) {
      const part = raw.trim().replace(/^type\s+/, "");
      if (!part || raw.trim().startsWith("type ")) continue;
      const [imported, local = imported] = part.split(/\s+as\s+/).map((x) => x.trim());
      out.push({ local, imported, spec });
    }
  }
  return out;
}

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      walk(full, out);
    } else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

function resolveImport(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const candidate of [base, `${base}.ts`, path.join(base, "index.ts")]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/**
 * Check every server-action file under `root`'s app/ and entities/ against
 * `allowlist`. Returns { checked, violations, stale } where violations are
 * ungated exports not on the allowlist and stale are allowlist entries with no
 * matching export.
 *
 * entities/ is scanned as well as app/ because a route body that moves into an
 * entity (ME-04 …) takes its `actions.ts` with it, and a guard gate that only
 * looked at app/ would quietly stop seeing the actions it exists to check.
 */
export function checkActionAuth({ root, appDirs = ["app", "entities"], allowlist }) {
  const files = appDirs
    .map((d) => path.join(root, d))
    .filter((abs) => fs.existsSync(abs))
    .flatMap((abs) => walk(abs, []))
    .sort();

  // Pass 1: parse every server-action file once.
  const modules = new Map();
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    if (!isServerActionFile(source)) continue;
    modules.set(file, {
      file,
      rel: path.relative(root, file).split(path.sep).join("/"),
      fns: extractFunctions(source),
      imports: extractRelativeImports(source),
      gated: new Set(),
    });
  }

  // Pass 2: fixed point across files. A module's gated set can only grow, so
  // iterating until nothing changes converges; cycles between files cannot
  // make anything gated that was not gated by a real guard somewhere.
  let changed = true;
  while (changed) {
    changed = false;
    for (const mod of modules.values()) {
      const external = new Set();
      for (const imp of mod.imports) {
        const target = resolveImport(mod.file, imp.spec);
        const targetMod = target && modules.get(target);
        if (!targetMod) continue;
        const exported = targetMod.fns.find((f) => f.exported && f.name === imp.imported);
        if (exported && targetMod.gated.has(imp.imported)) external.add(imp.local);
      }
      const gated = gatedFunctionNames(mod.fns, external);
      if (gated.size !== mod.gated.size) {
        mod.gated = gated;
        changed = true;
      }
    }
  }

  const allowed = new Set(allowlist.map((e) => `${e.file} ${e.export}`));
  const seen = new Set();
  const violations = [];
  let checked = 0;
  for (const mod of modules.values()) {
    for (const fn of mod.fns) {
      if (!fn.exported) continue;
      checked++;
      const key = `${mod.rel} ${fn.name}`;
      if (allowed.has(key)) {
        seen.add(key);
        continue;
      }
      if (!mod.gated.has(fn.name)) {
        violations.push({ file: mod.rel, line: fn.line, export: fn.name });
      }
    }
  }

  const stale = allowlist.filter((e) => !seen.has(`${e.file} ${e.export}`));
  return { checked, violations, stale };
}

export function loadAllowlist(file, { optional = false } = {}) {
  if (optional && !fs.existsSync(file)) return [];
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(parsed)) throw new Error(`${file}: expected a JSON array`);
  for (const [i, e] of parsed.entries()) {
    for (const k of ["file", "export", "reason"]) {
      if (typeof e?.[k] !== "string" || e[k].trim() === "") {
        throw new Error(`${file}: entry ${i} is missing a non-empty "${k}"`);
      }
    }
  }
  return parsed;
}

function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(here, "..");
  const allowlist = [
    ...loadAllowlist(path.join(here, "action-auth-allowlist.json")),
    ...loadAllowlist(path.join(here, "action-auth-allowlist.private.json"), { optional: true }),
  ];
  const { checked, violations, stale } = checkActionAuth({ root, allowlist });

  for (const v of violations) {
    console.error(`${v.file}:${v.line} ${v.export}`);
  }
  for (const s of stale) {
    console.error(
      `${s.file} ${s.export}: allowlist entry matches no exported server action ` +
        `(stale — remove it from scripts/action-auth-allowlist.json)`,
    );
  }
  if (violations.length > 0 || stale.length > 0) {
    console.error(
      `\ncheck-action-auth: ${violations.length} ungated server action(s), ` +
        `${stale.length} stale allowlist entr(y/ies). Every exported action must ` +
        `await one of ${GUARDS.join(", ")} (directly, via another function in ` +
        `the same file, or via an action imported from another server-action file), or be listed in scripts/action-auth-allowlist.json with a reason.`,
    );
    process.exit(1);
  }
  console.log(
    `check-action-auth: ${checked} server actions checked, all gated or allowlisted ` +
      `(${allowlist.length} allowlisted).`,
  );
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
