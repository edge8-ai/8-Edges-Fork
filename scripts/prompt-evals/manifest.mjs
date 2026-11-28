// Writes scripts/prompt-evals.json, the record check:prompt-evals reads (Z.6.1).
//
// Kept apart from the runner (./eval.mjs) because the runner needs the site
// eval's harness, which the public fork does not receive. Everything here
// needs only the gate, so the gate's own tests and a fork can use it.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_ROOT, MANIFEST_FILE, caseSites, loadPrompts, manifestEntries, readManifest, readManifestFile } from "../check-prompt-evals.mjs";

export const BASELINE_RESULT = "baseline, no cases";
export const SEEDED_WITH_CASES = "baseline, the site has exportable cases but none were run when the record was seeded";

const MANIFEST_COMMENT =
  "The evaluated version of every versioned prompt (kernel/ai/prompts.ts), by the file that declares it. check:prompt-evals fails when a prompt's current version is not the one recorded here, so a prompt edit lands with its eval. Written by `npm run eval:prompt` (scripts/prompt-evals/eval.mjs); never edit a version by hand.";

const today = () => new Date().toISOString().slice(0, 10);
export const siteOf = (name) => name.split("/")[0];

/**
 * Thrown instead of recording a baseline for a prompt whose site has eval
 * cases, unless the caller passed --no-cases-ok. A baseline records that no
 * eval ran, so on a site with cases it is the one record that could clear an
 * edit nobody evaluated; the flag makes that choice deliberate and visible.
 */
export class NoCasesRefused extends Error {
  constructor(name, why) {
    super(
      `eval:prompt: ${name}'s site has eval cases (scripts/site-eval), but ${why}, so no eval ran. ` +
        `Run its cases if you can; to record a baseline anyway, pass --no-cases-ok, which marks the record "noCasesOk": true for review.`,
    );
    this.name = "NoCasesRefused";
  }
}

/**
 * A baseline record: nothing was evaluated. `noCasesOk` is set when the site
 * has eval cases and someone chose, with --no-cases-ok, to record no run.
 */
export const baselineEntry = (version, result = BASELINE_RESULT, { noCasesOk = false } = {}) => ({
  version,
  status: "baseline",
  evaluatedAt: today(),
  cases: null,
  result,
  ...(noCasesOk ? { noCasesOk: true } : {}),
});

/** Writes the manifest with `entry` for `name` under `file`, dropping any older record of the name. */
export function recordEntry(root, file, name, entry) {
  const files = readManifest(root) ?? {};
  for (const byName of Object.values(files)) delete byName[name];
  (files[file] ??= {})[name] = entry;
  writeManifest(root, files);
}

export function writeManifest(root, files) {
  const sorted = {};
  for (const file of Object.keys(files).sort()) {
    const names = Object.keys(files[file]).sort();
    if (names.length) sorted[file] = Object.fromEntries(names.map((n) => [n, files[file][n]]));
  }
  // The hand-kept list of declared sites nothing calls is carried over as is.
  const uncalled = readManifestFile(root)?.sitesWithoutCalls;
  const body = { _comment: MANIFEST_COMMENT, ...(uncalled ? { sitesWithoutCalls: uncalled } : {}), files: sorted };
  mkdirSync(path.dirname(path.join(root, MANIFEST_FILE)), { recursive: true });
  writeFileSync(path.join(root, MANIFEST_FILE), `${JSON.stringify(body, null, 2)}\n`);
}

/**
 * Baselines for every prompt with no record. A prompt whose site has eval
 * cases is skipped, and listed in `refused`, unless `noCasesOk` is set, in
 * which case its record carries the flag. Returns the names recorded, the
 * names refused and the problems loading met; a prompt file that could not be
 * loaded is skipped, and the gate reports it either way.
 */
export async function seed(root = DEFAULT_ROOT, { noCasesOk = false } = {}) {
  const { errors, prompts } = await loadPrompts(root);
  const withCases = await caseSites(root);
  const files = readManifest(root) ?? {};
  const recorded = manifestEntries(files);
  const added = [];
  const refused = [];
  for (const p of prompts) {
    if (recorded.has(p.name)) continue;
    if (withCases.has(siteOf(p.name))) {
      if (!noCasesOk) {
        refused.push(p.name);
        continue;
      }
      (files[p.file] ??= {})[p.name] = baselineEntry(p.version, SEEDED_WITH_CASES, { noCasesOk: true });
    } else {
      (files[p.file] ??= {})[p.name] = baselineEntry(p.version);
    }
    added.push(p.name);
  }
  writeManifest(root, files);
  return { added, refused, errors };
}

/** Drops records of prompts no file declares. Returns the names dropped. */
export async function prune(root = DEFAULT_ROOT) {
  const { errors, prompts } = await loadPrompts(root);
  if (errors.length) throw new Error(`eval:prompt: fix these first:\n  ${errors.join("\n  ")}`);
  const live = new Set(prompts.map((p) => p.name));
  const files = readManifest(root) ?? {};
  const dropped = [];
  for (const byName of Object.values(files)) {
    for (const name of Object.keys(byName)) {
      if (!live.has(name)) {
        delete byName[name];
        dropped.push(name);
      }
    }
  }
  writeManifest(root, files);
  return dropped;
}
