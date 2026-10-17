// The hidden-control rule (ADR 0014, AE.1), run by check-access.mjs.
//
// Every server action is guarded: its first statement asks for a permission
// (ADR 0007), and that guard is the rule. A client component that calls one is
// still expected to hide the control from someone the guard would refuse, so a
// manager who may view a page never sees a button that would refuse them.
// Hiding is courtesy; the guard is the rule. The convention is a `may` prop
// typed `MayProp` (kernel/identity/may-prop.ts), filled by the server parent
// from the access object it already holds; a server tree uses the kernel's
// `<Can permission>` instead and needs no prop.
//
// This fails a "use client" file that imports an export of a server-action file
// (directly, or through an entity's client door) and does not take a MayProp.
// The files that predate the rule are listed, each with its reason, in
// scripts/access-may-allowlist.json. The list only shrinks: an entry whose
// file now takes the prop, or no longer imports an action, or is gone, is
// stale and fails; an entry the list on origin/main does not carry fails as
// added. No existing page is retrofitted by AE.1; each adopts the prop when
// its entity needs the view/manage split.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { isServerActionFile } from "./check-action-auth.mjs";

export const MAY_ALLOWLIST = "scripts/access-may-allowlist.json";

const SOURCE = /\.(ts|tsx)$/;
const TEST = /\.test\.(ts|tsx)$/;

/** Whether the file's first statement is the "use client" directive. */
export function isClientFile(src) {
  const body = src.replace(/^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*/, "");
  return /^["']use client["']/.test(body);
}

/** Whether a client file takes the `may` prop the convention names. */
export function takesMayProp(src) {
  return /\bMayProp\b/.test(src);
}

/** Every value import: { names: string[] | "*", spec }. Type-only imports are left out. */
export function valueImports(src) {
  const out = [];
  for (const m of src.matchAll(/^\s*import\s+(?!type\b)([\s\S]*?)\s+from\s+["']([^"']+)["']/gm)) {
    const clause = m[1].trim();
    const names = [];
    const named = /\{([\s\S]*)\}/.exec(clause);
    if (named) {
      for (const part of named[1].split(",")) {
        const p = part.trim();
        if (!p || p.startsWith("type ")) continue;
        names.push(p.split(/\s+as\s+/)[0].trim());
      }
    }
    const rest = clause.replace(/\{[\s\S]*\}/, "").replace(/,/g, " ").trim();
    if (rest.startsWith("* as")) out.push({ names: "*", spec: m[2] });
    else {
      if (rest) names.push("default");
      if (names.length > 0) out.push({ names, spec: m[2] });
    }
  }
  return out;
}

/** The re-exports of a door: { names: string[] | "*", spec }. */
function reExports(src) {
  const out = [];
  for (const m of src.matchAll(/^\s*export\s+(?!type\b)(\*|\{[\s\S]*?\})\s+from\s+["']([^"']+)["']/gm)) {
    if (m[1] === "*") out.push({ names: "*", spec: m[2] });
    else {
      const names = m[1]
        .slice(1, -1)
        .split(",")
        .map((p) => p.trim())
        .filter((p) => p && !p.startsWith("type "))
        .map((p) => p.split(/\s+as\s+/).pop().trim());
      out.push({ names, spec: m[2] });
    }
  }
  return out;
}

/** The repository path an import specifier names, or null for a package. */
export function resolveSpec(root, fromFile, spec) {
  let base;
  if (spec.startsWith("@/")) base = spec.slice(2);
  else if (spec.startsWith(".")) base = path.posix.join(path.posix.dirname(fromFile), spec);
  else return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    const abs = path.join(root, candidate);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return candidate;
  }
  return null;
}

function walk(root, dir, acc) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return acc;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.posix.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "node_modules" && !e.name.startsWith(".")) walk(root, rel, acc);
    } else if (SOURCE.test(e.name) && !TEST.test(e.name)) acc.push(rel);
  }
  return acc;
}

