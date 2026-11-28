// The eval gate on prompt paths (plan Part C2, card Z.6.1): fails when a
// prompt's current version has no recorded eval.
//
// Every model call sends a versioned prompt (kernel/ai/prompts.ts), and a
// prompt's version is a hash of its text. scripts/prompt-evals.json records,
// per prompt, the version that was last evaluated, against which cases, when,
// and with what result. Editing a prompt's text changes its version, so the
// edit fails this check until someone runs the prompt's eval and commits the
// new record:
//
//   npm run eval:prompt -- --prompt <name>
//
// The rules, over the same sources check:ai-routing scans (non-test .ts/.tsx
// under app/, entities/ and kernel/):
//
//  1. `definePrompt(` appears only in `*.prompt.ts` files, so this check sees
//     every prompt. (kernel/ai/prompts.ts, which defines it, is exempt.)
//  2. A `*.prompt.ts` file imports nothing but `@/kernel/ai/prompts`, so plain
//     node can load it to read each version without the app around it.
//  3. Prompt names are unique, and each belongs to a declared site: its name is
//     the site's, or `<site>/<variant>`. Every declared aiSite and
//     otherProviderCall site has at least one prompt, except a site the
//     manifest's `sitesWithoutCalls` names with the reason nothing calls it.
//  4. Every prompt is in the manifest, under the file that declares it, at its
//     current version, with a passing or baseline result; and the manifest
//     names no prompt that no longer exists.
//  5. A baseline (no eval ran) for a prompt whose site has eval cases carries
//     `"noCasesOk": true`, which only `eval:prompt --no-cases-ok` writes.
//
// The manifest is keyed by file, like scripts/ai-routing-baseline.json, so the
// public fork's copy can be pruned to the files it receives
// (.github/scripts/prune-baselines.mjs).

import fs from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DEFAULT_ROOT, declarationsIn, listSources, stripComments } from "./check-ai-routing.mjs";

export { DEFAULT_ROOT };

export const MANIFEST_FILE = "scripts/prompt-evals.json";
export const PROMPTS_MODULE = "kernel/ai/prompts.ts";

/** The results the gate accepts. A failed eval is never recorded (scripts/prompt-evals/eval.mjs). */
export const ACCEPTED_STATUSES = ["pass", "baseline"];

const PROMPT_FILE = /\.prompt\.ts$/;

/** How to clear a failure for one prompt: the line every message ends with. */
export const howToRecord = (name) =>
  `Run its eval and record it: \`npm run eval:prompt -- --prompt ${name}\` (it runs the site's stored eval cases, or records a baseline when the site has none), then commit ${MANIFEST_FILE}.`;

// Plain node cannot resolve the repo's `@/` alias. The hook maps `@/x` to
// `<root>/x.ts`, where root is the nearest ancestor of the importing file that
// holds kernel/ai/prompts.ts, so a fixture tree in a test resolves to its own
// copy. Registered once per process; rule 2 keeps what it resolves small.
let hooked = false;
function hookAlias() {
  if (hooked) return;
  hooked = true;
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (!specifier.startsWith("@/") || !context.parentURL?.startsWith("file:")) return nextResolve(specifier, context);
      let dir = path.dirname(fileURLToPath(context.parentURL));
      while (!fs.existsSync(path.join(dir, PROMPTS_MODULE))) {
        const up = path.dirname(dir);
        if (up === dir) return nextResolve(specifier, context);
        dir = up;
      }
      const rel = specifier.slice(2);
      const target = path.join(dir, /\.[cm]?[jt]s$/.test(rel) ? rel : `${rel}.ts`);
      return nextResolve(pathToFileURL(target).href, context);
    },
  });
}

