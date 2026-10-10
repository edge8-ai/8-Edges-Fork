// Emits every route file under `app/` from the entity route trees of one
// deployment (RS-16, spec §P4). This is the last piece of the composition root
// that was hand-written, and the one that made "turn an entity off" only
// half-true: the generated registries named the installed entities, but the 397
// mounts compiled every route regardless.
//
// What a mount is, and therefore what has to be derived:
//
//   the app path      `entities/<e>/routes/<rest>` is `app/<rest>`, `api/<rest>`
//                     is `app/api/<rest>`, and `crons/<n>.ts` is
//                     `app/api/cron/<n>/route.ts`. Total, with no exceptions,
//                     since the trees were normalised — which is what
//                     "routes/ mirrors the app tree" always claimed.
//   the symbols       Next binds a route by name, so the mount re-exports the
//                     names Next looks for and nothing else. Read off the
//                     entity file's own exports, intersected with the contract
//                     below, so adding `generateMetadata` to a page needs no
//                     edit here.
//   segment + styles  The two things Next reads by static analysis of the file
//                     in `app/` and will NOT see through a re-export. They
//                     cannot be derived, so each entity states them for its own
//                     routes in `entities/<name>/mounts.ts`.
//
// Deliberately dependency-free (Node built-ins only), like the other gates.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadManifest } from "./entity-manifest.mjs";
import { loadDeployments, closureOf } from "./check-deployment.mjs";

/** The only names a mount ever re-exports: Next's route contract, in the order
 *  Next's own docs list them, so the output is stable. */
export const ROUTE_CONTRACT = [
  "default",
  "metadata",
  "generateMetadata",
  "generateStaticParams",
  "size",
  "contentType",
  "alt",
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
];

// Next decides what is a route by filename, and so does this: a component that
// happens to `export default` sits beside its page under routes/ and must not
// get a mount. `crons/` is exempt — every file there is a handler, and its
// filename becomes the URL segment.
const ROUTE_FILES = new Set([
  "page",
  "layout",
  "route",
  "template",
  "default",
  "error",
  "global-error",
  "loading",
  "not-found",
  "opengraph-image",
  "twitter-image",
  "icon",
  "apple-icon",
  "sitemap",
  "robots",
  "manifest",
]);

/** Route-segment config keys, in the order they are emitted. */
const SEGMENT_KEYS = [
  "runtime",
  "dynamic",
  "dynamicParams",
  "revalidate",
  "fetchCache",
  "preferredRegion",
  "maxDuration",
];

/**
 * What every cron and API mount gets unless its entity declares otherwise.
 * `dynamic = "force-dynamic"` does not stop supabase-js reads being served from
 * Next's Data Cache, because they go through the patched global fetch; from 19
 * to 25 Sep 2026 the onboarding cron read stale rows that way, sent the Day 8
 * survey every morning and promoted one hire twice. Pages are left to their
 * entity: they prerender, and a client-wide no-store broke that build (#1643).
 *
 * Next 15 stopped caching fetch by default, so this now matches what an
 * unconfigured route does (B.18.2). It stays explicit: the stale-row incident
 * above came from a default, and a mount should not depend on the next one.
 */
const SERVER_SEGMENT_DEFAULTS = { fetchCache: '"force-no-store"' };

const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/[^\n]*/g, "$1");

/** The contract names a module exports, in contract order. */
export function contractExports(src) {
  const clean = stripComments(src);
  const found = new Set();
  if (/^export\s+default\b/m.test(clean)) found.add("default");
  for (const m of clean.matchAll(/^export\s+(?:async\s+)?(?:const|let|function|class)\s+([A-Za-z0-9_$]+)/gm)) {
    found.add(m[1]);
  }
  for (const m of clean.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const part of m[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (name) found.add(name.replace(/^type\s+/, ""));
    }
  }
  return ROUTE_CONTRACT.filter((n) => found.has(n));
}

/**
 * One entity's `mounts.ts`, as raw source fragments keyed by route path. Parsed
 * rather than imported: this script runs before a build, so it must not pull a
 * TypeScript module (or a route's whole dependency graph) into Node.
 */
export function mountsOf(root, target) {
  const file = path.join(root, target, "mounts.ts");
  if (!fs.existsSync(file)) return {};
  const src = fs.readFileSync(file, "utf8");
  const out = {};
  for (const m of src.matchAll(/^  "([^"]+)": \{\n([\s\S]*?)\n  \},$/gm)) {
    out[m[1]] = parseMount(m[2]);
  }
  return out;
}

