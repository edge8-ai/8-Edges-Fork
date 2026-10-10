// Proves every entity's client door is browser-safe (multi-entity design §3,
// "two doors per entity", ME-13).
//
// entities/<name>/index.ts is a server barrel; entities/<name>/client.ts is the
// one a "use client" component may import. A barrel is bundled whole, so the
// door is only as safe as everything it reaches: this test walks the transitive
// import graph of each client.ts — relative and `@/` imports, .ts/.tsx only —
// and fails on the first module that imports a server-only package or the
// service-role Supabase client, carries the "use server" directive, or pulls a
// Node built-in. Packages other than the named server-only ones are not walked:
// react, next/navigation and the like are the browser's own.
//
// A static check rather than a bundle: `next build` is the real client-bundle
// test and runs in CI, but it takes minutes and reports the failure as a
// webpack trace; this names the offending module and the path to it in under a
// second, from `npm test`.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { entityNames, loadManifest } from "./entity-manifest.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = loadManifest(ROOT);

// Package names (or prefixes) that only make sense on the server: the kernel's
// service-role client, `next/headers` (reads the request) and the Node-only SDKs.
export const SERVER_ONLY_MODULES = [
  // The service-role clients. `@/kernel/data/supabase/browser` is the one
  // module under that path a browser may have, so it is named as an exception
  // rather than caught by the prefix.
  "@/kernel/data/supabase",
  "next/headers",
  "server-only",
  "@anthropic-ai/sdk",
  "postgres",
  "mammoth",
  "node:",
  "stripe",
];

const USE_SERVER = /^\s*["']use server["'];?\s*$/m;

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/[^\n]*/g, "$1");
}

/**
 * Every static, dynamic and re-export specifier in `source` that survives
 * compilation. `import type`, `export type … from` and an import whose every
 * specifier is inline `type` are erased by TypeScript and bundle nothing, so a
 * type taken from a server module is not an edge here (it is not one in the
 * browser either).
 */
export function specifiersOf(source) {
  const out = [];
  const src = stripComments(source)
    // A type-only statement is erased only within its own statement (no ";" and
    // no blank line between `type` and `from`), so an `export type X = {...}`
    // followed later by a real value import cannot swallow that import.
    .replace(/\b(import|export)\s+type\s[^;]*?from\s+["'][^"']+["']/g, "")
    .replace(/\bimport\s*\{\s*(type\s+[\w$]+(\s+as\s+[\w$]+)?\s*,\s*)*type\s+[\w$]+(\s+as\s+[\w$]+)?\s*,?\s*\}\s*from\s+["'][^"']+["']/g, "");
  for (const re of [/\bfrom\s+["']([^"']+)["']/g, /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g, /\bimport\s+["']([^"']+)["']/g]) {
    for (const m of src.matchAll(re)) out.push(m[1]);
  }
  return out;
}

const NODE_BUILTINS = new Set(
  (await import("node:module")).builtinModules.filter((m) => !m.startsWith("_")),
);

export const BROWSER_SAFE_EXCEPTIONS = ["@/kernel/data/supabase/browser"];

// What a "use client" component may never reach. `next/headers` and
// `server-only` are the two Next itself refuses in a client bundle, so reaching
// one is a build failure. The service-role client is the one it does NOT refuse:
// kernel/data/supabase.ts falls back to a placeholder URL and key when the
// secret is absent, so a component that reaches it compiles, builds and ships
// the data layer to the browser with a console warning — which is how thirteen
// components (the roadmap view, the two assignment cards, the marketing
// calendar) were doing exactly that while every gate stayed green. The wider
// list above is the door's standard: a barrel is bundled whole, so anything
// server-shaped in it is wrong even when webpack would have shaken it out.
export const BUILD_BREAKING_MODULES = ["next/headers", "server-only", "@/kernel/data/supabase"];

export function isServerOnly(spec, markers = SERVER_ONLY_MODULES) {
  if (BROWSER_SAFE_EXCEPTIONS.includes(spec)) return false;
  if (NODE_BUILTINS.has(spec.replace(/^node:/, "").split("/")[0])) return true;
  return markers.some((m) => spec === m || spec.startsWith(m.endsWith(":") ? m : `${m}/`));
}

/** Repo-relative file for a relative or `@/` specifier, or null for a package. */
function resolveLocal(spec, importerRel) {
  let stem;
  if (spec.startsWith("@/")) stem = spec.slice(2);
  else if (spec.startsWith("./") || spec.startsWith("../")) {
    stem = path.posix.normalize(path.posix.join(path.posix.dirname(importerRel), spec));
  } else return null;
  if (/\.(css|json|svg|png|jpg|webp)$/.test(stem)) return "asset";
  const bare = stem.replace(/\.(ts|tsx)$/, "");
  for (const candidate of [`${bare}.ts`, `${bare}.tsx`, `${bare}/index.ts`, `${bare}/index.tsx`]) {
    if (fs.existsSync(path.join(ROOT, candidate))) return candidate;
  }
  return "missing";
}

/**
 * Walks the import graph from `entryRel`. Returns the list of problems, each
 * naming the offending module and the chain of files that led there, and the
 * set of files visited (so a caller can see the walk was not vacuous).
 */
