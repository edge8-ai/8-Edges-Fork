// Fails when an `outputFileTracingIncludes` entry in next.config.mjs does not
// reach the route it names.
//
// Next matches those keys as globs against route paths, so a key written with a
// literal dynamic segment can look right and match nothing. Twice in one day a
// route 404ed in production because its fonts were never traced, and the only
// evidence was the route's own `.nft.json` after `next build` (review-team
// input, 2026-09-03; AR-38). This script reads that evidence: for every key it
// finds the built route's `.nft.json` and asserts at least one traced file
// matches each include glob.
//
// It needs a build, so it runs as `postbuild` (Vercel runs it after `next
// build`) and locally after `npm run build`. Without a build it fails, unless
// `--if-built` is passed, in which case it says so and exits 0 so `npm run
// check` can stay build-free.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = path.resolve(here, "..");

/** Read the includes map out of next.config.mjs by importing it. */
export async function readIncludes(root) {
  const mod = await import(path.join(root, "next.config.mjs"));
  const cfg = mod.default ?? mod;
  return cfg.experimental?.outputFileTracingIncludes ?? cfg.outputFileTracingIncludes ?? {};
}

/**
 * Minimal glob → RegExp: `**` any depth, `*` one segment, `?` one character,
 * everything else literal.
 *
 * Written as a single left-to-right scan rather than a chain of `.replace()`
 * calls, because chained replaces corrupt each other: the expansion of `**` is
 * `(?:.*\/)?`, which contains both `*` and `?`, so a later pass rewrites the
 * regex it had just produced. That bug made `private-docs/**\/*` match nothing
 * and reported a healthy build as broken.
 */
export function globToRegExp(glob) {
  const SPECIAL = new Set([".", "+", "^", "$", "{", "}", "(", ")", "|", "[", "]", "\\"]);
  let out = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      const double = glob[i + 1] === "*";
      if (double) {
        i++;
        if (glob[i + 1] === "/") {
          i++;
          out += "(?:.*/)?"; // `**/` — zero or more whole segments
        } else {
          out += ".*"; // trailing `**` — anything, separators included
        }
      } else {
        out += "[^/]*"; // one segment
      }
    } else if (c === "?") {
      out += "[^/]";
    } else if (SPECIAL.has(c)) {
      out += "\\" + c;
    } else {
      out += c;
    }
  }
  return new RegExp(`^${out}$`);
}

/** Every `.nft.json` under .next/server/app, keyed by its route path ("/post/[slug]/opengraph-image"). */
export function listRouteTraces(root) {
  const base = path.join(root, ".next", "server", "app");
  const out = new Map();
  if (!fs.existsSync(base)) return out;
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith(".nft.json")) {
        const rel = path.relative(base, full).replace(/\\/g, "/");
        // Next writes "<route dir>/page.js.nft.json" / "route.js.nft.json" — the
        // ".js" is part of the name, so a regex that only strips ".nft.json"
        // leaves it behind and every key then matches nothing. The real Vercel
        // build caught exactly that; the fixture had encoded the wrong shape.
        // "post/[slug]/opengraph-image/route.js.nft.json" → "/post/[slug]/opengraph-image"
        const route = "/" + rel.replace(/\/(route|page)\.(js|mjs|cjs)?\.?nft\.json$/, "");
        out.set(route, full);
      }
    }
  };
  walk(base);
  return out;
}

/**
 * Pure check over includes and traces so the test can use a fixture.
 * @param includes Record<routeGlob, string[]>
 * @param traces Map<route, nftJsonPath>
 */
export function checkTracing(root, includes, traces) {
  const errors = [];
  const cache = new Map();
  const filesFor = (route) => {
    if (!cache.has(route)) {
      const file = traces.get(route);
      const nft = JSON.parse(fs.readFileSync(file, "utf8"));
      const dir = path.dirname(file);
      // Paths in a .nft.json are relative to that file; normalise to repo-relative.
      cache.set(route, (nft.files ?? []).map((f) => path.relative(root, path.resolve(dir, f)).replace(/\\/g, "/")));
    }
    return cache.get(route);
  };

  for (const [keyGlob, patterns] of Object.entries(includes)) {
    const keyRe = globToRegExp(keyGlob);
    for (const pattern of patterns) {
      const re = globToRegExp(pattern.replace(/^\.\//, ""));
      // Deliberately search EVERY built route, not just the ones this key's glob
      // matches. Next resolves these keys with picomatch and this script must not
      // try to reimplement it: an earlier version did, disagreed with Next about a
      // literal `[...path]` segment, and both failed a healthy build and would have
      // passed a broken one. The incident being guarded against is an include that
      // reaches no lambda at all, so that — provable from the traces alone — is
      // what is asserted. The key glob is used only to describe the result.
      const carriers = [...traces.keys()].filter((route) => filesFor(route).some((f) => re.test(f)));
      if (carriers.length === 0) {
        const named = [...traces.keys()].filter((r) => keyRe.test(r));
        errors.push(
          `include "${pattern}" (key "${keyGlob}") is not traced into any of the ${traces.size} built ` +
            `routes, so the function that reads those files will 404 or 500 at request time. ` +
            (named.length
              ? `The key names ${named.slice(0, 4).join(", ")}${named.length > 4 ? ", …" : ""}; check that route's .nft.json.`
              : `The key also matches no built route by literal name — a dynamic segment in a key is ` +
                `read as a glob, so it may never match the route it names.`),
        );
      }
    }
  }
  return errors;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = DEFAULT_ROOT;
  const traces = listRouteTraces(root);
  if (traces.size === 0) {
    const msg = "no .next/server/app/**/*.nft.json found; run `next build` first.";
    if (process.argv.includes("--if-built")) {
      console.log(`tracing check skipped: ${msg}`);
      process.exit(0);
    }
    console.error(msg);
    process.exit(1);
  }
  const includes = await readIncludes(root);
  const errors = checkTracing(root, includes, traces);
  if (errors.length) {
    console.error(`\n${errors.length} tracing-include problem(s):\n`);
    for (const e of errors) console.error(`  - ${e}`);
    console.error("");
    process.exit(1);
  }
  console.log(`${Object.keys(includes).length} outputFileTracingIncludes key(s) verified against ${traces.size} built route trace(s).`);
}