/** One route's entry, from the source fragment between its braces. */
export function parseMount(body) {
  const out = {};
  const seg = /segment: \{([^}]*)\}/.exec(body);
  if (seg) {
    out.segment = {};
    for (const pair of seg[1].split(",")) {
      const m = /^\s*([A-Za-z]+):\s*(.+?)\s*$/.exec(pair);
      if (m) out.segment[m[1]] = m[2];
    }
  }
  const styles = /styles: \[([^\]]*)\]/.exec(body);
  if (styles) {
    out.styles = [...styles[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  }
  const alias = /alias: \{([^}]*)\}/.exec(body);
  if (alias) {
    out.alias = {};
    for (const pair of alias[1].split(",")) {
      const m = /^\s*([A-Za-z]+):\s*"([^"]+)"\s*$/.exec(pair);
      if (m) out.alias[m[1]] = m[2];
    }
  }
  if (/useClient: true/.test(body)) out.useClient = true;
  const slots = /slots: \{([^}]*)\}/.exec(body);
  if (slots) {
    out.slots = {};
    for (const pair of slots[1].split(",")) {
      const m = /^\s*([A-Za-z]+):\s*"([A-Za-z_]+)"\s*$/.exec(pair);
      if (m) out.slots[m[1]] = m[2];
    }
  }
  return out;
}

const sourceFiles = (dir, out = []) => {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) sourceFiles(p, out);
    else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p);
  }
  return out;
};

/** Where a route file in an entity mounts under `app/`, or null if it is not a route. */
export function appPathOf(rel) {
  const m = /^entities\/[a-z-]+\/(routes|api|crons)\/(.+)\.(ts|tsx)$/.exec(rel);
  if (!m) return null;
  const [, kind, rest, ext] = m;
  if (kind === "crons") return `app/api/cron/${rest}/route.${ext}`;
  if (!ROUTE_FILES.has(rest.split("/").pop())) return null;
  if (kind === "api") return `app/api/${rest}.${ext}`;
  return `app/${rest}.${ext}`;
}

/** Every mount one deployment installs: { appPath, specifier, symbols, ...mount }. */
export function mountsFor(root, manifest, included) {
  const out = [];
  for (const name of [...included].sort()) {
    const target = manifest.entities[name].target;
    const declared = mountsOf(root, target);
    for (const kind of ["routes", "api", "crons"]) {
      for (const abs of sourceFiles(path.join(root, target, kind))) {
        const rel = path.relative(root, abs).split(path.sep).join("/");
        const appPath = appPathOf(rel);
        if (!appPath) continue;
        const src = fs.readFileSync(abs, "utf8");
        const symbols = contractExports(src);
        // A file under routes/ that exports none of the contract is a component
        // the route composes, not a route: it gets no mount.
        if (symbols.length === 0) continue;
        const key = rel.slice(`${target}/`.length).replace(/\.(ts|tsx)$/, "");
        const entry = declared[key] ?? {};
        out.push({
          appPath,
          specifier: `@/${rel.replace(/\.(ts|tsx)$/, "")}`,
          entity: name,
          symbols,
          ...entry,
          ...(kind === "routes" ? {} : { segment: { ...SERVER_SEGMENT_DEFAULTS, ...entry.segment } }),
        });
      }
    }
  }
  return out;
}

export function renderMount(mount) {
  const lines = [];
  if (mount.useClient) lines.push('"use client";', "");
  lines.push(
    `// GENERATED by scripts/gen-app-mounts.mjs — do not edit.`,
    `// The body lives in ${mount.specifier.replace(/^@\//, "")}; this file`,
    `// exists because Next binds a route by the exports of the file under app/.`,
    `// Anything below that a re-export cannot carry is declared by the entity, in`,
    `// its mounts.ts.`,
  );
  for (const css of mount.styles ?? []) lines.push(`import ${JSON.stringify(css)};`);
  const names = mount.symbols.map((s) => {
    const alias = Object.entries(mount.alias ?? {}).find(([, from]) => from === s);
    return alias ? `${s}, ${s} as ${alias[0]}` : s;
  });
  const slots = Object.entries(mount.slots ?? {});
  if (slots.length && mount.symbols.includes("default")) {
    // A page that takes slots (W.169.4): the mount imports the body, wraps it,
    // and hands it what app/shell.ts provides for this deployment, so the
    // entity never names the provider. Everything else is re-exported as usual.
    const rest = names.filter((n) => n !== "default");
    lines.push(`import type { ComponentProps } from "react";`);
    lines.push(`import Body from ${JSON.stringify(mount.specifier)};`);
    lines.push(`import { ${slots.map(([, slot]) => slot).join(", ")} } from "@/app/shell";`);
    if (rest.length) lines.push(`export { ${rest.join(", ")} } from ${JSON.stringify(mount.specifier)};`);
    const given = slots.map(([prop, slot]) => `${prop}={${slot}}`).join(" ");
    const omitted = slots.map(([prop]) => JSON.stringify(prop)).join(" | ");
    lines.push(
      "",
      `export default function Page(props: Omit<ComponentProps<typeof Body>, ${omitted}>) {`,
      `  return <Body {...props} ${given} />;`,
      `}`,
    );
  } else {
    lines.push(`export { ${names.join(", ")} } from ${JSON.stringify(mount.specifier)};`);
  }
  const segment = SEGMENT_KEYS.filter((k) => mount.segment && k in mount.segment);
  if (segment.length) {
    lines.push("");
    for (const k of segment) lines.push(`export const ${k} = ${mount.segment[k]};`);
  }
  return `${lines.join("\n")}\n`;
}