/**
 * Every client file that calls a server action without the convention:
 * [{ file, actions: ["<action file>#<export>", …] }], sorted by file.
 * `dirs` are the trees searched; `isPublicAction(file, name)` says an export
 * needs no permission (the action-auth allowlist).
 */
export function unguardedClientCalls(root, { dirs = ["app", "entities", "kernel"], isPublicAction = () => false } = {}) {
  const read = new Map();
  const src = (file) => {
    if (!read.has(file)) read.set(file, fs.readFileSync(path.join(root, file), "utf8"));
    return read.get(file);
  };
  const isAction = (file) => isServerActionFile(src(file));

  /** The action exports `names` of `file` reach, following one level of door re-exports. */
  const actionsReached = (file, names) => {
    if (isAction(file)) {
      const all = names === "*" ? [...src(file).matchAll(/^export\s+async\s+function\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]) : names;
      return all.filter((n) => !isPublicAction(file, n)).map((n) => `${file}#${n}`);
    }
    const out = [];
    for (const r of reExports(src(file))) {
      const target = resolveSpec(root, file, r.spec);
      if (!target || !isAction(target)) continue;
      const hit = names === "*" ? r.names : r.names === "*" ? names : names.filter((n) => r.names.includes(n));
      if (hit === "*" || hit.length > 0) out.push(...actionsReached(target, hit));
    }
    return out;
  };

  const out = [];
  for (const file of dirs.flatMap((d) => walk(root, d, []))) {
    const body = src(file);
    if (!isClientFile(body) || takesMayProp(body)) continue;
    const actions = [];
    for (const imp of valueImports(body)) {
      const target = resolveSpec(root, file, imp.spec);
      if (target && SOURCE.test(target)) actions.push(...actionsReached(target, imp.names));
    }
    if (actions.length > 0) out.push({ file, actions: [...new Set(actions)].sort() });
  }
  return out.sort((a, b) => a.file.localeCompare(b.file));
}

/** The allowlist: { why, entries: [{ file, reason }] }, or an empty one when there is none. */
export function readMayAllowlist(root) {
  const abs = path.join(root, MAY_ALLOWLIST);
  if (!fs.existsSync(abs)) return { why: "", entries: [] };
  const body = JSON.parse(fs.readFileSync(abs, "utf8"));
  if (!Array.isArray(body.entries)) throw new Error(`check-access: ${MAY_ALLOWLIST} has no "entries" array`);
  for (const e of body.entries) {
    if (typeof e.file !== "string" || typeof e.reason !== "string" || !e.reason.trim()) {
      throw new Error(`check-access: every entry in ${MAY_ALLOWLIST} names a file and a reason (${JSON.stringify(e)})`);
    }
  }
  return body;
}

/** The allowlisted files on origin/main, or null when there is no committed list to compare with. */
export function mayAllowlistOnMain(root) {
  try {
    const body = execFileSync("git", ["show", `origin/main:${MAY_ALLOWLIST}`], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return JSON.parse(body).entries.map((e) => e.file);
  } catch {
    return null;
  }
}

/**
 * { violations, stale, added } for the tree against the allowlist.
 * `onMain` is the allowlisted files on origin/main, or null. `exists(file)`
 * says the tree has the file: an entry for a file this tree lacks is stale
 * upstream, where it was deleted, but not in the public fork, which is staged
 * without the internal entities and receives the same list (`upstream` false).
 */
export function checkMay({ found, allowlist, onMain, exists = () => true, upstream = true }) {
  const allowed = new Set(allowlist.map((e) => e.file));
  const violating = new Set(found.map((f) => f.file));
  return {
    violations: found.filter((f) => !allowed.has(f.file)),
    stale: allowlist.map((e) => e.file).filter((f) => !violating.has(f) && (exists(f) || upstream)),
    added: onMain === null ? [] : allowlist.map((e) => e.file).filter((f) => !onMain.includes(f)),
  };
}