/**
 * Walk a module's transitive imports for anything the browser cannot have.
 *
 * `pruneServerActions` is the difference between the two callers. A client door
 * is a barrel bundled whole, so a "use server" module reached from it is a
 * problem. A "use client" component importing a server action directly is the
 * ordinary React pattern — Next replaces it with an RPC stub and bundles none of
 * it — so for that walk the action is a boundary to stop at, not a fault.
 */
export function walkClientGraph(entryRel, { pruneServerActions = false, markers = SERVER_ONLY_MODULES } = {}) {
  const problems = [];
  const visited = new Set();
  const stack = [[entryRel, [entryRel]]];
  while (stack.length > 0) {
    const [rel, chain] = stack.pop();
    if (visited.has(rel)) continue;
    visited.add(rel);
    const source = fs.readFileSync(path.join(ROOT, rel), "utf8");
    if (USE_SERVER.test(source.split("\n").slice(0, 5).join("\n"))) {
      if (!pruneServerActions) {
        problems.push(`${rel} is a "use server" actions module (via ${chain.join(" -> ")})`);
      }
      continue;
    }
    for (const spec of specifiersOf(source)) {
      if (isServerOnly(spec, markers)) {
        problems.push(`${rel} imports server-only "${spec}" (via ${chain.join(" -> ")})`);
        continue;
      }
      const next = resolveLocal(spec, rel);
      if (next === null || next === "asset") continue;
      if (next === "missing") {
        problems.push(`${rel} imports "${spec}", which resolves to no .ts/.tsx file`);
        continue;
      }
      if (!visited.has(next)) stack.push([next, [...chain, next]]);
    }
  }
  return { problems, visited };
}

describe("isServerOnly", () => {
  it("treats bare and node: builtins alike", () => {
    expect(isServerOnly("fs")).toBe(true);
    expect(isServerOnly("node:fs")).toBe(true);
    expect(isServerOnly("path/posix")).toBe(true);
    expect(isServerOnly("react")).toBe(false);
  });
});

describe("specifiersOf", () => {
  it("does not let a type alias above a value import hide that import", () => {
    const src = `export type X = { a: 1 };\nimport { db } from "@/lib/supabase";\n`;
    expect(specifiersOf(src)).toEqual(["@/lib/supabase"]);
  });

  it("drops type-only imports, which the compiler erases", () => {
    const src = `import type { A } from "@/server/a";
import { type B, type C as D } from "@/server/b";
export type { E } from "@/server/e";
import { f, type G } from "@/client/f";
import "./side-effect";
`;
    expect(specifiersOf(src)).toEqual(["@/client/f", "./side-effect"]);
  });
});

describe("entity client doors", () => {
  const names = entityNames(manifest);

  it("exist for every entity in the manifest", () => {
    const missing = names.filter((n) => !fs.existsSync(path.join(ROOT, manifest.entities[n].target, "client.ts")));
    expect(missing, "add entities/<name>/client.ts, even if it exports nothing").toEqual([]);
  });

  it.each(names)("%s: client.ts transitively imports nothing server-only", (name) => {
    const entry = `${manifest.entities[name].target}/client.ts`;
    const { problems, visited } = walkClientGraph(entry);
    expect(visited.has(entry)).toBe(true);
    expect(problems).toEqual([]);
  });

  // Every "use client" file in the tree, not only the doors. RS-14 found two
  // that had drifted: an admin control importing crm's server barrel for a
  // server action, and the survey builder importing the module that reads the
  // responses rather than the client-safe schema beside it. Both compiled and
  // typechecked; only `next build` caught them, minutes later and as a webpack
  // trace. This is the same walk, run from each component — against the
  // narrower marker list, because this asks the question the build asks: can
  // the browser have this at all.
  const clientComponents = (() => {
    const out = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        if (/^(node_modules|\.next|\.git)$/.test(e.name)) continue;
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(rel);
        else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
          const head = fs.readFileSync(path.join(ROOT, rel), "utf8").split("\n", 3).join("\n");
          if (/^\s*["']use client["'];?\s*$/m.test(head)) out.push(rel);
        }
      }
    };
    for (const dir of ["entities", "kernel", "app"]) walk(dir);
    return out;
  })();

  it("finds the client components to check, so the assertion below is not vacuous", () => {
    expect(clientComponents.length).toBeGreaterThan(50);
  });

  it.each(clientComponents)("%s transitively imports nothing server-only", (rel) => {
    expect(
      walkClientGraph(rel, { pruneServerActions: true, markers: BUILD_BREAKING_MODULES }).problems,
    ).toEqual([]);
  });

  it("would catch the server barrel: every index.ts trips the walk", () => {
    // Guard the guard. The indexes are server barrels by design, so a walk that
    // found nothing in one of them would mean the marker list has gone stale.
    // The site index is the one deliberate exception: it is kept free of
    // Supabase and the filesystem so a client component could import it before
    // the doors existed (see its header).
    const clean = names
      .filter((n) => n !== "site")
      .filter((n) => walkClientGraph(`${manifest.entities[n].target}/index.ts`).problems.length === 0);
    expect(clean).toEqual([]);
  });
});