/** The generated app/ tree for one deployment, as { path: contents }. */
export function generateMounts(root, deploymentName, manifest = loadManifest(root)) {
  const deployment = loadDeployments(root).find((d) => d.name === deploymentName);
  if (!deployment) throw new Error(`gen-app-mounts: no deployments/${deploymentName}.json`);
  const included = closureOf(manifest, deployment.entities);
  // An installed entity can serve pages on a surface whose shell this build
  // drops (company-os's revenue pages under /team, in a build without team).
  // Those pages would sit under a layout that is not there, so they are left
  // out with the shell; see SURFACE_LAYOUT_OWNER.
  const droppedSurfaces = orphanLayouts(included).map((layout) => layout.replace(/layout\.tsx$/, ""));
  const files = {};
  for (const mount of mountsFor(root, manifest, included)) {
    if (droppedSurfaces.some((dir) => mount.appPath.startsWith(dir))) continue;
    if (files[mount.appPath]) {
      throw new Error(`gen-app-mounts: two entities claim ${mount.appPath}`);
    }
    files[mount.appPath] = renderMount(mount);
  }
  return files;
}

/** The entities one deployment installs, closed under `requires`. */
export function installedEntities(root, deploymentName, manifest = loadManifest(root)) {
  const deployment = loadDeployments(root).find((d) => d.name === deploymentName);
  if (!deployment) throw new Error(`gen-app-mounts: no deployments/${deploymentName}.json`);
  return closureOf(manifest, deployment.entities);
}

// A surface shell is hand-written, but it belongs to a surface, and a surface
// belongs to an entity: the team hub exists because the team entity does. A
// deployment that leaves that entity out has no pages under the shell and no
// business bundling its layout, which imports the entity's doors — the minimal
// build carried team and coaching code that way with nothing to show for it.
// The shell is kept only when its entity is installed.
export const SURFACE_LAYOUT_OWNER = {
  "app/admin/(dashboard)/layout.tsx": "company-os",
  "app/team/(dashboard)/layout.tsx": "team",
  "app/portal/(dashboard)/layout.tsx": "portal",
};

/** Hand-written shells this deployment must not carry. */
export function orphanLayouts(installed) {
  return Object.entries(SURFACE_LAYOUT_OWNER)
    .filter(([, entity]) => !installed.has(entity))
    .map(([layout]) => layout);
}

// Files under app/ that are the composition root's own and are never generated:
// the root layout and its boundaries, the auth callback, the three surface
// shells (they compose the kernel shell with the generated navigation, which no
// entity may name) and the generated registries themselves.
export const HAND_WRITTEN = new Set([
  "app/layout.tsx",
  "app/error.tsx",
  "app/not-found.tsx",
  "app/api/auth/callback/route.ts",
  "app/admin/(dashboard)/layout.tsx",
  "app/team/(dashboard)/layout.tsx",
  "app/portal/(dashboard)/layout.tsx",
  "app/events.ts",
  "app/nav.ts",
  "app/env.ts",
  "app/shell.ts",
  "app/search.ts",
  "app/permissions.ts",
  "app/access.ts",
  "app/routines.ts",
]);

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const name = process.env.EDGE8_DEPLOYMENT ?? "edge8";
  const check = process.argv.includes("--check");
  const files = generateMounts(root, name);
  const orphans = new Set(orphanLayouts(installedEntities(root, name)));

  const existing = sourceFiles(path.join(root, "app"))
    .map((p) => path.relative(root, p).split(path.sep).join("/"))
    .filter((p) => (!HAND_WRITTEN.has(p) || orphans.has(p)) && !p.includes("__tests__"));

  const stale = existing.filter((p) => !(p in files));
  const changed = Object.entries(files).filter(([p, body]) => {
    const abs = path.join(root, p);
    return !fs.existsSync(abs) || fs.readFileSync(abs, "utf8") !== body;
  });

  if (check) {
    if (stale.length === 0 && changed.length === 0) {
      console.log(`check-app-mounts: ${Object.keys(files).length} mount(s) match deployments/${name}.json.`);
      return;
    }
    for (const p of stale) console.error(`app/ has ${p}, which no installed entity mounts`);
    for (const [p] of changed) console.error(`${p} is stale against its entity route`);
    console.error(
      `\ncheck-app-mounts: ${stale.length + changed.length} mount(s) disagree with ` +
        `deployments/${name}.json. Run \`npm run gen:app-mounts\` and commit the result.`,
    );
    process.exit(1);
  }

  for (const [p, body] of changed) {
    const abs = path.join(root, p);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body);
  }
  for (const p of stale) fs.rmSync(path.join(root, p));
  console.log(
    `gen-app-mounts: ${Object.keys(files).length} mount(s) for ${name} ` +
      `(${changed.length} written, ${stale.length} removed).`,
  );
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