/** The module specifiers a file imports or re-exports, type-only imports included. */
function importsOf(code) {
  const out = [];
  const re = /(?:^|[\s;])(?:import|export)\s+(?:type\s+)?(?:[\w*{}\s,$]+\s+from\s+)?["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(code))) out.push(m[1]);
  const dyn = /\bimport\(\s*["']([^"']+)["']\s*\)/g;
  while ((m = dyn.exec(code))) out.push(m[1]);
  return out;
}

/**
 * Every prompt the tree declares, read by importing each `*.prompt.ts` under
 * plain node. Returns the prompts and the problems found on the way (rules 1
 * to 3, except the site rule).
 */
export async function loadPrompts(root = DEFAULT_ROOT) {
  const errors = [];
  const prompts = [];
  const sources = listSources(root);
  for (const rel of sources) {
    if (rel === PROMPTS_MODULE || PROMPT_FILE.test(rel)) continue;
    const code = stripComments(fs.readFileSync(path.join(root, rel), "utf8"));
    if (/(?<![\w.])definePrompt\s*\(/.test(code)) {
      errors.push(`${rel}: declares a prompt outside a *.prompt.ts file, where ${MANIFEST_FILE}'s gate cannot see it; move it to a sibling .prompt.ts file.`);
    }
  }
  const files = sources.filter((rel) => PROMPT_FILE.test(rel));
  if (files.length) hookAlias();
  const { isPrompt } = files.length ? await import(pathToFileURL(path.join(root, PROMPTS_MODULE)).href) : { isPrompt: () => false };
  const byName = new Map();
  for (const rel of files) {
    const full = path.join(root, rel);
    const code = stripComments(fs.readFileSync(full, "utf8"));
    const stray = importsOf(code).filter((s) => s !== "@/kernel/ai/prompts");
    if (stray.length) {
      errors.push(`${rel}: a prompt file imports only "@/kernel/ai/prompts", so this check can load it without the app; it imports ${stray.join(", ")}.`);
      continue;
    }
    let mod;
    try {
      // The mtime in the query makes a file edited since the last import load
      // again, which only a long-lived process (a test) would notice.
      mod = await import(`${pathToFileURL(full).href}?t=${fs.statSync(full).mtimeMs}`);
    } catch (e) {
      errors.push(`${rel}: could not be loaded under plain node: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    for (const [exportName, value] of Object.entries(mod)) {
      if (!isPrompt(value)) continue;
      const seen = byName.get(value.name);
      if (seen) {
        errors.push(`${rel}: the prompt name ${value.name} is already declared in ${seen.file}; one name is one prompt and one eval record.`);
        continue;
      }
      const entry = { name: value.name, version: value.version, ref: value.ref, file: rel, exportName };
      byName.set(value.name, entry);
      prompts.push(entry);
    }
  }
  return { errors, prompts: prompts.sort((a, b) => a.name.localeCompare(b.name)) };
}

/** Every declared site name, from the declarations check:ai-routing reads. */
export function declaredSites(root = DEFAULT_ROOT) {
  const sites = new Map();
  for (const rel of listSources(root)) {
    if (rel.startsWith("kernel/ai/")) continue;
    for (const d of declarationsIn(fs.readFileSync(path.join(root, rel), "utf8"))) {
      if (d.site && !sites.has(d.site)) sites.set(d.site, rel);
    }
  }
  return sites;
}

/** Where the site eval lists the sites it can export cases for. */
export const CASE_SITES_MODULE = "scripts/site-eval/export-cases.mjs";

/**
 * The sites that have eval cases: the site eval's export list (Y.67.2). The
 * public fork does not receive the site eval, so there the set is empty and
 * the rule that reads it holds nothing back.
 */
export async function caseSites(root = DEFAULT_ROOT) {
  const file = path.join(root, CASE_SITES_MODULE);
  if (!fs.existsSync(file)) return new Set();
  const { SITES } = await import(pathToFileURL(file).href);
  return new Set(Array.isArray(SITES) ? SITES : []);
}

/** The whole manifest file, or null when there is none. */
export function readManifestFile(root = DEFAULT_ROOT) {
  const file = path.join(root, MANIFEST_FILE);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function readManifest(root = DEFAULT_ROOT) {
  const m = readManifestFile(root);
  return m === null ? null : (m.files ?? {});
}

/** The manifest's entries as name -> { file, entry }. */
export function manifestEntries(files) {
  const out = new Map();
  for (const [file, byName] of Object.entries(files ?? {})) {
    for (const [name, entry] of Object.entries(byName)) out.set(name, { file, entry });
  }
  return out;
}

export async function checkPromptEvals(root = DEFAULT_ROOT) {
  const { errors, prompts } = await loadPrompts(root);
  const sites = declaredSites(root);
  const siteOf = (name) => name.split("/")[0];

  // A site declared but never called has no prompt to send. The manifest names
  // each such site with the reason, so a site that lost its prompt by mistake
  // still fails, and an entry goes stale (and fails) once the site is called
  // or removed.
  const manifestFile = readManifestFile(root);
  const uncalled = manifestFile?.sitesWithoutCalls ?? {};

  const withPrompt = new Set(prompts.map((p) => siteOf(p.name)));
  for (const p of prompts) {
    if (!sites.has(siteOf(p.name))) {
      errors.push(`${p.file}: the prompt ${p.name} names no declared site; a prompt is named after the aiSite that sends it (<site> or <site>/<variant>).`);
    }
  }
  for (const [site, file] of sites) {
    if (!withPrompt.has(site) && !(site in uncalled)) {
      errors.push(`${file}: the site ${site} sends no versioned prompt; declare one in a sibling .prompt.ts file and pass it as the request's \`prompt\`.`);
    }
  }
  for (const site of Object.keys(uncalled)) {
    if (!sites.has(site)) errors.push(`${MANIFEST_FILE}: sitesWithoutCalls names ${site}, which no file declares any more; remove it.`);
    else if (withPrompt.has(site)) errors.push(`${MANIFEST_FILE}: sitesWithoutCalls names ${site}, which now has a prompt; remove it.`);
  }

  const files = manifestFile === null ? null : (manifestFile.files ?? {});
  if (files === null) {
    errors.push(`${MANIFEST_FILE} is missing; record every prompt with \`npm run eval:prompt -- --seed\`.`);
    return { errors, prompts };
  }
  const recorded = manifestEntries(files);
  const withCases = await caseSites(root);
  for (const p of prompts) {
    const r = recorded.get(p.name);
    if (!r) {
      errors.push(`${p.file}: the prompt ${p.name} (version ${p.version}) has no eval in ${MANIFEST_FILE}. ${howToRecord(p.name)}`);
    } else if (r.entry.version !== p.version) {
      errors.push(`${p.file}: the prompt ${p.name} is at version ${p.version}, but ${MANIFEST_FILE} last evaluated version ${r.entry.version}; its text changed since. ${howToRecord(p.name)}`);
    } else if (r.file !== p.file) {
      errors.push(`${p.file}: the prompt ${p.name} is recorded under ${r.file} in ${MANIFEST_FILE}. Its version is unchanged, so \`npm run eval:prompt -- --prompt ${p.name}\` moves the record without running anything.`);
    } else if (!ACCEPTED_STATUSES.includes(r.entry.status)) {
      errors.push(`${p.file}: the prompt ${p.name}'s recorded eval has status ${JSON.stringify(r.entry.status)}, not ${ACCEPTED_STATUSES.join(" or ")}. ${howToRecord(p.name)}`);
    } else if (r.entry.status === "baseline" && withCases.has(siteOf(p.name)) && r.entry.noCasesOk !== true) {
      // A baseline records that no eval ran. On a site with eval cases that is
      // the one record that could clear an unevaluated edit, so it must say
      // it was chosen (--no-cases-ok), where a reviewer sees it in the diff.
      errors.push(
        `${p.file}: the prompt ${p.name} is recorded as a baseline, but its site has eval cases (${CASE_SITES_MODULE}). ` +
          `Run them: \`npm run eval:prompt -- --prompt ${p.name}\`. To record a baseline anyway, add --no-cases-ok, which marks the record "noCasesOk": true.`,
      );
    }
  }
  const live = new Set(prompts.map((p) => p.name));
  for (const [name, r] of recorded) {
    if (!live.has(name)) errors.push(`${r.file}: ${MANIFEST_FILE} records the prompt ${name}, which no file declares any more; remove its entry (\`npm run eval:prompt -- --prune\`).`);
  }
  return { errors, prompts };
}

const invokedDirectly = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const at = process.argv.indexOf("--root");
  const root = at > 0 ? path.resolve(process.argv[at + 1]) : DEFAULT_ROOT;
  const { errors, prompts } = await checkPromptEvals(root);
  if (errors.length) {
    console.error(`check-prompt-evals: ${errors.length} problem(s):`);
    for (const e of errors) console.error(`  ${e}`);
    process.exit(1);
  }
  console.log(`check-prompt-evals: ${prompts.length} prompt(s), each at a version with a recorded eval.`);
}
